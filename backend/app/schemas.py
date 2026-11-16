from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.timeutil import to_utc_naive


class AreaSummary(BaseModel):
    slug: str
    name: str
    roads: list[str]
    records: int
    first_date: date
    last_date: date
    avg_volume: int
    max_volume: int
    avg_speed_kph: float
    avg_congestion_pct: float
    busiest_road: str


class AreaDetail(AreaSummary):
    # Mean daily traffic volume, Monday through Sunday.
    weekday_avg_volume: list[int]
    weather_days: dict[str, int]


class HistoryPoint(BaseModel):
    """One area-level day: the mean across that area's roads."""

    date: date
    traffic_volume: int
    avg_speed_kph: float
    congestion_pct: float
    weather: str
    incident_reports: int
    roads_reporting: int


class PredictedValue(BaseModel):
    predicted: float
    actual: float | None


class ForecastPoint(BaseModel):
    target_date: date
    horizon_days: int
    congestion_pct: PredictedValue | None
    avg_speed_kph: PredictedValue | None


class AreaForecast(BaseModel):
    area: str
    slug: str
    as_of_date: date
    model: str
    # Mean absolute error of congestion predictions where actuals exist.
    backtest_mae_congestion: float | None
    points: list[ForecastPoint]


class ForecastRow(BaseModel):
    area: str
    slug: str
    target: str
    as_of_date: date
    target_date: date
    horizon_days: int
    predicted: float
    actual: float | None


class ModelScore(BaseModel):
    model: str
    mae: float
    rmse: float
    mape: float
    r2: float
    chosen: bool


class HorizonMetrics(BaseModel):
    target: str
    horizon_days: int
    train_rows: int
    test_rows: int
    models: list[ModelScore]
    beats_baseline_on: int


class Health(BaseModel):
    status: str
    database: str
    areas: int
    traffic_records: int
    forecasts: int


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

EventCategory = Literal["concert", "sports", "expo", "festival", "comedy", "other"]


class VenueOut(BaseModel):
    slug: str
    name: str
    lat: float
    lon: float
    capacity: int
    impact_radius_km: float


class VenueIn(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    capacity: int = Field(gt=0, le=500_000)
    impact_radius_km: float = Field(default=2.0, gt=0, le=10)


class EventIn(BaseModel):
    """Times without a timezone are read as Bengaluru local time (IST)."""

    venue: str = Field(description="Venue slug, see GET /api/venues")
    title: str = Field(min_length=2, max_length=200)
    category: EventCategory = "other"
    starts_at: datetime
    ends_at: datetime
    expected_attendance: int | None = Field(
        default=None, gt=0, le=500_000, description="Defaults to the venue's capacity"
    )
    url: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _ends_after_start(self):
        self.starts_at, self.ends_at = to_utc_naive(self.starts_at), to_utc_naive(self.ends_at)
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        if self.ends_at - self.starts_at > timedelta(days=4):
            raise ValueError("an event can last at most 4 days")
        return self


class EventOut(BaseModel):
    id: int
    venue: VenueOut
    title: str
    category: str
    starts_at: datetime
    ends_at: datetime
    expected_attendance: int
    url: str | None
    peak_delay_min: int


class ImportResult(BaseModel):
    created: int


class RouteGeometry(BaseModel):
    id: str = Field(max_length=40)
    # [lat, lon] pairs in travel order.
    geometry: list[tuple[float, float]] = Field(min_length=1, max_length=5000)


class RouteImpactRequest(BaseModel):
    routes: list[RouteGeometry] = Field(min_length=1, max_length=6)
    window_start: datetime
    window_end: datetime

    @model_validator(mode="after")
    def _window(self):
        self.window_start = to_utc_naive(self.window_start)
        self.window_end = to_utc_naive(self.window_end)
        if self.window_end <= self.window_start:
            raise ValueError("window_end must be after window_start")
        if self.window_end - self.window_start > timedelta(days=2):
            raise ValueError("window can span at most 2 days")
        return self


class ImpactWindowOut(BaseModel):
    start: datetime
    end: datetime
    delay_min: float
    phase: str


class EventOnRoute(BaseModel):
    event: EventOut
    distance_km: float
    windows: list[ImpactWindowOut]
    # Worst estimated delay this event adds inside the requested window.
    delay_min: float


class RouteImpact(BaseModel):
    id: str
    events: list[EventOnRoute]
    # Sum over events of each event's worst delay inside the window.
    delay_min: float


class RouteImpactResponse(BaseModel):
    estimate: bool = True
    routes: list[RouteImpact]
