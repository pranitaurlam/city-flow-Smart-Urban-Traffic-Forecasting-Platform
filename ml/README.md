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

## What the data actually contains

Before tuning anything, it is worth knowing what is learnable here. Measured
on the raw CSV (reproduce with the snippets in this section):

| Check | congestion | speed | volume |
| --- | --- | --- | --- |
| Autocorrelation, lag 1 day (per road) | +0.006 | -0.004 | +0.008 |
| Autocorrelation, lag 7 days (per road) | -0.029 | -0.005 | -0.032 |
| Day-of-week spread (max - min of daily means) | 1.15 pts | 0.35 kph | - |
| Weather spread (max - min across 5 conditions) | 2.07 pts | 0.24 kph | - |
| Standard deviation of the column | 23.53 | 10.71 | - |
| Variance explained by area identity alone | **0.36** | **0.08** | 0.49 |

Day-to-day values are essentially independent: knowing yesterday tells you
nothing about today, and day-of-week and weather move the mean by one or two
points against a spread of twenty-three. The dataset looks generated rather
than measured — values drawn around a per-road level, with no temporal
process behind them.

That sets a hard ceiling. If the only reliable structure is which area a
reading belongs to, then R² cannot exceed the share of variance that sits
between areas: **~0.36 for congestion and ~0.08 for speed**. No amount of
training moves that; it is a property of the data, not the model.

Two consequences shape the pipeline:

**The seasonal-naive baseline is worse than useless here.** It repeats the
value from 7 days ago, and with zero week-over-week persistence that is worse
than just guessing the mean — which is exactly why its R² is negative
(-0.19 to -1.07 depending on target and horizon). A negative R² means "worse
than predicting the average", and for this baseline on this data, that is the
correct result rather than a bug.

**Interpolated rows inflate accuracy.** `data.py` fills coverage gaps by
linear interpolation, so an interpolated target is a blend of neighbouring
observed days that the lag features already contain. A model scores R² 0.79
on those rows and 0.32 on observed ones. Scoring on them measures the
interpolation, not forecasting skill, so `train.py` sets
`EVAL_OBSERVED_ONLY = True` and drops them from every reported metric. The
figures below are therefore lower than an earlier version of this README
reported (0.41) — the earlier numbers were measured partly on interpolated
targets.

## Models

Per target (`congestion_pct`, `avg_speed_kph`) × per horizon (1-7 days) ×
per target family (single day, 7-day mean) = 28 models. Four candidates
compete for each:

- **Climatology** - the per-area mean. Given the table above this is a
  serious contender, not a straw man, so it is entered as a model rather than
  assumed to lose.
- **Ridge** on the full standardised feature set.
- **XGBoost** and **Random Forest**, both shallow and heavily regularised
  (depth 2-6, strong L1/L2, large leaves). With no temporal signal to find,
  extra depth only fits noise: the previous settings (depth 5, 400 trees, no
  penalty) scored *below* plain climatology at every horizon beyond one day.

**Selection** uses rolling-origin cross-validation over 4 earlier 90-day
windows, each trained only on rows preceding it. The final 90 days are never
used for selection, only for the reported numbers. The winner is then refit
on all history and saved.

`seasonal_naive` and `train_mean` are reported alongside as reference points.

### What each model predicts

Two target families are trained, 28 models in total:

| Family | Target | Why |
| --- | --- | --- |
| Single day (`window=1`) | the value on one specific day | the literal brief |
| Weekly level (`window=7`) | the **mean over the next 7 days** | a single day here is mostly noise; the weekly level is the signal, and is what a planner actually asks |

Both are honest forecasts using only information available on the as-of day.
The difference is the question asked, not the rigour applied.

### Results (final 90 days, observed targets only)

**Weekly level — mean congestion over the next 7 days:**

| Target | Chosen | MAE | RMSE | R² | Naive R² |
| --- | --- | --- | --- | --- | --- |
| congestion_pct | climatology | **4.68** | 6.02 | **+0.724** | -1.16 |
| avg_speed_kph | climatology | **2.92** | 3.65 | **+0.106** | -4.98 |

**Single day:**

| Target | Horizon | Chosen | MAE | RMSE | R² | Naive R² |
| --- | --- | --- | --- | --- | --- | --- |
| congestion_pct | 1-7 days | climatology | 14.17 | 18.26 | +0.332 | -0.19 to -0.28 |
| avg_speed_kph | 1 day | xgboost | 7.04 | 9.05 | +0.040 | -0.80 |
| avg_speed_kph | 2-7 days | climatology | 7.15 | 9.14 | +0.017 | -0.86 to -1.07 |

