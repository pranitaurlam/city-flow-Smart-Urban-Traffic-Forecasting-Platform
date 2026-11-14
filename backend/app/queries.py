"""Read-side queries shared by the routers and the report export."""

from collections import Counter, defaultdict
from datetime import date

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Area, Forecast, ModelMetric, Road, TrafficRecord
from app.schemas import (
    AreaDetail,
    AreaForecast,
    AreaSummary,
    ForecastPoint,
    HistoryPoint,
    PredictedValue,
)


def get_area_or_404(session: Session, slug: str) -> Area:
    area = session.scalar(select(Area).where(Area.slug == slug))
    if area is None:
        raise HTTPException(status_code=404, detail=f"Unknown area '{slug}'")
    return area


def area_summaries(session: Session) -> list[AreaSummary]:
    stats = session.execute(
        select(
            Road.area_id,
            func.count(TrafficRecord.id),
            func.min(TrafficRecord.date),
            func.max(TrafficRecord.date),
            func.avg(TrafficRecord.traffic_volume),
            func.max(TrafficRecord.traffic_volume),
            func.avg(TrafficRecord.avg_speed_kph),
            func.avg(TrafficRecord.congestion_pct),
        )
        .join(TrafficRecord, TrafficRecord.road_id == Road.id)
        .group_by(Road.area_id)
    ).all()
    by_area = {row[0]: row[1:] for row in stats}

    # Road holding the single highest recorded volume, per area.
    busiest: dict[int, tuple[int, str]] = {}
    for area_id, road_name, peak in session.execute(
        select(Road.area_id, Road.name, func.max(TrafficRecord.traffic_volume))
        .join(TrafficRecord, TrafficRecord.road_id == Road.id)
        .group_by(Road.area_id, Road.name)
    ):
        if area_id not in busiest or peak > busiest[area_id][0]:
            busiest[area_id] = (peak, road_name)

    summaries = []
    for area in session.scalars(select(Area).order_by(Area.name)):
        if area.id not in by_area:
            continue
        records, first, last, avg_vol, max_vol, avg_speed, avg_cong = by_area[area.id]
        summaries.append(
            AreaSummary(
                slug=area.slug,
                name=area.name,
                roads=sorted(r.name for r in area.roads),
                records=records,
                first_date=first,
                last_date=last,
                avg_volume=round(avg_vol),
                max_volume=max_vol,
                avg_speed_kph=round(avg_speed, 1),
                avg_congestion_pct=round(avg_cong, 1),
                busiest_road=busiest[area.id][1],
            )
        )
    return summaries


def area_detail(session: Session, area: Area) -> AreaDetail:
    summary = next(s for s in area_summaries(session) if s.slug == area.slug)
    rows = session.execute(
        select(TrafficRecord.date, TrafficRecord.traffic_volume, TrafficRecord.weather)
        .join(Road)
        .where(Road.area_id == area.id)
    ).all()

    weekday_totals = [0] * 7
    weekday_counts = [0] * 7
    weather = Counter()
    for day, volume, w in rows:
        weekday_totals[day.weekday()] += volume
        weekday_counts[day.weekday()] += 1
        weather[w] += 1

    return AreaDetail(
        **summary.model_dump(),
        weekday_avg_volume=[
            round(t / c) if c else 0 for t, c in zip(weekday_totals, weekday_counts)
        ],
        weather_days=dict(weather.most_common()),
    )


def area_history(
    session: Session,
    area: Area,
    start: date | None = None,
    end: date | None = None,
    road: str | None = None,
) -> list[HistoryPoint]:
    query = (
        select(TrafficRecord)
        .join(Road)
        .where(Road.area_id == area.id)
        .order_by(TrafficRecord.date)
    )
    if start:
        query = query.where(TrafficRecord.date >= start)
    if end:
        query = query.where(TrafficRecord.date <= end)
    if road:
        query = query.where(Road.name == road)

    by_day: dict[date, list[TrafficRecord]] = defaultdict(list)
    for record in session.scalars(query):
        by_day[record.date].append(record)

    points = []
    for day, records in by_day.items():
        n = len(records)
        points.append(
            HistoryPoint(
                date=day,
                traffic_volume=round(sum(r.traffic_volume for r in records) / n),
                avg_speed_kph=round(sum(r.avg_speed_kph for r in records) / n, 2),
                congestion_pct=round(sum(r.congestion_pct for r in records) / n, 2),
                weather=Counter(r.weather for r in records).most_common(1)[0][0],
                incident_reports=sum(r.incident_reports for r in records),
                roads_reporting=n,
            )
        )
    return points


def area_forecast(session: Session, area: Area) -> AreaForecast:
    latest = session.scalar(
        select(func.max(Forecast.as_of_date)).where(Forecast.area_id == area.id)
    )
    if latest is None:
        raise HTTPException(status_code=404, detail=f"No forecast for '{area.slug}'")

    by_day: dict[date, dict] = {}
    for f in session.scalars(
        select(Forecast)
        .where(Forecast.area_id == area.id, Forecast.as_of_date == latest)
        .order_by(Forecast.target_date)
    ):
        point = by_day.setdefault(
            f.target_date, {"target_date": f.target_date, "horizon_days": f.horizon_days}
        )
        point[f.target] = PredictedValue(predicted=f.predicted, actual=f.actual)

    points = [
        ForecastPoint(
            target_date=p["target_date"],
            horizon_days=p["horizon_days"],
            congestion_pct=p.get("congestion_pct"),
            avg_speed_kph=p.get("avg_speed_kph"),
        )
        for p in by_day.values()
    ]

    errors = [
        abs(p.congestion_pct.predicted - p.congestion_pct.actual)
        for p in points
        if p.congestion_pct and p.congestion_pct.actual is not None
    ]
    chosen = session.scalar(
        select(ModelMetric.model_name).where(ModelMetric.is_chosen).limit(1)
    )
    return AreaForecast(
        area=area.name,
        slug=area.slug,
        as_of_date=latest,
        model=chosen or "unknown",
        backtest_mae_congestion=round(sum(errors) / len(errors), 2) if errors else None,
        points=points,
    )
