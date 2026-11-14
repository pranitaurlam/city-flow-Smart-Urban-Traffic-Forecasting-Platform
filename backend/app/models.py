"""Database schema.

The database is the single source of truth for historical records,
forecasts, and model evaluation results (see the main README's
architecture section). Forecasts are pre-computed by ml/forecast.py and
loaded here, so the API never runs model inference at request time.
"""

from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Area(Base):
    __tablename__ = "areas"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Matches the frontend's location slugs in src/lib/locations.ts.
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)

    roads: Mapped[list["Road"]] = relationship(back_populates="area", cascade="all, delete-orphan")


class Road(Base):
    __tablename__ = "roads"
    __table_args__ = (UniqueConstraint("area_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    area_id: Mapped[int] = mapped_column(ForeignKey("areas.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128))

    area: Mapped[Area] = relationship(back_populates="roads")


class TrafficRecord(Base):
    """One raw row of the Kaggle dataset: a single road on a single day."""

    __tablename__ = "traffic_records"
    __table_args__ = (UniqueConstraint("road_id", "date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    road_id: Mapped[int] = mapped_column(ForeignKey("roads.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)

    traffic_volume: Mapped[int] = mapped_column(Integer)
    avg_speed_kph: Mapped[float] = mapped_column(Float)
    travel_time_index: Mapped[float] = mapped_column(Float)
    congestion_pct: Mapped[float] = mapped_column(Float)
    capacity_utilization_pct: Mapped[float] = mapped_column(Float)
    incident_reports: Mapped[int] = mapped_column(Integer)
    environmental_impact: Mapped[float] = mapped_column(Float)
    public_transport_usage_pct: Mapped[float] = mapped_column(Float)
    signal_compliance_pct: Mapped[float] = mapped_column(Float)
    parking_usage_pct: Mapped[float] = mapped_column(Float)
    pedestrian_cyclist_count: Mapped[int] = mapped_column(Integer)
    weather: Mapped[str] = mapped_column(String(32))
    roadwork: Mapped[bool] = mapped_column(Boolean)


class Forecast(Base):
    """A pre-computed model prediction for one area, target and horizon."""

    __tablename__ = "forecasts"
    __table_args__ = (UniqueConstraint("area_id", "target", "as_of_date", "horizon_days"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    area_id: Mapped[int] = mapped_column(ForeignKey("areas.id", ondelete="CASCADE"), index=True)
    # "congestion_pct" or "avg_speed_kph"
    target: Mapped[str] = mapped_column(String(32), index=True)
    as_of_date: Mapped[date] = mapped_column(Date)
    target_date: Mapped[date] = mapped_column(Date, index=True)
    horizon_days: Mapped[int] = mapped_column(Integer)
    predicted: Mapped[float] = mapped_column(Float)
    # Ground truth when the target date is inside the dataset (backtest).
    actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather_forecast_persisted: Mapped[bool] = mapped_column(Boolean, default=False)
    loaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    area: Mapped[Area] = relationship()


class ModelMetric(Base):
    """Held-out evaluation of one model for one (target, horizon)."""

    __tablename__ = "model_metrics"
    __table_args__ = (UniqueConstraint("target", "horizon_days", "model_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    target: Mapped[str] = mapped_column(String(32))
    horizon_days: Mapped[int] = mapped_column(Integer)
    # "baseline", "random_forest" or "xgboost"
    model_name: Mapped[str] = mapped_column(String(32))
    mae: Mapped[float] = mapped_column(Float)
    rmse: Mapped[float] = mapped_column(Float)
    mape: Mapped[float] = mapped_column(Float)
    r2: Mapped[float] = mapped_column(Float)
    is_chosen: Mapped[bool] = mapped_column(Boolean, default=False)
    train_rows: Mapped[int] = mapped_column(Integer)
    test_rows: Mapped[int] = mapped_column(Integer)
