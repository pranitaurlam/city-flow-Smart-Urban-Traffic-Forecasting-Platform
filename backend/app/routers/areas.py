from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import queries
from app.db import get_session
from app.schemas import AreaDetail, AreaForecast, AreaSummary, HistoryPoint

router = APIRouter(prefix="/api/areas", tags=["areas"])


@router.get("", response_model=list[AreaSummary])
def list_areas(session: Session = Depends(get_session)):
    return queries.area_summaries(session)


@router.get("/{slug}", response_model=AreaDetail)
def get_area(slug: str, session: Session = Depends(get_session)):
    return queries.area_detail(session, queries.get_area_or_404(session, slug))


@router.get("/{slug}/history", response_model=list[HistoryPoint])
def get_history(
    slug: str,
    start: date | None = None,
    end: date | None = None,
    road: str | None = Query(None, description="Limit to one road in the area"),
    session: Session = Depends(get_session),
):
    if start and end and start > end:
        raise HTTPException(status_code=400, detail="start must be on or before end")
    area = queries.get_area_or_404(session, slug)
    return queries.area_history(session, area, start, end, road)


@router.get("/{slug}/forecast", response_model=AreaForecast)
def get_forecast(slug: str, session: Session = Depends(get_session)):
    return queries.area_forecast(session, queries.get_area_or_404(session, slug))
