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

## Incident photo checks

Commuters can report a blocked road from the Plan Journey page. A photo is
required, and the API asks a vision model (Google Gemini, OpenAI or Claude)
whether it is a genuine picture of a road
that is blocked or heavily congested before the report is stored. Rejected
photos return 422 with the reason. The photo itself is never stored.

Put one API key in `backend/.env` to turn the check on, then restart the
backend. If more than one is set, the first in this list is used:

```bash
GEMINI_API_KEY=...         # Google AI Studio; model GEMINI_IMAGE_CHECK_MODEL (default gemini-3.8-flash)
OPENAI_API_KEY=sk-...      # model OPENAI_IMAGE_CHECK_MODEL (default gpt-4.1-mini)
ANTHROPIC_API_KEY=sk-ant-  # model IMAGE_CHECK_MODEL (default claude-opus-5-5)
```

Without a key, reports are refused. Only reports whose photo passed the
check are stored and shown to other drivers. The check judges only what is visible, so
it cannot prove a photo is recent or was taken at the reported spot.

Each check is a paid model call, so one visitor (by IP address) can send at
most 5 reports per 10 minutes. When the API runs behind a load balancer (e.g.
on Render), set `TRUSTED_PROXY_HOPS=1` so the visitor's address is read from
the proxy's `X-Forwarded-For` entry; otherwise every visitor looks like the
proxy and they all share one limit. Only entries added by the trusted proxies
are used, so a visitor can't dodge the limit by sending a fake header. The
count is kept in memory: it resets on restart and isn't shared between
several server instances.

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
| GET | `/api/incidents` | Incident reports that have not expired (3 hours), newest first |
| POST | `/api/incidents` | Report a blockage with a required photo (`image_base64`); stored only if the photo check accepts it |
| GET | `/api/venues` | Major Bengaluru event venues (stadiums, concert grounds, expo centres) |
| POST | `/api/venues` | Add a venue |
| GET | `/api/events?start=&end=&venue=` | Events overlapping a time range (default: next 30 days) |
| POST / PUT / DELETE | `/api/events`, `/api/events/{id}` | Add, edit or remove an event |
| POST | `/api/events/import` | Bulk-add events from CSV (`text/csv` body). Nothing is saved unless every row is valid |
| POST | `/api/events/route-impact` | For route geometries and a time window: nearby events and estimated delays |

Area slugs match the frontend's location slugs (`mg-road`,
`electronic-city`, `koramangala`, …).

## Event traffic (concerts, matches, expos)

BookMyShow has no public API, and scraping it would break its terms of use.
So events are added on the dashboard's **Events** page, or imported from a
CSV built from the listings. The route pages then check each trip against
them:

- A venue affects roads within its impact radius (1–3 km depending on size).
  The full effect applies within 0.5 km of the venue and fades to nothing at
  the radius.
- Peak delay grows with crowd size: 3 min for up to 2k people, then 8, 15
  and 22 min, up to 30 min above 50k.
- The delay is highest while the crowd arrives (90 min before the start
  until 15 min after) and leaves (the hour after it ends). A smaller delay
  (35% of the peak) applies while the event is on.
- If the usual route is affected, the dashboard compares OSRM's alternative
  routes with detours on each side of the venue. It suggests one only if it
  saves at least 5 minutes.

These are rule-based estimates, not measurements (see `app/event_impact.py`).
Event times without a timezone are read as Bengaluru time (IST).

**Admin key:** set `ADMIN_TOKEN` (in `backend/.env` locally, or as a secret
on your host) and adding, editing, importing or deleting events and adding
venues then require that key in the `X-Admin-Token` header. On the Events
page, type it into the "Admin key" box; it's remembered in that browser only.
Reading events stays open. Without `ADMIN_TOKEN` anyone who can reach the API
can change events (the server logs a warning), so always set it when deployed.

## Database tables

`areas`, `roads`, `traffic_records` (every row of the raw CSV),
`forecasts`, `model_metrics`, `venues` and `events`. The tables are created automatically.
`python -m app.seed` clears and reloads the dataset, forecast and metric
tables, updates the venue list, and never touches events, so it is safe to
re-run after retraining:

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
