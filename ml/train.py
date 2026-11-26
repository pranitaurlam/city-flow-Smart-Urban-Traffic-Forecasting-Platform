"""Trains a 7-day-ahead traffic forecasting model per target (congestion,
speed) and per horizon (1..7 days), then saves the winning model per
(target, horizon) plus a metrics report.

Usage:
    python3 ml/train.py

Two properties of this dataset drive how evaluation works here (the numbers
behind both are in ml/README.md):

1. The series carry almost no day-to-day signal. Per-road autocorrelation is
   ~0.006 at lag 1 and -0.029 at lag 7, and day-of-week and weather shift the
   mean by ~1-2 points against a standard deviation of ~23. Practically all
   the explainable variance is the difference between areas, which caps R² at
   roughly 0.33 for congestion and 0.02 for speed. A per-area mean
   ("climatology") is therefore a serious competitor, not a straw man, so it
   is entered as a model candidate rather than assumed to lose.

2. data.py interpolates gaps in coverage. An interpolated target is a linear
   blend of neighbouring observed days that the lag features already contain,
   so a model scores ~0.79 R² on those rows while scoring ~0.32 on observed
   ones. Scoring on them measures the interpolation, not forecasting skill,
   so EVAL_OBSERVED_ONLY drops them from every reported metric.

Selection uses rolling-origin cross-validation on earlier windows, keeping the
final TEST_DAYS strictly for the reported numbers, so the choice of model is
never made on the rows used to report it.
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.dummy import DummyRegressor

from data import load_daily_area_series
from estimators import build_candidates
from features import area_columns, build_supervised, feature_columns

OUT_DIR = Path(__file__).resolve().parent / "outputs"
MODELS_DIR = OUT_DIR / "models"
TEST_DAYS = 90
CV_FOLDS = 4
HORIZONS = range(1, 8)
TARGETS = ["congestion_pct", "avg_speed_kph"]
# What each model predicts: a single day (window 1) and the mean over the next
# week (window 7). A single day in this dataset is mostly noise, so the weekly
# level is both far more predictable and what a planner actually asks for.
WINDOWS = [1, 7]
# Only score target periods that were genuinely observed, not interpolated.
# 1.0 = every day in the window was a real reading; 0.8 tolerates one filled
# day in seven, without which the weekly target has too few rows to score.
MIN_OBSERVED_SHARE = {1: 1.0, 7: 0.8}


# --- evaluation -----------------------------------------------------------


def time_split(df: pd.DataFrame, test_days: int):
    cutoff = df["date"].max() - pd.Timedelta(days=test_days)
    return df[df["date"] <= cutoff], df[df["date"] > cutoff]


def rolling_folds(df: pd.DataFrame, n_folds: int = CV_FOLDS, test_days: int = TEST_DAYS):
    """Successive test windows ending before the final held-out window, each
    trained only on rows that precede it."""
    final_cutoff = df["date"].max() - pd.Timedelta(days=test_days)
    for i in range(n_folds, 0, -1):
        hi = final_cutoff - pd.Timedelta(days=(i - 1) * test_days)
        lo = hi - pd.Timedelta(days=test_days)
        train, test = df[df["date"] <= lo], df[(df["date"] > lo) & (df["date"] <= hi)]
        if len(test) >= 50 and len(train) >= 500:
            yield train, test


def scoreable(df: pd.DataFrame, window: int) -> pd.DataFrame:
    """Rows whose metrics mean something — target periods that were observed."""
    threshold = MIN_OBSERVED_SHARE.get(window, 1.0)
    return df[df["target_observed_share"] >= threshold - 1e-9]


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    denom = np.where(np.abs(y_true) < 1e-6, 1e-6, np.abs(y_true))
    return float(np.mean(np.abs((y_true - y_pred) / denom)) * 100)


def metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    err = y_true - y_pred
    ss_res = np.sum(err**2)
    ss_tot = np.sum((y_true - y_true.mean()) ** 2)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    return {
        "mae": float(np.mean(np.abs(err))),
        "rmse": float(np.sqrt(np.mean(err**2))),
        "mape": mape(y_true, y_pred),
        "r2": float(r2),
    }


def seasonal_naive_predict(test: pd.DataFrame, target_col: str) -> np.ndarray:
    """Baseline from the project brief: the value 7 days before the as-of day."""
    return test[f"{target_col}_lag7"].to_numpy()


# --- training ---------------------------------------------------------------


def cross_validate(sup: pd.DataFrame, cols: list[str], candidates: dict, window: int) -> dict:
    """Mean R² per candidate over the rolling folds, for model selection."""
    scores: dict[str, list[float]] = {name: [] for name in candidates}
    for train, test in rolling_folds(sup):
        eval_rows = scoreable(test, window)
        if len(eval_rows) < 20:
            continue
        y_eval = eval_rows["target"].to_numpy()
        for name, make in candidates.items():
            model = make().fit(train[cols], train["target"].to_numpy())
            scores[name].append(metrics(y_eval, model.predict(eval_rows[cols]))["r2"])
    return {name: (float(np.mean(v)) if v else float("-inf")) for name, v in scores.items()}


def train_one(daily: pd.DataFrame, target_col: str, horizon: int, window: int = 1) -> dict:
    sup = build_supervised(daily, horizon=horizon, target_col=target_col, window=window)
    cols = feature_columns(sup)
    candidates = build_candidates(area_columns(sup))

    # 1. Pick the model on earlier windows only.
    cv_scores = cross_validate(sup, cols, candidates, window)
    chosen = max(cv_scores, key=lambda name: cv_scores[name])

    # 2. Report every candidate on the untouched final window.
    train, test = time_split(sup, TEST_DAYS)
    eval_rows = scoreable(test, window)
    y_eval = eval_rows["target"].to_numpy()
    y_train = train["target"].to_numpy()

    results = {
        "seasonal_naive": metrics(y_eval, seasonal_naive_predict(eval_rows, target_col)),
        "train_mean": metrics(
            y_eval, DummyRegressor(strategy="mean").fit(train[cols], y_train).predict(eval_rows[cols])
        ),
    }
    for name, make in candidates.items():
        model = make().fit(train[cols], y_train)
        results[name] = metrics(y_eval, model.predict(eval_rows[cols]))

    # 3. Refit the winner on all history, including the reporting window: the
    #    split exists to choose and to report, not to withhold data at serving.
    final_model = candidates[chosen]().fit(sup[cols], sup["target"].to_numpy())
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    # Single-day models keep their original filename so forecast.py's glob
    # still finds exactly one match; weekly models are tagged.
    stem = f"{target_col}_h{horizon}" if window == 1 else f"{target_col}_w{window}_h{horizon}"
    model_path = MODELS_DIR / f"{stem}_{chosen}.joblib"
    joblib.dump({"model": final_model, "feature_columns": cols}, model_path)

    naive = results["seasonal_naive"]
    picked = results[chosen]
    beats_naive = sum(
        [
            picked["mae"] < naive["mae"],
            picked["rmse"] < naive["rmse"],
            picked["mape"] < naive["mape"],
            picked["r2"] > naive["r2"],
        ]
    )

    return {
        "target": target_col,
        "window": window,
        "predicts": (
            f"the value {horizon} day(s) ahead"
            if window == 1
            else f"the mean over {window} days starting {horizon} day(s) ahead"
        ),
        "horizon": horizon,
        "train_rows": len(train),
        "test_rows": len(test),
        "test_rows_scored": len(eval_rows),
        "test_rows_dropped_interpolated": len(test) - len(eval_rows),
        "min_observed_share": MIN_OBSERVED_SHARE.get(window, 1.0),
        "full_train_rows": len(sup),
        "cv_r2": cv_scores,
        "metrics": results,
        "chosen_model": chosen,
        "chosen_by": f"highest mean R² over {CV_FOLDS} rolling folds",
        "beats_seasonal_naive_on": beats_naive,
        "model_path": str(model_path.relative_to(OUT_DIR.parent)),
    }


def variance_ceiling(daily: pd.DataFrame) -> dict:
    """Share of each target's variance that lies between areas — the practical
    upper bound on R² once the series themselves prove to be noise."""
    ceiling = {}
    for col in ("congestion_pct", "avg_speed_kph", "traffic_volume"):
        area_mean = daily.groupby("area")[col].transform("mean")
        total = float(((daily[col] - daily[col].mean()) ** 2).sum())
        resid = float(((daily[col] - area_mean) ** 2).sum())
        ceiling[col] = round(1 - resid / total, 4) if total else None
    return ceiling


def main():
    daily = load_daily_area_series()
    report = []
    for window in WINDOWS:
        label = "single day" if window == 1 else f"{window}-day mean"
        print(f"\n--- predicting the {label} ---")
        for target_col in TARGETS:
            for horizon in HORIZONS:
                row = train_one(daily, target_col, horizon, window=window)
                report.append(row)
                m = row["metrics"]
                print(
                    f"{target_col:16s} h={horizon}  "
                    f"naive R²={m['seasonal_naive']['r2']:+.3f}  "
                    f"chosen={row['chosen_model']:13s} "
                    f"MAE={m[row['chosen_model']]['mae']:.2f}  "
                    f"R²={m[row['chosen_model']]['r2']:+.3f}  "
                    f"(scored on {row['test_rows_scored']} rows)"
                )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "config": {
            "test_days": TEST_DAYS,
            "cv_folds": CV_FOLDS,
            "windows": WINDOWS,
            "min_observed_share": MIN_OBSERVED_SHARE,
        },
        "variance_ceiling_r2": variance_ceiling(daily),
        "runs": report,
    }
    with open(OUT_DIR / "metrics.json", "w") as f:
        json.dump(payload, f, indent=2)
    print(f"\nSaved metrics report to {OUT_DIR / 'metrics.json'}")
    print(f"Saved {len(report)} trained models to {MODELS_DIR}/")


if __name__ == "__main__":
    main()
