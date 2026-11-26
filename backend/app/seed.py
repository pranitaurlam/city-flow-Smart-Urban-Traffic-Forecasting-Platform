"""Loads the traffic dataset and the ML pipeline's outputs into the database.

Re-running is safe: the dataset, forecast and metric tables are cleared and
reloaded, so they always mirror the current CSV and ml/outputs/*.json.
Venues are upserted and user-entered events are left untouched. Run it after
`python ml/forecast.py` produces new forecasts.

    python -m app.seed
"""

import csv
import json
import re
from datetime import date
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import settings
from app.db import Base, SessionLocal, engine
from app.models import Area, Forecast, ModelMetric, Road, TrafficRecord
from app.venues import upsert_venues


def slugify(name: str) -> str:
    """"M.G. Road" -> "mg-road", matching src/lib/locations.ts slugs."""
    name = name.lower().replace(".", "")
    return re.sub(r"[^a-z0-9]+", "-", name).strip("-")


def _get_area(session: Session, cache: dict[str, Area], name: str) -> Area:
    area = cache.get(name)
    if area is None:
        area = Area(name=name, slug=slugify(name))
        session.add(area)
        session.flush()
        cache[name] = area
    return area


def load_traffic(session: Session, csv_path: Path, areas: dict[str, Area]) -> int:
    roads: dict[tuple[int, str], Road] = {}
    records = []
    with csv_path.open(newline="") as f:
        for row in csv.DictReader(f):
            area = _get_area(session, areas, row["Area Name"])
            key = (area.id, row["Road/Intersection Name"])
            road = roads.get(key)
            if road is None:
                road = Road(area_id=area.id, name=key[1])
                session.add(road)
                session.flush()
                roads[key] = road
            records.append(
                {
                    "road_id": road.id,
                    "date": date.fromisoformat(row["Date"]),
                    "traffic_volume": int(row["Traffic Volume"]),
                    "avg_speed_kph": float(row["Average Speed"]),
                    "travel_time_index": float(row["Travel Time Index"]),
                    "congestion_pct": float(row["Congestion Level"]),
                    "capacity_utilization_pct": float(row["Road Capacity Utilization"]),
                    "incident_reports": int(row["Incident Reports"]),
                    "environmental_impact": float(row["Environmental Impact"]),
                    "public_transport_usage_pct": float(row["Public Transport Usage"]),
                    "signal_compliance_pct": float(row["Traffic Signal Compliance"]),
                    "parking_usage_pct": float(row["Parking Usage"]),
                    "pedestrian_cyclist_count": int(row["Pedestrian and Cyclist Count"]),
                    "weather": row["Weather Conditions"],
                    "roadwork": row["Roadwork and Construction Activity"].strip().lower() == "yes",
                }
            )
    session.bulk_insert_mappings(TrafficRecord, records)
    return len(records)


def load_forecasts(session: Session, json_path: Path, areas: dict[str, Area]) -> int:
    rows = json.loads(json_path.read_text())
    session.bulk_insert_mappings(
        Forecast,
        [
            {
                "area_id": _get_area(session, areas, r["area"]).id,
                "target": r["target"],
                "as_of_date": date.fromisoformat(r["as_of_date"]),
                "target_date": date.fromisoformat(r["target_date"]),
                "horizon_days": r["horizon_days"],
                "predicted": r["predicted"],
                "actual": r.get("actual"),
                "weather_forecast_persisted": r.get("weather_forecast_persisted", False),
            }
            for r in rows
        ],
    )
    return len(rows)


def load_metrics(session: Session, json_path: Path) -> int:
    """Loads ml/outputs/metrics.json into model_metrics.

    train.py reports two target families: a single day and the 7-day mean.
    model_metrics is unique on (target, horizon_days, model_name), so only the
    single-day family is loaded here — it is the one /api/metrics describes.
    The weekly-outlook figures stay in metrics.json; serving those too needs a
    window column on this table.
    """
    payload = json.loads(json_path.read_text())
    # Older runs wrote a bare list; current runs wrap it with config + ceiling.
    entries = payload["runs"] if isinstance(payload, dict) else payload

    rows = []
    for entry in entries:
        if entry.get("window", 1) != 1:
            continue
        for model_name, m in entry["metrics"].items():
            rows.append(
                {
                    "target": entry["target"],
                    "horizon_days": entry["horizon"],
                    "model_name": model_name,
                    "mae": m["mae"],
                    "rmse": m["rmse"],
                    "mape": m["mape"],
                    "r2": m["r2"],
                    "is_chosen": model_name == entry["chosen_model"],
                    "train_rows": entry["train_rows"],
                    "test_rows": entry["test_rows"],
                }
            )
    session.bulk_insert_mappings(ModelMetric, rows)
    return len(rows)


def seed(session: Session) -> dict[str, int]:
    Base.metadata.create_all(session.get_bind())
    # Children first so this works without ON DELETE CASCADE support.
    for model in (TrafficRecord, Forecast, ModelMetric, Road, Area):
        session.execute(delete(model))

    areas: dict[str, Area] = {}
    counts = {
        "traffic_records": load_traffic(session, settings.traffic_csv, areas),
        "forecasts": load_forecasts(session, settings.forecast_json, areas),
        "model_metrics": load_metrics(session, settings.metrics_json),
    }
    counts["areas"] = len(areas)
    session.commit()
    # Venues are reference data; events are user-entered and never reset here.
    counts["venues"] = upsert_venues(session)
    return counts


def main() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as session:
        counts = seed(session)
    for table, n in counts.items():
        print(f"{table:>16}: {n}")


if __name__ == "__main__":
    main()
