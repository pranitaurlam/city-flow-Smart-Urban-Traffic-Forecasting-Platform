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


def build_supervised(
    daily: pd.DataFrame, horizon: int, target_col: str, window: int = 1
) -> pd.DataFrame:
    """One row per (area, date) with features known as-of `date` plus the
    target for the days starting `horizon` days later.

    `window` sets what is predicted:
      - 1 (default): that single day's value.
      - 7: the mean over those 7 days — the "next week's level" outlook.

    A single day in this dataset is mostly noise (see ml/README.md), so the
    averaged target is both easier to predict and closer to what a planner
    actually asks. It is a different question, not a better-trained model.
    """
    assert target_col in VALUE_COLS
    assert window >= 1

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
        feat["window"] = window

        # Target: the value at t+h, or the mean over t+h .. t+h+window-1.
        future = g[target_col].shift(-horizon)
        observed = (~g["is_interpolated"]).astype(float).shift(-horizon)
        if window > 1:
            future = future.rolling(window).mean().shift(-(window - 1))
            observed = observed.rolling(window).mean().shift(-(window - 1))
        feat["target"] = future.to_numpy()

        # Share of the target period that was really observed rather than filled
        # in by data.py's interpolation. An interpolated target is a blend of
        # neighbouring observed days that the lag features already contain, so
        # scoring on it measures the interpolation rather than forecasting skill.
        # Kept out of the feature matrix and used only to filter evaluation rows.
        feat["target_observed_share"] = observed.to_numpy()

        frames.append(feat)

    out = pd.concat(frames, ignore_index=True)
    out = pd.get_dummies(out, columns=["area"], prefix="area")
    return out.dropna().reset_index(drop=True)


NON_FEATURE_COLS = ("date", "target_date", "target", "target_observed_share")


def feature_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c not in NON_FEATURE_COLS]


def area_columns(df: pd.DataFrame) -> list[str]:
    """The one-hot area columns, i.e. the only genuinely informative features
    in this dataset (see ml/README.md on why)."""
    return [c for c in df.columns if c.startswith("area_")]