The chosen model beats the seasonal-naive baseline on **all four metrics at
every horizon in both families**, clearing the project's 3-of-4 acceptance
criterion.

### Why the weekly R² is so much higher

It is arithmetic, not better fitting. R² is explained variance divided by
target variance. The explainable part (which area it is) stays fixed at 173.6;
averaging 7 independent days divides the unexplainable part by 7:

```
single day:  173.6 / (173.6 + 308)     = 0.36   ceiling
7-day mean:  173.6 / (173.6 + 308 / 7) = 0.80   ceiling
```

Measured: 0.332 and 0.724 against those ceilings. Same data, same features,
same estimator — only the question changed. Averaging cancels noise it cannot
predict, which is why a weekly outlook is the right product for this dataset
and a next-day point forecast is not.

Speed stays low in both: only 8% of its variance is between areas to begin
with, so there is almost nothing for averaging to rescue.

### Things that were tried and did not help

Each measured over the same rolling folds, on observed targets:

| Variant | congestion R² | speed R² |
| --- | --- | --- |
| Climatology (per-area mean) | +0.325 | +0.075 |
| Area mean refined by weekend/weekday | +0.324 | +0.076 |
| Area mean over the last 180 days only | +0.320 | +0.074 |
| Area mean over the last 365 days only | +0.324 | +0.077 |
| Regularised XGBoost trained on observed rows only | +0.301 to +0.314 | +0.054 to +0.070 |

All within ±0.003 of the plain mean, i.e. indistinguishable. This is the
evidence for leaving climatology unrefined.

### Raising R² further would take different data

Not different training. What is missing is a temporal process to learn:

- **Hourly rather than daily readings** - rush-hour peaks are the strongest
  and most learnable pattern in real traffic, and daily means average them
  away entirely.
- **Measured rather than generated readings** - a real sensor feed carries
  the day-to-day persistence this dataset lacks (real traffic typically shows
  lag-1 autocorrelation of 0.6-0.8, against 0.006 here).
- **Real incident and roadwork timings**, which explain the spikes a mean
  cannot.

With daily aggregates of a generated series, a per-area mean is close to the
best available estimator, and reporting R² ≈ 0.33 honestly is more useful
than reporting a higher number measured on interpolated rows.

## Why 2024-08-10, not today

The dataset ends 2024-08-09. A real "next 7 days" forecast needs recent
*actual* lag values — there's no ingestion pipeline in this project yet to
collect fresh daily readings (that's explicitly a later roadmap item per
the main README), so there's no real Oct-2026 lag data to forecast from.

`forecast.py` instead demonstrates the trained model by forecasting the 7
days after **2024-08-02** — the last week the dataset has ground truth for —
so predictions can be checked against what actually happened, not just
taken on faith. Mean absolute error on that week: **13.6 points** of
congestion (0-100 scale) over the 46 area/day pairs with an observed actual.
It is a 62-row sample and therefore noisy — `outputs/metrics.json` has the
90-day figures, which are the ones to quote.

## Running it

```bash
# macOS: xgboost needs libomp (not bundled)
brew install libomp

# The python3 on PATH here has none of these packages, and `python3 -m venv`
# fails on this machine (ensurepip is broken), so use uv:
cd ml
uv venv .venv
uv pip install -r requirements.txt --python .venv/bin/python

.venv/bin/python train.py      # trains + evaluates all 28 models, writes outputs/metrics.json
.venv/bin/python forecast.py   # writes outputs/forecast_next_7_days.json, prints the backtest
```

`.venv/` is gitignored. Both scripts must be run from inside `ml/` — they
import `data`/`features`/`estimators` as top-level modules.

## Output artifacts

- `outputs/models/*.joblib` — 28 trained models, each a
  `{"model": ..., "feature_columns": [...]}` bundle. `<target>_h<N>_*` predicts
  a single day; `<target>_w7_h<N>_*` predicts the 7-day mean.
- `outputs/metrics.json` — every candidate's metrics for every
  (target, horizon), the rolling-CV score behind each choice, the variance
  ceiling, and how many test rows were dropped as interpolated.
- `outputs/forecast_next_7_days.json` — the generated 7-day forecast per
  area, with actuals included where available for verification.

## Not yet done (intentionally out of scope here)

This is the modeling layer only. There's no Python API serving these
models to the TypeScript dashboard yet — the web app's live forecasts still
come from the existing rule-based engine in `src/lib/route-forecast.ts` and
`src/lib/route-intelligence.ts`. Wiring this model into the live dashboard
(e.g. a small FastAPI endpoint the frontend calls) is a reasonable next
step, but a separate one from training it — ask if you want that built.
