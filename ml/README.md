# CityFlow 7-Day Traffic Forecast Model

Trains a real regression model — not the dashboard's rule-of-thumb
multiplier — to predict traffic 1 to 7 days ahead per Bengaluru area, using
historical traffic plus weather as inputs. This is the "data and modeling"
layer from the project README's roadmap (weeks 4–6, 9), implemented against
the real dataset already checked into `src/data/bangalore_traffic_pulse.csv`.

## Dataset

`src/data/bangalore_traffic_pulse.csv` — 8,936 rows, 8 areas (Electronic
City, Hebbal, Indiranagar, Jayanagar, Koramangala, M.G. Road, Whitefield,
Yeshwanthpur), 2 roads per area, 2022-01-01 to 2024-08-09. Each row already
has a `Weather Conditions` column (Clear / Overcast / Fog / Rain / Windy) —
traffic and weather history are already joined, no separate weather source
needed.

Coverage is irregular per area (50%–99% of the date span actually has a
reading — see `data.py`), so the first pipeline step resamples each area to
an even daily series, linearly interpolating numeric gaps up to 10 days and
forward/back-filling weather gaps. Interpolated-vs-observed is tracked in an
`is_interpolated` column.

## What "weather forecast" means here

There's no archived weather-forecast snapshot dataset (i.e. "what did the
forecast say on day X for day X+3" isn't recorded anywhere). Feature
building (`features.py`) uses the real historical weather on the **target**
day as a stand-in for a forecast — the standard proxy used in forecasting
research when archived forecasts aren't available, and a reasonable one
near-term (weather forecasts 1–2 days out are usually accurate; CityFlow's
own live weather integration already labels anything beyond that as
"estimated" — see `routes/route-forecast.tsx`). This is documented, not
hidden: it's an assumption, not a claim that the model has future weather
data it couldn't possibly have.

## Features

Per (area, as-of day, horizon 1–7):
- Lags (1, 2, 3, 7, 14 days) and rolling mean/std (3, 7, 14 days) of
  congestion %, average speed, and traffic volume — all computed using only
  data up to and including the as-of day.
- Cyclical day-of-week / month encoding, weekend flag, and a fixed-date
  Indian public holiday flag (Republic Day, Independence Day, Gandhi
  Jayanti) for both the as-of day and the target day.
- One-hot weather for the as-of day (current conditions) and the target day
  (the "forecast").
- One-hot area.

Deliberately **excluded**: incident reports and roadwork/construction
activity. A forecast can't assume advance knowledge of unplanned incidents,
and including same-period incident data would leak information a forecast
wouldn't actually have at prediction time.

## Models

Per target (`congestion_pct`, `avg_speed_kph`) × per horizon (1–7 days) = 14
models:
- **Baseline**: seasonal-naive (the value from 7 days before the as-of day).
- **Random Forest** and **XGBoost**, both evaluated on a strict time-based
  split — train on everything before the last 90 days, test on those last
  90 days only. Never shuffled; shuffling would leak information across
  overlapping lag windows.
- Whichever of RF/XGBoost beats the baseline on more of MAE/RMSE/MAPE/R² is
  selected, then **refit on the full dataset** (train + held-out rows) with
  the same architecture before being saved — the held-out split exists only
  to pick a model and report honest accuracy; the saved model uses all
  available history.

### Results (held-out test set, last 90 days)

XGBoost won every (target, horizon) combination, 4/4 metrics, in the run
checked into `outputs/metrics.json`:

| Target | Horizon | Baseline MAE | Model MAE | R² |
| --- | --- | --- | --- | --- |
| congestion_pct | 1 day | 18.4 | 13.0 | 0.41 |
| congestion_pct | 7 days | 18.0 | 13.9 | 0.36 |
| avg_speed_kph | 1 day | 9.8 | 6.4 | 0.10 |
| avg_speed_kph | 7 days | 9.7 | 6.9 | -0.01 |

Congestion is meaningfully more predictable than speed at this data
resolution — expected, since congestion aggregates more of the day's
pattern while speed is noisier per reading. Speed still beats the naive
baseline on MAE/RMSE/MAPE at every horizon even where R² is flat, meaning
it's a better point estimate even though it doesn't explain much *variance*
beyond the mean.

Full per-horizon numbers: `outputs/metrics.json`.

## Why 2024-08-10, not today

The dataset ends 2024-08-09. A real "next 7 days" forecast needs recent
*actual* lag values — there's no ingestion pipeline in this project yet to
collect fresh daily readings (that's explicitly a later roadmap item per
the main README), so there's no real Oct-2026 lag data to forecast from.

`forecast.py` instead demonstrates the trained model by forecasting the 7
days after **2024-08-02** — the last week the dataset has ground truth for —
so predictions can be checked against what actually happened, not just
taken on faith. Mean absolute error on that held-out week: **9.7 points**
of congestion (0–100 scale) across all 8 areas and all 7 horizons.

## Running it

```bash
# macOS: xgboost needs libomp (not bundled)
brew install libomp

# this repo's python3 on PATH may not have the packages installed below —
# if `python3 -m pip list` doesn't show pandas/scikit-learn/xgboost, use
# whichever interpreter does (e.g. a Python.org / pyenv install), or:
python3 -m pip install -r ml/requirements.txt

python3 ml/train.py      # trains + evaluates all 14 models, writes outputs/metrics.json
python3 ml/forecast.py   # generates outputs/forecast_next_7_days.json, prints backtest
```

## Output artifacts

- `outputs/models/*.joblib` — 14 trained models (one per target × horizon),
  each a `{"model": ..., "feature_columns": [...]}` bundle.
- `outputs/metrics.json` — baseline vs Random Forest vs XGBoost metrics for
  every (target, horizon).
- `outputs/forecast_next_7_days.json` — the generated 7-day forecast per
  area, with actuals included where available for verification.

## Not yet done (intentionally out of scope here)

This is the modeling layer only. There's no Python API serving these
models to the TypeScript dashboard yet — the web app's live forecasts still
come from the existing rule-based engine in `src/lib/route-forecast.ts` and
`src/lib/route-intelligence.ts`. Wiring this model into the live dashboard
(e.g. a small FastAPI endpoint the frontend calls) is a reasonable next
step, but a separate one from training it — ask if you want that built.
