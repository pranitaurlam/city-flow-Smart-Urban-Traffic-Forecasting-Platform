"""Generates the actual 7-day-ahead forecast per area from the trained
models, and prints a predicted-vs-actual table for the last week of real
data in the dataset (2024-08-03 .. 2024-08-09) so the forecast can be
checked against ground truth, not just taken on faith.

The dataset ends 2024-08-09, so "the next 7 days" is produced relative to
that last available date, using real lag features right up to the cutoff.
Forecasting from today's real calendar date isn't possible with this
dataset alone — see README.md ("Why 2024-08-10, not today").

Usage:
    python3 ml/forecast.py
"""

import json
from pathlib import Path

import joblib
import pandas as pd

from data import load_daily_area_series
from features import LAG_DAYS, ROLL_WINDOWS, VALUE_COLS, WEATHER_LEVELS, _add_calendar_features

OUT_DIR = Path(__file__).resolve().parent / "outputs"
MODELS_DIR = OUT_DIR / "models"
TARGETS = ["congestion_pct", "avg_speed_kph"]
HORIZONS = range(1, 8)


def _as_of_features(area_series: pd.DataFrame, as_of_date: pd.Timestamp, target_date: pd.Timestamp) -> dict:
    """Builds one feature row exactly the way features.build_supervised does,
    for a single (as_of_date, target_date) pair."""
    g = area_series.set_index("date")
    row = {}
    for col in VALUE_COLS:
        for lag in LAG_DAYS:
            d = as_of_date - pd.Timedelta(days=lag)
            row[f"{col}_lag{lag}"] = g[col].get(d, float("nan"))
        window_vals = {w: g[col].loc[:as_of_date].tail(w) for w in ROLL_WINDOWS}
        for win, vals in window_vals.items():
            row[f"{col}_roll{win}_mean"] = vals.mean()
            row[f"{col}_roll{win}_std"] = vals.std()

    frame = pd.DataFrame({"date": [as_of_date]})
    frame = _add_calendar_features(frame, "date", "asof")
    for c in frame.columns:
        if c != "date":
            row[c] = frame[c].iloc[0]

    frame2 = pd.DataFrame({"target_date": [target_date]})
    frame2 = _add_calendar_features(frame2, "target_date", "target")
    for c in frame2.columns:
        if c != "target_date":
            row[c] = frame2[c].iloc[0]

    # Weather "forecast" for the target day: the real historical value when
    # it's known (target_date <= last date in the series — i.e. we're
    # backtesting), otherwise the as-of day's weather as a persistence
    # fallback (clearly weaker; flagged via weather_is_persisted below).
    last_known = g.index.max()
    if target_date <= last_known:
        weather_at_target = g["weather"].get(target_date)
        persisted = False
    else:
        weather_at_target = g["weather"].get(as_of_date)
        persisted = True
    for level in WEATHER_LEVELS:
        row[f"weather_forecast_{level.lower()}"] = int(weather_at_target == level)
    row["weather_is_persisted"] = persisted

    weather_now = g["weather"].get(as_of_date)
    for level in WEATHER_LEVELS:
        row[f"weather_now_{level.lower()}"] = int(weather_now == level)

    return row


def load_model(target_col: str, horizon: int):
    # Model filename encodes which algorithm won training; discover it rather
    # than hardcoding, since train.py may pick either per (target, horizon).
    matches = list(MODELS_DIR.glob(f"{target_col}_h{horizon}_*.joblib"))
    if not matches:
        raise FileNotFoundError(f"No trained model for {target_col} h={horizon}. Run train.py first.")
    return joblib.load(matches[0])


def forecast_from(as_of_date: pd.Timestamp, daily: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for area, area_series in daily.groupby("area"):
        for target_col in TARGETS:
            for horizon in HORIZONS:
                target_date = as_of_date + pd.Timedelta(days=horizon)
                feat_dict = _as_of_features(area_series, as_of_date, target_date)
                feat_dict["area"] = area
                bundle = load_model(target_col, horizon)
                model, cols = bundle["model"], bundle["feature_columns"]

                row_df = pd.DataFrame([feat_dict])
                row_df = pd.get_dummies(row_df, columns=["area"], prefix="area")
                for c in cols:
                    if c not in row_df.columns:
                        row_df[c] = 0
                pred = float(model.predict(row_df[cols])[0])

                actual = None
                if target_date in area_series.set_index("date").index:
                    actual = float(area_series.set_index("date")[target_col].get(target_date))

                rows.append(
                    {
                        "area": area,
                        "target": target_col,
                        "as_of_date": str(as_of_date.date()),
                        "target_date": str(target_date.date()),
                        "horizon_days": horizon,
                        "predicted": round(pred, 2),
                        "actual": round(actual, 2) if actual is not None else None,
                        "weather_forecast_persisted": feat_dict["weather_is_persisted"],
                    }
                )
    return pd.DataFrame(rows)


def main():
    daily = load_daily_area_series()
    as_of = daily["date"].max() - pd.Timedelta(days=7)  # last real week held out for comparison
    print(f"Forecasting the 7 days after {as_of.date()} (ground truth available for comparison)\n")

    result = forecast_from(as_of, daily)
    result.to_json(OUT_DIR / "forecast_next_7_days.json", orient="records", indent=2)

    cong = result[result["target"] == "congestion_pct"]
    cong = cong.assign(abs_err=(cong["predicted"] - cong["actual"]).abs())
    print("Congestion % — predicted vs actual, by area and day:")
    print(
        cong.pivot_table(index="area", columns="horizon_days", values="abs_err", aggfunc="first").round(1)
    )
    print(f"\nMean absolute error across all area/day combos: {cong['abs_err'].mean():.2f} points")
    print(f"\nFull forecast saved to {OUT_DIR / 'forecast_next_7_days.json'}")


if __name__ == "__main__":
    main()
