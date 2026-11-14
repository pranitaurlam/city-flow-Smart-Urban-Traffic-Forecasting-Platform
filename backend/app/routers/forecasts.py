from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Area, Forecast, ModelMetric
from app.schemas import ForecastRow, HorizonMetrics, ModelScore

router = APIRouter(prefix="/api", tags=["forecasts"])

Target = Literal["congestion_pct", "avg_speed_kph"]


@router.get("/forecasts", response_model=list[ForecastRow])
def list_forecasts(
    area: str | None = Query(None, description="Area slug"),
    target: Target | None = None,
    horizon: int | None = Query(None, ge=1, le=7),
    session: Session = Depends(get_session),
):
    query = (
        select(Forecast, Area)
        .join(Area)
        .order_by(Area.name, Forecast.target, Forecast.target_date)
    )
    if area:
        query = query.where(Area.slug == area)
    if target:
        query = query.where(Forecast.target == target)
    if horizon:
        query = query.where(Forecast.horizon_days == horizon)

    return [
        ForecastRow(
            area=a.name,
            slug=a.slug,
            target=f.target,
            as_of_date=f.as_of_date,
            target_date=f.target_date,
            horizon_days=f.horizon_days,
            predicted=f.predicted,
            actual=f.actual,
        )
        for f, a in session.execute(query)
    ]


@router.get("/metrics", response_model=list[HorizonMetrics])
def list_metrics(target: Target | None = None, session: Session = Depends(get_session)):
    query = select(ModelMetric).order_by(ModelMetric.target, ModelMetric.horizon_days)
    if target:
        query = query.where(ModelMetric.target == target)

    grouped: dict[tuple[str, int], list[ModelMetric]] = {}
    for m in session.scalars(query):
        grouped.setdefault((m.target, m.horizon_days), []).append(m)

    result = []
    for (tgt, horizon), rows in grouped.items():
        baseline = next((r for r in rows if r.model_name == "baseline"), None)
        chosen = next((r for r in rows if r.is_chosen), None)
        beats = 0
        if baseline and chosen:
            beats = sum(
                [
                    chosen.mae < baseline.mae,
                    chosen.rmse < baseline.rmse,
                    chosen.mape < baseline.mape,
                    chosen.r2 > baseline.r2,
                ]
            )
        result.append(
            HorizonMetrics(
                target=tgt,
                horizon_days=horizon,
                train_rows=rows[0].train_rows,
                test_rows=rows[0].test_rows,
                beats_baseline_on=beats,
                models=[
                    ModelScore(
                        model=r.model_name,
                        mae=round(r.mae, 3),
                        rmse=round(r.rmse, 3),
                        mape=round(r.mape, 3),
                        r2=round(r.r2, 4),
                        chosen=r.is_chosen,
                    )
                    for r in rows
                ],
            )
        )
    return result
