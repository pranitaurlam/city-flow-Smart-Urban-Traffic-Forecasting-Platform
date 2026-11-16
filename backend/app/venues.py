"""Major Bengaluru event venues.

Coordinates come from OpenStreetMap (Nominatim). Capacities are approximate
public figures and only serve as the default attendance when an event
doesn't give one.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Venue

# slug, name, lat, lon, capacity, impact radius (km)
VENUES: list[tuple[str, str, float, float, int, float]] = [
    ("palace-grounds", "Palace Grounds", 13.00222, 77.58608, 50000, 3.0),
    ("chinnaswamy-stadium", "M. Chinnaswamy Stadium", 12.97881, 77.59958, 40000, 3.0),
    ("kanteerava-stadium", "Sree Kanteerava Stadium", 12.96935, 77.59266, 25000, 2.5),
    ("kanteerava-indoor-stadium", "Sree Kanteerava Indoor Stadium", 12.96881, 77.59127, 4000, 1.5),
    ("jayamahal-palace", "Jayamahal Palace Grounds", 12.99657, 77.59705, 10000, 2.0),
    ("biec", "Bangalore International Exhibition Centre (BIEC)", 13.06033, 77.47474, 30000, 3.0),
    ("ktpo-whitefield", "KTPO Whitefield", 12.97715, 77.72148, 10000, 2.0),
    ("phoenix-marketcity", "Phoenix Marketcity Whitefield", 12.99773, 77.69665, 8000, 1.5),
    ("manpho-convention-centre", "Manpho Convention Centre", 13.04217, 77.61696, 10000, 2.0),
    ("embassy-riding-school", "Embassy International Riding School", 13.17271, 77.59337, 30000, 3.0),
    ("koramangala-indoor-stadium", "Koramangala Indoor Stadium", 12.94343, 77.62279, 2000, 1.5),
    ("football-stadium", "Bangalore Football Stadium", 12.96894, 77.61150, 8400, 2.0),
    ("freedom-park", "Freedom Park", 12.97748, 77.58216, 10000, 1.5),
    ("phoenix-mall-of-asia", "Phoenix Mall of Asia", 13.07094, 77.59030, 8000, 1.5),
    ("chowdiah-memorial-hall", "Chowdiah Memorial Hall", 13.00654, 77.57561, 1000, 1.0),
]


def upsert_venues(session: Session) -> int:
    """Insert missing venues and refresh known ones. Never touches events."""
    existing = {v.slug: v for v in session.scalars(select(Venue))}
    for slug, name, lat, lon, capacity, radius in VENUES:
        venue = existing.get(slug) or Venue(slug=slug)
        venue.name, venue.lat, venue.lon = name, lat, lon
        venue.capacity, venue.impact_radius_km = capacity, radius
        session.add(venue)
    session.commit()
    return len(VENUES)
