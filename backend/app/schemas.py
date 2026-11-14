from datetime import date

from pydantic import BaseModel


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
