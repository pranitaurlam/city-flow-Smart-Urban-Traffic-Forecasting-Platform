"""Venues, event CRUD/import, and route-impact estimates."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app import event_impact
from app.db import Base, get_session, make_engine
from app.main import app
from app.venues import upsert_venues

# Chinnaswamy Stadium is at (12.97881, 77.59958).
THROUGH_CHINNASWAMY = [[12.9700, 77.5996], [12.9788, 77.5996], [12.9880, 77.5996]]
# A parallel road ~5.5 km east, well outside the 3 km impact radius.
FAR_EAST = [[12.9700, 77.6500], [12.9788, 77.6500], [12.9880, 77.6500]]
# ~1.5 km east of the stadium: inside the radius, but with reduced effect.
NEAR_EAST = [[12.9700, 77.6134], [12.9788, 77.6134], [12.9880, 77.6134]]

CONCERT = {
    "venue": "chinnaswamy-stadium",
    "title": "Test Concert",
    "category": "concert",
    "starts_at": "2026-12-05T19:00:00",  # IST, no offset
    "ends_at": "2026-12-05T22:00:00",
    "expected_attendance": 40000,
}


@pytest.fixture()
def client(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'events.db'}")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    with Session() as session:
        upsert_venues(session)

    def override():
        with Session() as session:
            yield session

    app.dependency_overrides[get_session] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


def impact(client, routes, start, end):
    r = client.post(
        "/api/events/route-impact",
        json={
            "routes": [{"id": k, "geometry": g} for k, g in routes.items()],
            "window_start": start,
            "window_end": end,
        },
    )
    assert r.status_code == 200, r.text
    return {route["id"]: route for route in r.json()["routes"]}


def test_venues_seeded(client):
    slugs = {v["slug"] for v in client.get("/api/venues").json()}
    assert {"palace-grounds", "chinnaswamy-stadium", "biec"} <= slugs


def test_create_event_reads_naive_time_as_ist(client):
    r = client.post("/api/events", json=CONCERT)
    assert r.status_code == 201, r.text
    body = r.json()
    # 19:00 IST is 13:30 UTC.
    assert body["starts_at"].startswith("2026-12-05T13:30:00")
    assert body["venue"]["name"] == "M. Chinnaswamy Stadium"
    assert body["peak_delay_min"] == 22


def test_attendance_defaults_to_venue_capacity(client):
    body = client.post("/api/events", json={**CONCERT, "expected_attendance": None}).json()
    assert body["expected_attendance"] == 40000


@pytest.mark.parametrize(
    "patch, status",
    [
        ({"venue": "nowhere"}, 422),
        ({"ends_at": "2026-12-05T18:00:00"}, 422),
        ({"expected_attendance": -5}, 422),
        ({"category": "rave"}, 422),
    ],
)
def test_create_event_validation(client, patch, status):
    assert client.post("/api/events", json={**CONCERT, **patch}).status_code == status


def test_update_and_delete_event(client):
    event_id = client.post("/api/events", json=CONCERT).json()["id"]
    r = client.put(f"/api/events/{event_id}", json={**CONCERT, "title": "Renamed"})
    assert r.json()["title"] == "Renamed"
    assert client.delete(f"/api/events/{event_id}").status_code == 204
    assert client.get(f"/api/events/{event_id}").status_code == 404


def test_list_events_filters_by_range(client):
    client.post("/api/events", json=CONCERT)
    inside = client.get(
        "/api/events", params={"start": "2026-12-05T00:00:00", "end": "2026-12-06T00:00:00"}
    ).json()
    outside = client.get(
        "/api/events", params={"start": "2026-12-07T00:00:00", "end": "2026-12-08T00:00:00"}
    ).json()
    assert len(inside) == 1 and outside == []


def test_csv_import_all_or_nothing(client):
    good = (
        "venue,title,category,starts_at,ends_at,expected_attendance,url\n"
        "Palace Grounds,Big Gig,concert,2026-12-06 18:00,2026-12-06 23:00,45000,\n"
        "chinnaswamy-stadium,Match,sports,2026-12-07 19:30,2026-12-07 23:00,,\n"
    )
    bad = good + "Atlantis Arena,Ghost Show,concert,2026-12-08 18:00,2026-12-08 21:00,,\n"

    r = client.post("/api/events/import", content=bad, headers={"content-type": "text/csv"})
    assert r.status_code == 422
    assert "line 4" in r.text
    assert client.get("/api/events", params={"start": "2026-12-01T00:00:00"}).json() == []

    r = client.post("/api/events/import", content=good, headers={"content-type": "text/csv"})
    assert r.status_code == 201 and r.json()["created"] == 2


def test_route_through_venue_gets_peak_delay_at_arrival_time(client):
    client.post("/api/events", json=CONCERT)
    # Driving past at 18:00 IST, inside the arrival rush (17:30–19:15).
    routes = impact(
        client,
        {"through": THROUGH_CHINNASWAMY, "far": FAR_EAST, "near": NEAR_EAST},
        "2026-12-05T18:00:00+05:30",
        "2026-12-05T18:40:00+05:30",
    )
    assert routes["through"]["delay_min"] == 22
    assert routes["far"]["events"] == [] and routes["far"]["delay_min"] == 0
    assert 0 < routes["near"]["delay_min"] < 22


def test_no_delay_outside_impact_windows(client):
    client.post("/api/events", json=CONCERT)
    routes = impact(
        client, {"through": THROUGH_CHINNASWAMY}, "2026-12-05T10:00:00+05:30", "2026-12-05T11:00:00+05:30"
    )
    assert routes["through"]["events"] == []


def test_residual_delay_during_event_and_peak_at_dispersal(client):
    client.post("/api/events", json=CONCERT)
    during = impact(
        client, {"r": THROUGH_CHINNASWAMY}, "2026-12-05T20:30:00+05:30", "2026-12-05T21:00:00+05:30"
    )["r"]
    leaving = impact(
        client, {"r": THROUGH_CHINNASWAMY}, "2026-12-05T22:10:00+05:30", "2026-12-05T22:40:00+05:30"
    )["r"]
    assert during["delay_min"] == pytest.approx(22 * event_impact.RESIDUAL_SHARE, abs=0.1)
    assert leaving["delay_min"] == 22
    phases = [w["phase"] for w in leaving["events"][0]["windows"]]
    assert phases == ["arrival", "during", "dispersal"]


def test_route_impact_rejects_bad_window(client):
    r = client.post(
        "/api/events/route-impact",
        json={
            "routes": [{"id": "a", "geometry": THROUGH_CHINNASWAMY}],
            "window_start": "2026-12-05T20:00:00",
            "window_end": "2026-12-05T19:00:00",
        },
    )
    assert r.status_code == 422


def test_peak_delay_tiers():
    assert event_impact.peak_delay_min(1_500) == 3
    assert event_impact.peak_delay_min(40_000) == 22
    assert event_impact.peak_delay_min(80_000) == event_impact.MAX_DELAY_MIN


@pytest.fixture()
def locked(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "admin_token", "s3cret")
    return client


def test_writes_need_admin_key_when_set(locked):
    assert locked.post("/api/events", json=CONCERT).status_code == 401
    wrong = {"X-Admin-Token": "nope"}
    assert locked.post("/api/events", json=CONCERT, headers=wrong).status_code == 401
    r = locked.post(
        "/api/events/import",
        content="venue,title,starts_at,ends_at\n",
        headers={"content-type": "text/csv"},
    )
    assert r.status_code == 401
    venue = {"name": "X", "lat": 12.9, "lon": 77.6, "capacity": 100, "impact_radius_km": 1}
    assert locked.post("/api/venues", json=venue).status_code == 401

    ok = {"X-Admin-Token": "s3cret"}
    event_id = locked.post("/api/events", json=CONCERT, headers=ok).json()["id"]
    assert locked.put(f"/api/events/{event_id}", json=CONCERT).status_code == 401
    assert locked.delete(f"/api/events/{event_id}").status_code == 401
    assert locked.delete(f"/api/events/{event_id}", headers=ok).status_code == 204


def test_reads_stay_open_when_locked(locked):
    assert locked.get("/api/events").status_code == 200
    assert locked.get("/api/venues").status_code == 200
    impact(locked, {"a": THROUGH_CHINNASWAMY}, "2026-12-05T18:00:00", "2026-12-05T20:00:00")
