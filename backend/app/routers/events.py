"""Venues, scheduled events, and their estimated impact on a route.

Events are entered by hand or imported from CSV (e.g. listings copied from
BookMyShow); there's no automatic feed. See app/event_impact.py for how the
delay estimate works.
"""

import csv
import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app import event_impact
from app.auth import require_admin
from app.bookmyshow import parse_listing
from app.db import get_session
from app.models import Event, Venue
from app.schemas import (
    EventIn,
    EventOnRoute,
    EventOut,
    ImpactWindowOut,
    ImportResult,
    ParsedEventOut,
    PasteImportIn,
    PasteImportResult,
    RouteImpact,
    RouteImpactRequest,
    RouteImpactResponse,
    VenueIn,
    VenueOut,
)
from app.seed import slugify
from app.timeutil import CITY_TZ, from_utc_naive, to_utc_naive

router = APIRouter(prefix="/api", tags=["events"])
admin = [Depends(require_admin)]

CSV_COLUMNS = ["venue", "title", "category", "starts_at", "ends_at", "expected_attendance", "url"]


def venue_out(v: Venue) -> VenueOut:
    return VenueOut(
        slug=v.slug,
        name=v.name,
        lat=v.lat,
        lon=v.lon,
        capacity=v.capacity,
        impact_radius_km=v.impact_radius_km,
    )


def event_out(e: Event) -> EventOut:
    return EventOut(
        id=e.id,
        venue=venue_out(e.venue),
        title=e.title,
        category=e.category,
        starts_at=from_utc_naive(e.starts_at),
        ends_at=from_utc_naive(e.ends_at),
        expected_attendance=e.expected_attendance,
        url=e.url,
        peak_delay_min=event_impact.peak_delay_min(e.expected_attendance),
    )


def _venue_by_slug(session: Session, slug: str) -> Venue:
    venue = session.scalar(select(Venue).where(Venue.slug == slug))
    if venue is None:
        raise HTTPException(status_code=422, detail=f"Unknown venue '{slug}'")
    return venue


def _apply(event: Event, data: EventIn, venue: Venue) -> Event:
    event.venue = venue
    event.title = data.title.strip()
    event.category = data.category
    event.starts_at = data.starts_at
    event.ends_at = data.ends_at
    event.expected_attendance = data.expected_attendance or venue.capacity
    event.url = data.url.strip() if data.url else None
    return event


# --- venues ---------------------------------------------------------------


@router.get("/venues", response_model=list[VenueOut])
def list_venues(session: Session = Depends(get_session)):
    return [venue_out(v) for v in session.scalars(select(Venue).order_by(Venue.name))]


@router.post("/venues", response_model=VenueOut, status_code=201, dependencies=admin)
def create_venue(data: VenueIn, session: Session = Depends(get_session)):
    slug = slugify(data.name)
    if session.scalar(select(Venue).where(Venue.slug == slug)):
        raise HTTPException(status_code=409, detail=f"Venue '{slug}' already exists")
    venue = Venue(slug=slug, **data.model_dump())
    session.add(venue)
    session.commit()
    return venue_out(venue)


# --- events ---------------------------------------------------------------


@router.get("/events", response_model=list[EventOut])
def list_events(
    start: datetime | None = Query(None, description="Default: now"),
    end: datetime | None = Query(None, description="Default: start + 30 days"),
    venue: str | None = None,
    session: Session = Depends(get_session),
):
    """Events that overlap [start, end], soonest first."""
    start_utc = to_utc_naive(start) if start else datetime.now(timezone.utc).replace(tzinfo=None)
    end_utc = to_utc_naive(end) if end else start_utc + timedelta(days=30)
    query = (
        select(Event)
        .options(joinedload(Event.venue))
        .where(Event.ends_at > start_utc, Event.starts_at < end_utc)
        .order_by(Event.starts_at)
    )
    if venue:
        query = query.join(Venue).where(Venue.slug == venue)
    return [event_out(e) for e in session.scalars(query)]


