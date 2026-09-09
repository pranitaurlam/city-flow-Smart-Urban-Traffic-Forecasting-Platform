# CityFlow: Smart Urban Traffic Forecasting Platform

CityFlow is a data-driven platform that forecasts urban road congestion ahead of time and explains the factors behind each forecast. Unlike live navigation tools that only show current conditions, CityFlow analyzes historical traffic, weather, and calendar data to project how congestion will look hours or days into the future, then presents the results through an interactive monitoring dashboard.

This repository currently holds the CityFlow web application. The data pipeline, forecasting models, and API are being built to the specification in the project documentation, and are tracked in the roadmap below.

## Overview

Traffic congestion in fast-growing cities keeps rising alongside vehicle ownership. Commuters, city planners, and logistics teams need a forward view of congestion, not only a snapshot of the present. Several cities, including Bengaluru, also lack a public sensor network, so a dataset-driven forecasting approach has direct local value.

CityFlow addresses this by combining four inputs:

- Historical traffic volume per corridor
- Weather conditions for the same period
- Time-of-day, day-of-week, and holiday signals
- A per-corridor severity score calibrated against public congestion rankings

A corridor is a predefined stretch of road tracked as one forecasting unit. Forecasts are served from pre-computed data, and every forecast is labeled with its confidence and data recency. A forecast is never presented as live traffic.

## Objectives

- Deliver an end-to-end forecasting pipeline that runs on real or synthetic traffic data without manual steps
- Outperform a seasonal-naive baseline on at least three of four metrics (MAE, RMSE, MAPE, R2)
- Calibrate corridor severity without live sensor data, staying consistent with public congestion rankings
- Ship a monitoring dashboard that compares historical and forecast trends
- Validate the full system end to end with automated tests

## Key features

### Forecasting

- Traffic volume forecast per corridor and time window
- Peak and off-peak classification for each forecast window
- Historical and forecast trends shown side by side for the same corridor
- Guidance on a better time to travel based on historical and forecast patterns

### Corridor analytics

- Recurring congestion patterns per corridor
- Corridor-to-corridor comparison across every tracked corridor
- Time-pattern breakdowns by weather and holiday

### Model quality

- Seasonal-naive baseline plus regression models (Random Forest, XGBoost)
- Evaluation on a strict time-based train and test split
- Checks that prevent lag-feature leakage into training rows

### Dashboard and reporting

- Monitoring dashboard aimed at non-technical planners
- Historical versus forecast trend charts and a comparison view
- Trend report export as CSV or PDF

### Stretch goals

These are planned after the core requirements are complete and are not required for MVP acceptance:

- Explainability panel listing the top factors behind a forecast (time, weather, holiday, severity)
- Forecast confidence range instead of a single fixed number
- Statistical baseline comparison against SARIMA and Holt-Winters
- What-if simulation that toggles rain or holiday and updates the forecast
- Automated weekly or monthly planner reports
- Dockerized one-command demo setup

## Tech stack

| Layer | Technology |
| --- | --- |
| Data and modeling | Python, Scikit-Learn (Random Forest, XGBoost), Statsmodels (SARIMA, Holt-Winters) |
| Storage | PostgreSQL or MySQL |
| Web application | React 19, TanStack Start, TanStack Router, Vite |
| UI | Tailwind CSS, Radix UI, shadcn-style components, Recharts |
| Tooling | Bun, TypeScript, ESLint, Prettier |

## Architecture

CityFlow is organized as four layers: data ingestion and preprocessing, feature engineering and forecasting, persistent storage, and the dashboard and reporting layer.

```
Raw data: traffic + weather + holiday
        |
Cleaning and preprocessing
        |
Feature engineering: lag / time / severity
        |
Forecasting engine: baseline + Random Forest / XGBoost
        |
PostgreSQL / MySQL: historical + forecast records
        |
React dashboard  ->  CSV / PDF report export
```

The database is the single source of truth for historical records, forecasts, and severity scores. The dashboard reads directly from it, and exported reports are generated on demand from the same tables rather than from a separate cache.

## Project structure

Target structure for the full project:

```
cityflow/
  data/         raw and cleaned traffic, weather, holiday data
  notebooks/    exploratory analysis, feature engineering, model experiments
  src/
    features/   lag, time, and severity feature builders
    models/     baseline, Random Forest, XGBoost, SARIMA
    pipeline/   ingestion, cleaning, training, scoring
  dashboard/    React (Vite) monitoring dashboard
  reports/      exported CSV and PDF trend reports
  tests/        unit and integration tests
```

This repository currently contains the web application under `src/`, which becomes the dashboard layer. The Python pipeline, database, and API are added in later weeks of the roadmap.

## Getting started

### Prerequisites

- Bun 1.1 or newer, or Node.js 20 or newer with npm

### Installation

```
bun install
```

or, if you prefer npm:

```
npm install
```

### Run the development server

```
bun run dev
```

Vite prints the local URL in the terminal, by default `http://localhost:5173`.

### Production build

```
bun run build
bun run preview
```

## Available scripts

| Script | Purpose |
| --- | --- |
| `dev` | Start the Vite development server |
| `build` | Create a production build |
| `build:dev` | Build using development mode settings |
| `preview` | Serve the production build locally |
| `lint` | Run ESLint across the project |
| `format` | Format the codebase with Prettier |

## Roadmap

The project runs over twelve weeks.

| Week | Deliverable |
| --- | --- |
| 1 | Project planning and requirement analysis |
| 2 | Dataset collection and exploration |
| 3 | Data cleaning pipeline, development environment, and database setup |
| 4 | Feature engineering and exploratory data analysis |
| 5 | Baseline and regression model development (Random Forest, XGBoost) |
| 6 | Corridor severity calibration and congestion scoring |
| 7 | Backend API development |
| 8 | Dashboard development and data visualization |
| 9 | Stretch goals: explainability panel and forecast confidence range |
| 10 | Statistical baseline comparison (SARIMA, Holt-Winters) and Dockerized demo |
| 11 | System testing, bug fixing, and performance tuning |
| 12 | Final documentation, presentation, and demo rehearsal |

## Evaluation and acceptance

The system is considered complete when:

- The regression model outperforms the seasonal-naive baseline on at least three of four metrics
- There is zero data leakage, verified with a strict time-based split
- The dashboard clearly visualizes historical versus forecast patterns
- The pipeline is fully reproducible from raw data to forecast
- Forecast retrieval is served from pre-computed data with no live-inference lag
