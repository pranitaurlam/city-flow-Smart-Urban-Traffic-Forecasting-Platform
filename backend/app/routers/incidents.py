"""Commuter incident reports: a blocked or badly congested road, with a photo.

Every report must carry a photo. The photo is checked by a vision model
(app/image_check.py) and the report is only stored, and only shown to other
drivers, when the photo looks like a genuine picture of a blocked road.
Without a configured photo check, reports are refused. Reports expire on
their own.
"""

import base64
import binascii
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import image_check
from app.client_ip import client_ip
from app.db import get_session
from app.models import IncidentReport
from app.schemas import IncidentIn, IncidentOut
from app.timeutil import from_utc_naive

router = APIRouter(prefix="/api", tags=["incidents"])

# Reports expire so a cleared blockage doesn't keep warning people.
REPORT_TTL = timedelta(hours=3)
MAX_IMAGE_BYTES = 5 * 1024 * 1024

# Each report costs a model call, so cap how many one client can send.
RATE_LIMIT = 5
RATE_WINDOW_S = 10 * 60
_recent_reports: dict[str, deque[float]] = defaultdict(deque)


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _check_rate_limit(client_id: str) -> None:
    now = time.monotonic()
    recent = _recent_reports[client_id]
    while recent and now - recent[0] > RATE_WINDOW_S:
        recent.popleft()
    if len(recent) >= RATE_LIMIT:
        raise HTTPException(429, "Too many reports from this device. Try again in a few minutes.")
    recent.append(now)


def incident_out(r: IncidentReport) -> IncidentOut:
    return IncidentOut(
        id=r.id,
        lat=r.lat,
        lon=r.lon,
        road_hint=r.road_hint,
        type=r.type,
        note=r.note,
        status=r.status,
        severity=r.severity,
        photo_summary=r.photo_summary,
        reported_at=from_utc_naive(r.reported_at),
        expires_at=from_utc_naive(r.expires_at),
    )


@router.get("/incidents", response_model=list[IncidentOut])
def list_incidents(session: Session = Depends(get_session)):
    """Verified reports that haven't expired yet, newest first."""
    rows = session.scalars(
        select(IncidentReport)
        .where(IncidentReport.expires_at > _utcnow_naive())
        .where(IncidentReport.status == "verified")
        .order_by(IncidentReport.reported_at.desc())
    )
    return [incident_out(r) for r in rows]


@router.post("/incidents", response_model=IncidentOut, status_code=201)
def report_incident(
    body: IncidentIn, request: Request, session: Session = Depends(get_session)
):
    try:
        image = base64.b64decode(body.image_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "The photo could not be read. Please upload it again.")
    if not image:
        raise HTTPException(400, "A photo of the blockage is required.")
    if len(image) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "The photo is too large. Please upload one under 5 MB.")

    _check_rate_limit(client_ip(request))

    note = body.note.strip() if body.note and body.note.strip() else None
    try:
        verdict = image_check.analyze(image, body.image_media_type, body.type, note)
    except image_check.VerifierNotConfigured:
        raise HTTPException(
            503, "Photo checking isn't set up on this server, so reports can't be accepted yet."
        )
    except image_check.VerifierError as e:
        raise HTTPException(503, str(e))
    if not verdict.accepted:
        if not verdict.is_road_scene:
            why = "The photo doesn't show a road."
        elif not verdict.appears_genuine:
            why = "The photo doesn't look like a real picture taken at the scene."
        else:
            why = "The photo doesn't show a blockage or heavy congestion."
        raise HTTPException(422, f"Report not accepted. {why} {verdict.reason}".strip())

    now = _utcnow_naive()
    report = IncidentReport(
        lat=body.lat,
        lon=body.lon,
        road_hint=body.road_hint.strip(),
        type=body.type,
        note=note,
        status="verified",
        severity=verdict.severity,
        photo_summary=verdict.reason[:500],
        reported_at=now,
        expires_at=now + REPORT_TTL,
    )
    session.add(report)
    session.commit()
    return incident_out(report)
