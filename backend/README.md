# CityFlow Backend API

FastAPI service that serves CityFlow's historical traffic data, the ML
model's pre-computed forecasts, and model evaluation metrics from a
database. This is the "storage" and "backend API" layer from the main
README's architecture (roadmap weeks 3 and 7).

```
src/data/bangalore_traffic_pulse.csv ─┐
ml/outputs/forecast_next_7_days.json ─┼─ python -m app.seed ─▶ PostgreSQL / SQLite ─▶ FastAPI ─▶ dashboard
ml/outputs/metrics.json ──────────────┘
```

Forecasts are produced offline by `ml/forecast.py` and loaded into the
database, so the API never runs model inference during a request. This meets
the acceptance criterion "forecast retrieval is served from pre-computed
data".

## Run it

### Option A: local, SQLite (no setup)

```bash
cd backend
python3 -m venv .venv            # or: uv venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m app.seed     # creates backend/cityflow.db and loads the data
.venv/bin/uvicorn app.main:app --reload --port 8000
```

### Option B: PostgreSQL

Set `DATABASE_URL`, either as an environment variable or in `backend/.env`,
then seed the database and start the server the same way:

```bash
createdb cityflow
export DATABASE_URL=postgresql+psycopg://$USER@localhost:5432/cityflow
.venv/bin/python -m app.seed
.venv/bin/uvicorn app.main:app --reload --port 8000
```

### Option C: Docker (PostgreSQL + API, one command)

From the repo root:

```bash
docker compose up --build
```

The container seeds the database each time it starts.

Interactive API docs: http://localhost:8000/docs

The dashboard calls `http://localhost:8000` by default. To use a different
URL, set `VITE_CITYFLOW_API_URL` in the root `.env`. If the dashboard runs on
a port other than 5173, 8080 or 3000, add its origin to `CORS_ORIGINS`
(comma-separated).

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/health` | Status, database type, row counts |
| GET | `/api/areas` | The 8 dataset areas with summary stats (date range, average and maximum volume, speed, congestion, busiest road) |
| GET | `/api/areas/{slug}` | One area, plus average volume by weekday and a weather breakdown |
| GET | `/api/areas/{slug}/history?start=&end=&road=` | Daily readings for the area (averaged across its roads) |
| GET | `/api/areas/{slug}/forecast` | Latest 7-day forecast for congestion % and speed, with actual values where known |
| GET | `/api/forecasts?area=&target=&horizon=` | One row per forecast, filterable |
| GET | `/api/metrics?target=` | Baseline vs Random Forest vs XGBoost scores for each target and horizon |
| GET | `/api/reports/trend.csv?area=&days=30` | CSV export of historical and forecast rows |

Area slugs match the frontend's location slugs (`mg-road`,
`electronic-city`, `koramangala`, …).

## Database tables

`areas`, `roads`, `traffic_records` (every row of the raw CSV),
`forecasts`, and `model_metrics`. The tables are created automatically.
`python -m app.seed` clears and reloads all of them, so it is safe to re-run
after retraining:

```bash
python3 ml/train.py && python3 ml/forecast.py
cd backend && .venv/bin/python -m app.seed
```

## Tests

```bash
cd backend && .venv/bin/python -m pytest
```

The tests seed a temporary SQLite database and check every endpoint. They
also check the acceptance criterion that the chosen model beats the
seasonal-naive baseline on at least 3 of 4 metrics at every horizon.

## Not included yet

- **User accounts and saved data.** Saved arrival plans, routes and alerts
  are still stored in the browser's `localStorage`. Moving them to the
  database needs real login first. The current login pages have nothing
  behind them.
- **Daily data ingestion.** The dataset ends on 2024-08-09, so the "forecast"
  is a backtest of the last week that has real readings, not a forecast of
  the actual coming week.
- **Live traffic and weather.** These still go through the TanStack server
  functions in `src/lib/*-server.ts`, which call the HERE and WeatherAPI
  services directly.
