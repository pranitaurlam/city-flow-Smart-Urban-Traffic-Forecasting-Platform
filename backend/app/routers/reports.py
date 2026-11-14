"""Trend report export, generated on demand from the same tables the
dashboard reads (no separate report cache)."""

import csv
import io
from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import queries
from app.db import get_session
from app.models import Area

router = APIRouter(prefix="/api/reports", tags=["reports"])

COLUMNS = [
    "area",
    "date",
    "kind",
    "congestion_pct",
    "avg_speed_kph",
    "traffic_volume",
    "weather",
    "actual_congestion_pct",
    "actual_avg_speed_kph",
]


@router.get("/trend.csv")
def trend_report(
    area: str | None = Query(None, description="Area slug; omit for every area"),
    days: int = Query(30, ge=1, le=1000, description="Days of history before the forecast"),
    session: Session = Depends(get_session),
):
    """Historical vs forecast rows per area, for the dashboard's CSV export."""
    if area:
        areas = [queries.get_area_or_404(session, area)]
    else:
        areas = list(session.scalars(select(Area).order_by(Area.name)))

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(COLUMNS)

    for a in areas:
        forecast = queries.area_forecast(session, a)
        start = forecast.as_of_date - timedelta(days=days - 1)
        for h in queries.area_history(session, a, start=start, end=forecast.as_of_date):
            writer.writerow(
                [a.name, h.date, "historical", h.congestion_pct, h.avg_speed_kph,
                 h.traffic_volume, h.weather, "", ""]
            )
        for p in forecast.points:
            cong, speed = p.congestion_pct, p.avg_speed_kph
            writer.writerow(
                [
                    a.name,
                    p.target_date,
                    "forecast",
                    cong.predicted if cong else "",
                    speed.predicted if speed else "",
                    "",
                    "",
                    cong.actual if cong and cong.actual is not None else "",
                    speed.actual if speed and speed.actual is not None else "",
                ]
            )

    filename = f"cityflow-trend-{area or 'all-areas'}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
