"""Turns event listings copied from BookMyShow into importable event rows.

BookMyShow publishes no public API and its listing pages sit behind bot
protection (a plain request to /explore/events-bengaluru returns 403), so there
is no automatic feed. Instead a commuter opens the page, copies it, and pastes
the text in; this module reads that paste.

A copied card looks roughly like:

    Arijit Singh Live In Concert
    Sat, 6 Dec, 7:00 PM
    Palace Grounds, Bengaluru
    ₹1,500 onwards

The exact lines vary, so the parser anchors on the date line, reads the title
above it and the venue below, and reports anything it cannot place rather than
guessing. Dates carry no year on BookMyShow, so the next occurrence is assumed.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

# Lines that are page chrome rather than event detail.
NOISE = re.compile(
    r"^(₹|rs\.?\s*\d|from\s*₹|filters?|sort|share|interested|book(ing)?|buy|explore|"
    r"see all|view all|more|categories|date|price|language|all events|home|sign in|"
    r"log ?in|download|offers?|gift ?card|list your show|advertise|about|contact|"
    r"terms|privacy|faq|\d+\s*(likes?|interested)|follow)",
    re.IGNORECASE,
)

WEEKDAYS = r"(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*"
MONTH_RE = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*"

# "Sat, 6 Dec, 7:00 PM" / "6 Dec" / "Fri 12 December 2026" / "6 Dec - 8 Dec"
DATE_RE = re.compile(
    rf"(?:(?P<weekday>{WEEKDAYS})\s*,?\s*)?"
    rf"(?P<day>\d{{1,2}})\s*(?:st|nd|rd|th)?\s*(?P<month>{MONTH_RE})"
    rf"(?:\s*,?\s*(?P<year>20\d{{2}}))?",
    re.IGNORECASE,
)
RELATIVE_RE = re.compile(r"\b(today|tomorrow)\b", re.IGNORECASE)
TIME_RE = re.compile(r"\b(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*(?P<ampm>am|pm)\b", re.IGNORECASE)
TIME_24_RE = re.compile(r"\b(?P<hour>[01]?\d|2[0-3]):(?P<minute>[0-5]\d)\b")

# Title keyword -> (category, typical duration in hours)
CATEGORY_RULES: list[tuple[re.Pattern[str], str, float]] = [
    (re.compile(r"\b(comedy|stand[- ]?up|open mic|improv)\b", re.I), "comedy", 2.0),
    (re.compile(r"\b(fc|vs\.?|match|cricket|football|premier league|derby|marathon|run)\b", re.I), "sports", 3.5),
    (re.compile(r"\b(expo|fair|exhibition|summit|conference|meet ?up|hackathon)\b", re.I), "expo", 8.0),
    (re.compile(r"\b(festival|fest|carnival|sunburn|nh7)\b", re.I), "festival", 6.0),
    (re.compile(r"\b(concert|live|tour|unplugged|music|symphony|orchestra|dj|gig|night)\b", re.I), "concert", 3.0),
]
DEFAULT_CATEGORY = "other"
DEFAULT_DURATION_H = 3.0
# BookMyShow usually prints a start time; these are the fallbacks for date-only
# cards, where an evening default would run a daytime expo past midnight.
DEFAULT_START_HOUR = {"expo": 10, "festival": 16, "sports": 19}
FALLBACK_START_HOUR = 19


@dataclass
class ParsedEvent:
    """One card read out of the paste. `venue_slug` is None until it is matched."""

    title: str
    category: str
    starts_at: datetime
    ends_at: datetime
    venue_text: str
    venue_slug: str | None = None
    venue_name: str | None = None
    issues: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.venue_slug is not None


def _clean(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r"[ \t ]+", " ", text).strip(" •-|·,")


def _usable_lines(text: str) -> list[str]:
    lines = []
    for raw in text.splitlines():
        line = _clean(raw)
        if not line or NOISE.match(line):
            continue
        lines.append(line)
    return lines


def _looks_like_date(line: str) -> bool:
    return bool(DATE_RE.search(line) or RELATIVE_RE.search(line))


def _parse_time(line: str) -> tuple[int, int] | None:
    m = TIME_RE.search(line)
    if m:
        hour = int(m.group("hour")) % 12
        if m.group("ampm").lower() == "pm":
            hour += 12
        return hour, int(m.group("minute") or 0)
    m = TIME_24_RE.search(line)
    if m:
        return int(m.group("hour")), int(m.group("minute"))
    return None


WEEKDAY_INDEX = {
    "mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6,
}


def _parse_date(line: str, today: date) -> date | None:
    rel = RELATIVE_RE.search(line)
    if rel:
        return today + timedelta(days=1 if rel.group(1).lower() == "tomorrow" else 0)

    m = DATE_RE.search(line)
    if not m:
        return None
    month = MONTHS.get(m.group("month")[:3].lower())
    if month is None:
        return None
    day = int(m.group("day"))
    year = int(m.group("year")) if m.group("year") else today.year
    try:
        parsed = date(year, month, day)
    except ValueError:
        return None
    if m.group("year"):
        return parsed

    # BookMyShow omits the year on near-term cards, so take the next occurrence.
    # A printed weekday refines which year that is, but must never discard the
    # card: listings do carry the odd wrong weekday, and dropping the event
    # silently would be worse than being a year out.
    candidates = []
    for candidate_year in (year, year + 1, year + 2):
        try:
            candidate = date(candidate_year, month, day)
        except ValueError:
            continue
        if candidate >= today:
            candidates.append(candidate)
    if not candidates:
        return None

    want = WEEKDAY_INDEX.get((m.group("weekday") or "")[:3].lower())
    if want is not None:
        for candidate in candidates:
            if candidate.weekday() == want:
                return candidate
    return candidates[0]


def _categorise(title: str) -> tuple[str, float]:
    for pattern, category, hours in CATEGORY_RULES:
        if pattern.search(title):
            return category, hours
    return DEFAULT_CATEGORY, DEFAULT_DURATION_H


def _venue_key(name: str) -> str:
    name = _clean(name).lower()
    name = re.sub(r",?\s*(bengaluru|bangalore|india)\b", "", name)
    name = re.sub(r"\b(the|at|grounds?|ground)\b", " ", name)
    return re.sub(r"[^a-z0-9]+", " ", name).strip()


def match_venue(venue_text: str, venues: list[tuple[str, str]]) -> tuple[str, str] | None:
    """Best (slug, name) for a pasted venue line, or None.

    `venues` is (slug, name) pairs. Matching is exact on a normalised key, then
    containment, then shared-word overlap, so "Palace Grounds, Bengaluru"
    reaches "Palace Grounds" and "BIEC" reaches the full exhibition-centre name.
    """
    key = _venue_key(venue_text)
    if not key:
        return None

    keyed = [(slug, name, _venue_key(name)) for slug, name in venues]
    for slug, name, vkey in keyed:
        if vkey and vkey == key:
            return slug, name
    for slug, name, vkey in keyed:
        if vkey and (vkey in key or key in vkey):
            return slug, name

    words = set(key.split())
    best: tuple[int, str, str] | None = None
    for slug, name, vkey in keyed:
        shared = len(words & set(vkey.split()))
        if shared and (best is None or shared > best[0]):
            best = (shared, slug, name)
    if best and best[0] >= 2:
        return best[1], best[2]
    # A bare acronym such as "BIEC" or "KTPO" appears inside the venue slug.
    if len(key) <= 6 and " " not in key:
        for slug, name, _ in keyed:
            if key in slug.replace("-", ""):
                return slug, name
    return None


def parse_listing(
    text: str,
    venues: list[tuple[str, str]],
    today: date | None = None,
) -> list[ParsedEvent]:
    """Read a BookMyShow paste into event rows, in listing order.

    Anchors on each date line: the nearest line above is the title, the nearest
    line below is the venue. Cards without a usable date are skipped, since a
    traffic estimate needs a time.
    """
    today = today or datetime.now().date()
    lines = _usable_lines(text)
    events: list[ParsedEvent] = []
    used: set[int] = set()

    for i, line in enumerate(lines):
        if not _looks_like_date(line):
            continue
        day = _parse_date(line, today)
        if day is None:
            continue

        title_idx = next((j for j in range(i - 1, -1, -1) if j not in used and not _looks_like_date(lines[j])), None)
        if title_idx is None:
            continue
        title = lines[title_idx]
        if len(title) < 2:
            continue

        venue_idx = next((j for j in range(i + 1, len(lines)) if not _looks_like_date(lines[j])), None)
        venue_text = lines[venue_idx] if venue_idx is not None else ""

        category, hours = _categorise(title)
        hour_minute = _parse_time(line) or (_parse_time(lines[i + 1]) if i + 1 < len(lines) else None)
        issues: list[str] = []
        if hour_minute is None:
            fallback = DEFAULT_START_HOUR.get(category, FALLBACK_START_HOUR)
            hour_minute = (fallback, 0)
            issues.append(f"no start time on the listing, assumed {fallback}:00")

        starts_at = datetime(day.year, day.month, day.day, hour_minute[0], hour_minute[1])
        event = ParsedEvent(
            title=title[:200],
            category=category,
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=hours),
            venue_text=venue_text,
            issues=issues,
        )

        match = match_venue(venue_text, venues) if venue_text else None
        if match:
            event.venue_slug, event.venue_name = match
        else:
            event.issues.append(
                f"venue '{venue_text}' is not a tracked venue" if venue_text else "no venue on the listing"
            )

        used.update({title_idx, i} | ({venue_idx} if venue_idx is not None else set()))
        events.append(event)

    return events
