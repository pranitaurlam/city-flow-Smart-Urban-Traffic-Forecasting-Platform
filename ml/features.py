"""Builds a leakage-safe supervised learning matrix for a given forecast
horizon.

For a prediction made "as of" day t, for horizon h (1..7 days ahead):
  - Every lag/rolling feature is computed using only data up to and
    including day t (pandas' `rolling`/`shift` are backward-looking, so
    this falls out naturally from the column definitions below).
  - The weather feature for the target day (t+h) stands in for "the
    weather forecast for that day" — at training time we use the
    historical actual, which is the standard proxy researchers use when
    archived forecast snapshots aren't available. It is NOT the traffic
    target, so this isn't target leakage, just an assumption that the
    weather forecast CityFlow would have for day t+h is accurate (true
    forecasts degrade with horizon; see README.md).
  - Fixed-date Indian public holidays are legitimately known in advance,
    so computing the holiday flag for t+h (not t) is correct, not leakage.
"""

import numpy as np
import pandas as pd

LAG_DAYS = [1, 2, 3, 7, 14]
ROLL_WINDOWS = [3, 7, 14]
VALUE_COLS = ["congestion_pct", "avg_speed_kph", "traffic_volume"]
WEATHER_LEVELS = ["Clear", "Overcast", "Fog", "Rain", "Windy"]

# Fixed-date national holidays (the only ones that don't require a lunar
# calendar lookup) — Republic Day, Independence Day, Gandhi Jayanti.
FIXED_HOLIDAYS = {(1, 26), (8, 15), (10, 2)}


def _add_calendar_features(df: pd.DataFrame, date_col: str, prefix: str) -> pd.DataFrame:
    dow = df[date_col].dt.dayofweek
    month = df[date_col].dt.month
    df[f"{prefix}_dow_sin"] = np.sin(2 * np.pi * dow / 7)
    df[f"{prefix}_dow_cos"] = np.cos(2 * np.pi * dow / 7)
    df[f"{prefix}_month_sin"] = np.sin(2 * np.pi * month / 12)
    df[f"{prefix}_month_cos"] = np.cos(2 * np.pi * month / 12)
    df[f"{prefix}_is_weekend"] = (dow >= 5).astype(int)
    df[f"{prefix}_is_holiday"] = df[date_col].apply(
        lambda d: int((d.month, d.day) in FIXED_HOLIDAYS)
    )
    return df


def build_supervised(daily: pd.DataFrame, horizon: int, target_col: str) -> pd.DataFrame:
    """One row per (area, date) with features known as-of `date` plus the
    target value `horizon` days later."""
    assert target_col in VALUE_COLS

    frames = []
    for area, g in daily.groupby("area"):
        g = g.sort_values("date").reset_index(drop=True)

        feat = pd.DataFrame({"date": g["date"], "area": area})

        for col in VALUE_COLS:
            for lag in LAG_DAYS:
                feat[f"{col}_lag{lag}"] = g[col].shift(lag)
            for win in ROLL_WINDOWS:
                feat[f"{col}_roll{win}_mean"] = g[col].rolling(win).mean()
                feat[f"{col}_roll{win}_std"] = g[col].rolling(win).std()

        feat = _add_calendar_features(feat, "date", "asof")

        # Weather "forecast" and calendar features for the target day (t+h).
        target_date = g["date"] + pd.Timedelta(days=horizon)
        feat["target_date"] = target_date
        feat = _add_calendar_features(feat, "target_date", "target")
        weather_at_target = g.set_index("date")["weather"].reindex(target_date).to_numpy()
        for level in WEATHER_LEVELS:
            feat[f"weather_forecast_{level.lower()}"] = (weather_at_target == level).astype(int)
        feat["weather_now"] = g["weather"].to_numpy()
        for level in WEATHER_LEVELS:
            feat[f"weather_now_{level.lower()}"] = (feat["weather_now"] == level).astype(int)
        feat = feat.drop(columns=["weather_now"])

        feat["horizon"] = horizon
        feat["target"] = g[target_col].shift(-horizon).to_numpy()

        frames.append(feat)

    out = pd.concat(frames, ignore_index=True)
    out = pd.get_dummies(out, columns=["area"], prefix="area")
    return out.dropna().reset_index(drop=True)


def feature_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c not in ("date", "target_date", "target")]
