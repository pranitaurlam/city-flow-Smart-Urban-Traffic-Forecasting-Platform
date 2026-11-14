from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import Base, engine, get_session
from app.models import Area, Forecast, TrafficRecord
from app.routers import areas, forecasts, reports
from app.schemas import Health


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(
    lifespan=lifespan,
    title="CityFlow API",
    description="Historical traffic, pre-computed forecasts and model metrics for Bengaluru.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=Health, tags=["health"])
def health(session: Session = Depends(get_session)):
    def count(model) -> int:
        return session.scalar(select(func.count()).select_from(model)) or 0

    return Health(
        status="ok",
        database=engine.dialect.name,
        areas=count(Area),
        traffic_records=count(TrafficRecord),
        forecasts=count(Forecast),
    )


app.include_router(areas.router)
app.include_router(forecasts.router)
app.include_router(reports.router)
