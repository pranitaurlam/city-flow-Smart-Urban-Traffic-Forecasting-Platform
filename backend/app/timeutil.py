"""Event times are stored as naive UTC. Input without a timezone is read as
Bengaluru local time, since that's how event listings show it."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

CITY_TZ = ZoneInfo("Asia/Kolkata")


def to_utc_naive(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=CITY_TZ)
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def from_utc_naive(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc)
