"""Incident reports: photo required, checked before storing, expire on their own."""

import base64
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import sessionmaker

from app import image_check
from app.db import Base, get_session, make_engine
from app.main import app
from app.models import IncidentReport
from app.routers import incidents

PHOTO = base64.b64encode(b"\xff\xd8\xff fake jpeg bytes").decode()
REPORT = {
    "lat": 12.9569,
    "lon": 77.7011,
    "road_hint": "Marathahalli",
    "type": "accident",
    "note": "Two cars, left lane blocked",
    "image_base64": PHOTO,
    "image_media_type": "image/jpeg",
}


def verdict(**overrides):
    fields = {
        "is_road_scene": True,
        "appears_genuine": True,
        "shows_blockage": True,
        "blockage_type": "accident",
        "severity": "moderate",
        "reason": "Two cars have collided and block the left lane.",
    }
    return image_check.ImageVerdict(**{**fields, **overrides})


@pytest.fixture()
def db(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'incidents.db'}")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)


@pytest.fixture()
def client(db):
    def override():
        with db() as session:
            yield session

    app.dependency_overrides[get_session] = override
    incidents._recent_reports.clear()
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def photo_check(monkeypatch):
    """Replaces the Claude call; set `.result` to a verdict or an exception."""

    class Stub:
        result = verdict()
        calls = 0

        def __call__(self, image, media_type, claimed_type, note):
            self.calls += 1
            if isinstance(self.result, Exception):
                raise self.result
            return self.result

    stub = Stub()
    monkeypatch.setattr(image_check, "analyze", stub)
    return stub


def test_genuine_blockage_is_stored_and_listed(client, photo_check):
    r = client.post("/api/incidents", json=REPORT)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "verified"
    assert body["severity"] == "moderate"
    assert body["photo_summary"] == "Two cars have collided and block the left lane."

    listed = client.get("/api/incidents").json()
    assert [i["id"] for i in listed] == [body["id"]]
    assert listed[0]["road_hint"] == "Marathahalli"


@pytest.mark.parametrize(
    "overrides, expected",
    [
        ({"is_road_scene": False}, "doesn't show a road"),
        ({"appears_genuine": False}, "doesn't look like a real picture"),
        ({"shows_blockage": False}, "doesn't show a blockage"),
    ],
)
def test_rejected_photo_is_not_stored(client, photo_check, overrides, expected):
    photo_check.result = verdict(**overrides, reason="Explained.")
    r = client.post("/api/incidents", json=REPORT)
    assert r.status_code == 422
    assert expected in r.json()["detail"]
    assert client.get("/api/incidents").json() == []


def test_photo_is_required(client, photo_check):
    r = client.post("/api/incidents", json={k: v for k, v in REPORT.items() if k != "image_base64"})
    assert r.status_code == 422
    r = client.post("/api/incidents", json={**REPORT, "image_base64": "not base64!!"})
    assert r.status_code == 400
    assert photo_check.calls == 0


def test_without_photo_check_report_is_refused(client, photo_check):
    photo_check.result = image_check.VerifierNotConfigured()
    r = client.post("/api/incidents", json=REPORT)
    assert r.status_code == 503
    assert client.get("/api/incidents").json() == []


def test_unverified_reports_are_never_listed(client, db, photo_check):
    client.post("/api/incidents", json=REPORT)
    with db() as session:
        session.execute(update(IncidentReport).values(status="unverified"))
        session.commit()
    assert client.get("/api/incidents").json() == []


def test_failed_check_does_not_store(client, photo_check):
    photo_check.result = image_check.VerifierError("The photo check is busy right now.")
    r = client.post("/api/incidents", json=REPORT)
    assert r.status_code == 503
    assert client.get("/api/incidents").json() == []


def test_expired_reports_are_not_listed(client, db, photo_check):
    client.post("/api/incidents", json=REPORT)
    with db() as session:
        session.execute(
            update(IncidentReport).values(
                expires_at=IncidentReport.reported_at - timedelta(minutes=1)
            )
        )
        session.commit()
    assert client.get("/api/incidents").json() == []


def test_rate_limit(client, photo_check):
    for _ in range(incidents.RATE_LIMIT):
        assert client.post("/api/incidents", json=REPORT).status_code == 201
    assert client.post("/api/incidents", json=REPORT).status_code == 429


def test_cors_allows_dev_server_on_another_port(client):
    """Vite moves to 8081 when 8080 is taken; reporting must still work from there."""
    for origin, allowed in [
        ("http://localhost:8081", True),
        ("http://127.0.0.1:5174", True),
        ("http://192.168.1.20:8081", True),
        ("https://evil.example", False),
    ]:
        r = client.options(
            "/api/incidents",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert (r.status_code == 200) is allowed, origin


def test_rate_limit_behind_proxy_is_per_visitor(client, photo_check, monkeypatch):
    """Behind a load balancer all connections share the proxy's address; the
    limit must still apply per visitor, and a made-up X-Forwarded-For entry
    from the visitor must not get them a fresh limit."""
    from app.config import settings

    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    # The proxy appends the address it saw: "<whatever the client sent>, <real ip>".
    for n in range(incidents.RATE_LIMIT):
        spoofed = {"X-Forwarded-For": f"10.0.0.{n}, 203.0.113.7"}
        assert client.post("/api/incidents", json=REPORT, headers=spoofed).status_code == 201
    blocked = {"X-Forwarded-For": "10.9.9.9, 203.0.113.7"}
    assert client.post("/api/incidents", json=REPORT, headers=blocked).status_code == 429

    # Another visitor through the same proxy still has their own limit.
    other = {"X-Forwarded-For": "198.51.100.4"}
    assert client.post("/api/incidents", json=REPORT, headers=other).status_code == 201