@router.get("/events/{event_id}", response_model=EventOut)
def get_event(event_id: int, session: Session = Depends(get_session)):
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return event_out(event)


@router.post("/events", response_model=EventOut, status_code=201, dependencies=admin)
def create_event(data: EventIn, session: Session = Depends(get_session)):
    event = _apply(Event(), data, _venue_by_slug(session, data.venue))
    session.add(event)
    session.commit()
    return event_out(event)


@router.put("/events/{event_id}", response_model=EventOut, dependencies=admin)
def update_event(event_id: int, data: EventIn, session: Session = Depends(get_session)):
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    _apply(event, data, _venue_by_slug(session, data.venue))
    session.commit()
    return event_out(event)


@router.delete("/events/{event_id}", status_code=204, dependencies=admin)
def delete_event(event_id: int, session: Session = Depends(get_session)):
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    session.delete(event)
    session.commit()
    return Response(status_code=204)


@router.post("/events/import", response_model=ImportResult, status_code=201, dependencies=admin)
def import_events(
    csv_text: str = Body(..., media_type="text/csv"),
    session: Session = Depends(get_session),
):
    """Bulk-add events from CSV. All rows are validated first; nothing is saved
    unless every row is valid, so a fixed file can simply be re-uploaded.

    Columns: venue (slug or exact name), title, category, starts_at, ends_at,
    expected_attendance (optional), url (optional). Times like
    "2026-12-05 18:00" are read as Bengaluru time.
    """
    reader = csv.DictReader(io.StringIO(csv_text.lstrip("﻿")))
    missing = {"venue", "title", "starts_at", "ends_at"} - set(reader.fieldnames or [])
    if missing:
        raise HTTPException(
            status_code=422, detail=f"Missing column(s): {', '.join(sorted(missing))}"
        )

    venues = list(session.scalars(select(Venue)))
    by_key = {v.slug: v for v in venues} | {v.name.lower(): v for v in venues}
    parsed: list[tuple[EventIn, Venue]] = []
    errors: list[str] = []
    for line, row in enumerate(reader, start=2):
        raw = {k: (v or "").strip() for k, v in row.items() if k}
        if not any(raw.values()):
            continue
        venue = by_key.get(raw.get("venue", "").lower()) or by_key.get(slugify(raw.get("venue", "")))
        if venue is None:
            errors.append(f"line {line}: unknown venue '{raw.get('venue')}'")
            continue
        try:
            data = EventIn(
                venue=venue.slug,
                title=raw.get("title", ""),
                category=raw.get("category") or "other",
                starts_at=raw.get("starts_at"),
                ends_at=raw.get("ends_at"),
                expected_attendance=raw.get("expected_attendance") or None,
                url=raw.get("url") or None,
            )
        except ValidationError as exc:
            reasons = "; ".join(e["msg"] for e in exc.errors())
            errors.append(f"line {line}: {reasons}")
            continue
        parsed.append((data, venue))

    if errors:
        raise HTTPException(status_code=422, detail=errors[:50])
    for data, venue in parsed:
        session.add(_apply(Event(), data, venue))
    session.commit()
    return ImportResult(created=len(parsed))


