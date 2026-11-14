"""End-to-end API tests against a freshly seeded throwaway SQLite database."""

import csv
import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_session, make_engine
from app.main import app
from app.seed import seed, slugify


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    engine = make_engine(f"sqlite:///{tmp_path_factory.mktemp('db') / 'test.db'}")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    with Session() as session:
        seed(session)

    def override():
        with Session() as session:
            yield session

    app.dependency_overrides[get_session] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_slugify_matches_frontend_slugs():
    assert slugify("M.G. Road") == "mg-road"
    assert slugify("Electronic City") == "electronic-city"


def test_health_reports_seeded_counts(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["areas"] == 8
    assert body["traffic_records"] == 8936
    assert body["forecasts"] == 112


def test_areas_list(client):
    areas = client.get("/api/areas").json()
    assert {a["slug"] for a in areas} == {
        "electronic-city", "hebbal", "indiranagar", "jayanagar",
        "koramangala", "mg-road", "whitefield", "yeshwanthpur",
    }
    assert sum(a["records"] for a in areas) == 8936
    for a in areas:
        assert len(a["roads"]) == 2
        assert a["busiest_road"] in a["roads"]


def test_area_detail_has_weekday_profile(client):
    body = client.get("/api/areas/indiranagar").json()
    assert len(body["weekday_avg_volume"]) == 7
    assert sum(body["weather_days"].values()) == body["records"]


def test_unknown_area_is_404(client):
    assert client.get("/api/areas/atlantis").status_code == 404
    assert client.get("/api/areas/atlantis/forecast").status_code == 404


def test_history_respects_date_range(client):
    points = client.get(
        "/api/areas/hebbal/history", params={"start": "2024-07-01", "end": "2024-07-31"}
    ).json()
    assert points
    assert all("2024-07-01" <= p["date"] <= "2024-07-31" for p in points)
    assert points == sorted(points, key=lambda p: p["date"])


def test_history_rejects_inverted_range(client):
    r = client.get("/api/areas/hebbal/history", params={"start": "2024-08-01", "end": "2024-07-01"})
    assert r.status_code == 400


def test_area_forecast_is_seven_days_both_targets(client):
    body = client.get("/api/areas/koramangala/forecast").json()
    assert [p["horizon_days"] for p in body["points"]] == list(range(1, 8))
    for p in body["points"]:
        assert p["target_date"] > body["as_of_date"]
        assert p["congestion_pct"] is not None and p["avg_speed_kph"] is not None


def test_forecast_filters(client):
    rows = client.get(
        "/api/forecasts", params={"area": "whitefield", "target": "avg_speed_kph", "horizon": 3}
    ).json()
    assert len(rows) == 1
    assert rows[0]["slug"] == "whitefield" and rows[0]["horizon_days"] == 3


def test_metrics_model_beats_baseline(client):
    metrics = client.get("/api/metrics").json()
    assert len(metrics) == 14  # 2 targets x 7 horizons
    for m in metrics:
        assert {s["model"] for s in m["models"]} == {"baseline", "random_forest", "xgboost"}
        assert sum(s["chosen"] for s in m["models"]) == 1
        # Acceptance criterion: beat the seasonal-naive baseline on >= 3 of 4 metrics.
        assert m["beats_baseline_on"] >= 3


def test_trend_report_csv(client):
    r = client.get("/api/reports/trend.csv", params={"area": "jayanagar", "days": 14})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(r.text)))
    kinds = {row["kind"] for row in rows}
    assert kinds == {"historical", "forecast"}
    assert sum(row["kind"] == "forecast" for row in rows) == 7
    assert all(row["area"] == "Jayanagar" for row in rows)
