"""Estimates how much a scheduled event slows down a route.

There is no measured event-traffic data in this project, so this is a
transparent rule-based estimate, not a learned model:

- Peak delay grows with expected attendance (bigger crowd, more delay).
- It applies in full to roads within ~0.5 km of the venue and fades
  linearly to nothing at the venue's impact radius.
- Delay is highest while people arrive (90 min before start until 15 min
  after) and leave (from the end until 60 min after). In between, during the
  event itself, a smaller residual delay applies.

Every number the API returns is labelled as an estimate.
"""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.models import Event

ARRIVAL_BEFORE = timedelta(minutes=90)
ARRIVAL_AFTER = timedelta(minutes=15)
DISPERSAL_AFTER = timedelta(minutes=60)
RESIDUAL_SHARE = 0.35
FULL_EFFECT_KM = 0.5

# (attendance up to, peak delay in minutes on roads right next to the venue)
ATTENDANCE_DELAY: list[tuple[int, int]] = [
    (2_000, 3),
    (10_000, 8),
    (25_000, 15),
    (50_000, 22),
]
MAX_DELAY_MIN = 30


def peak_delay_min(attendance: int) -> int:
    for limit, delay in ATTENDANCE_DELAY:
        if attendance <= limit:
            return delay
    return MAX_DELAY_MIN


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _point_segment_km(
    lat: float, lon: float, a: tuple[float, float], b: tuple[float, float]
) -> float:
    """Distance from a point to segment a-b, on a local flat projection (fine at city scale)."""
    kx = 111.32 * math.cos(math.radians(lat))
    ky = 110.57
    ax, ay = (a[1] - lon) * kx, (a[0] - lat) * ky
    bx, by = (b[1] - lon) * kx, (b[0] - lat) * ky
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    t = 0.0 if seg2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / seg2))
    px, py = ax + t * dx, ay + t * dy
    return math.hypot(px, py)


def distance_to_route_km(lat: float, lon: float, geometry: list[tuple[float, float]]) -> float:
    if not geometry:
        return math.inf
    if len(geometry) == 1:
        return haversine_km(lat, lon, *geometry[0])
    return min(
        _point_segment_km(lat, lon, geometry[i], geometry[i + 1])
        for i in range(len(geometry) - 1)
    )


def proximity_factor(distance_km: float, radius_km: float) -> float:
    if distance_km > radius_km:
        return 0.0
    if distance_km <= FULL_EFFECT_KM or radius_km <= FULL_EFFECT_KM:
        return 1.0
    span = (distance_km - FULL_EFFECT_KM) / (radius_km - FULL_EFFECT_KM)
    return 1.0 - span


@dataclass
class ImpactWindow:
    start: datetime
    end: datetime
    delay_min: float
    phase: str  # "arrival", "during", "dispersal"


def impact_windows(event: Event, proximity: float) -> list[ImpactWindow]:
    peak = peak_delay_min(event.expected_attendance) * proximity
    arrival_end = event.starts_at + ARRIVAL_AFTER
    windows = [ImpactWindow(event.starts_at - ARRIVAL_BEFORE, arrival_end, peak, "arrival")]
    if event.ends_at > arrival_end:
        windows.append(ImpactWindow(arrival_end, event.ends_at, peak * RESIDUAL_SHARE, "during"))
    windows.append(ImpactWindow(event.ends_at, event.ends_at + DISPERSAL_AFTER, peak, "dispersal"))
    return [w for w in windows if w.delay_min > 0]


def delay_during(windows: list[ImpactWindow], start: datetime, end: datetime) -> float:
    """Worst delay among windows overlapping the trip [start, end]."""
    overlapping = [w.delay_min for w in windows if w.start < end and w.end > start]
    return max(overlapping, default=0.0)