@router.post(
    "/events/import/bookmyshow",
    response_model=PasteImportResult,
    status_code=200,
    dependencies=admin,
)
def import_from_bookmyshow(
    payload: PasteImportIn,
    session: Session = Depends(get_session),
):
    """Read events out of text copied from BookMyShow's Bengaluru listing.

    BookMyShow has no public API and 403s automated requests, so the listing is
    pasted in rather than fetched. Defaults to a dry run: the parsed rows come
    back for review and nothing is saved until `dry_run` is false. Rows whose
    venue is not one of the tracked venues are reported and never saved, since
    the delay estimate needs the venue's location and capacity.
    """
    venues = list(session.scalars(select(Venue)))
    parsed = parse_listing(
        payload.text,
        [(v.slug, v.name) for v in venues],
        today=datetime.now(CITY_TZ).date(),
    )
    by_slug = {v.slug: v for v in venues}
    # The same listing gets pasted again as it is refreshed, so match what is
    # already stored and leave it alone rather than stacking up copies.
    existing = {
        (e.venue_id, e.title.strip().lower(), e.starts_at)
        for e in session.scalars(select(Event))
    }

    rows: list[ParsedEventOut] = []
    to_save: list[tuple[EventIn, Venue]] = []
    duplicates = 0
    for item in parsed:
        venue = by_slug.get(item.venue_slug) if item.venue_slug else None
        issues = list(item.issues)
        attendance = venue.capacity if venue else None
        if venue is not None:
            try:
                data = EventIn(
                    venue=venue.slug,
                    title=item.title,
                    category=item.category,
                    starts_at=item.starts_at,
                    ends_at=item.ends_at,
                    url=payload.source_url,
                )
            except ValidationError as exc:
                issues.extend(e["msg"] for e in exc.errors())
                venue = None
            else:
                key = (venue.id, data.title.strip().lower(), data.starts_at)
                if key in existing:
                    duplicates += 1
                    issues.append("already in CityFlow, left as it is")
                else:
                    existing.add(key)
                    to_save.append((data, venue))

        rows.append(
            ParsedEventOut(
                title=item.title,
                category=item.category,
                starts_at=from_utc_naive(to_utc_naive(item.starts_at)),
                ends_at=from_utc_naive(to_utc_naive(item.ends_at)),
                expected_attendance=attendance,
                venue_text=item.venue_text,
                venue=venue.slug if venue else None,
                venue_name=venue.name if venue else None,
                issues=issues,
            )
        )

    created = 0
    if not payload.dry_run and to_save:
        for data, venue in to_save:
            session.add(_apply(Event(), data, venue))
        session.commit()
        created = len(to_save)

    return PasteImportResult(
        events=rows,
        created=created,
        skipped=len(rows) - len(to_save) - duplicates,
        duplicates=duplicates,
        dry_run=payload.dry_run,
    )


# --- route impact ---------------------------------------------------------


@router.post("/events/route-impact", response_model=RouteImpactResponse)
def route_impact(req: RouteImpactRequest, session: Session = Depends(get_session)):
    """For each route, the events whose venue is near it and whose traffic
    impact overlaps [window_start, window_end], with estimated delays."""
    # Widen the search so events whose arrival/dispersal traffic spills into
    # the window are found even if the event itself is outside it.
    lead = event_impact.ARRIVAL_BEFORE
    tail = event_impact.DISPERSAL_AFTER
    candidates = list(
        session.scalars(
            select(Event)
            .options(joinedload(Event.venue))
            .where(Event.starts_at < req.window_end + lead)
            .where(Event.ends_at > req.window_start - tail)
            .order_by(Event.starts_at)
        )
    )

    results = []
    for route in req.routes:
        on_route = []
        for event in candidates:
            venue = event.venue
            distance = event_impact.distance_to_route_km(venue.lat, venue.lon, route.geometry)
            proximity = event_impact.proximity_factor(distance, venue.impact_radius_km)
            if proximity == 0:
                continue
            windows = event_impact.impact_windows(event, proximity)
            delay = event_impact.delay_during(windows, req.window_start, req.window_end)
            if delay == 0:
                continue
            on_route.append(
                EventOnRoute(
                    event=event_out(event),
                    distance_km=round(distance, 2),
                    delay_min=round(delay, 1),
                    windows=[
                        ImpactWindowOut(
                            start=from_utc_naive(w.start),
                            end=from_utc_naive(w.end),
                            delay_min=round(w.delay_min, 1),
                            phase=w.phase,
                        )
                        for w in windows
                    ],
                )
            )
        results.append(
            RouteImpact(
                id=route.id,
                events=on_route,
                delay_min=round(sum(e.delay_min for e in on_route), 1),
            )
        )
    return RouteImpactResponse(routes=results)
