"""Trains a 7-day-ahead traffic forecasting model per target (congestion,
speed) and per horizon (1..7 days), using real traffic + weather history,
then saves the winning model per (target, horizon) plus a metrics report.

Usage:
    python3 ml/train.py

Evaluation is a strict time-based split (train on the past, test on the
most recent TEST_DAYS) — never a random shuffle, since that would leak
future information (via overlapping lag windows) into training rows.
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from xgboost import XGBRegressor

from data import load_daily_area_series
from features import build_supervised, feature_columns

OUT_DIR = Path(__file__).resolve().parent / "outputs"
MODELS_DIR = OUT_DIR / "models"
TEST_DAYS = 90
HORIZONS = range(1, 8)
TARGETS = ["congestion_pct", "avg_speed_kph"]


def time_split(df: pd.DataFrame, test_days: int):
    cutoff = df["date"].max() - pd.Timedelta(days=test_days)
    train = df[df["date"] <= cutoff]
    test = df[df["date"] > cutoff]
    return train, test


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
    """Baseline: assume the value 7 days before the as-of date repeats at the target date."""
    return test[f"{target_col}_lag7"].to_numpy()


def better_on_at_least(challenger: dict, baseline: dict, n: int) -> bool:
    wins = 0
    wins += challenger["mae"] < baseline["mae"]
    wins += challenger["rmse"] < baseline["rmse"]
    wins += challenger["mape"] < baseline["mape"]
    wins += challenger["r2"] > baseline["r2"]
    return wins >= n


def make_model(name: str):
    if name == "random_forest":
        return RandomForestRegressor(
            n_estimators=300, max_depth=12, min_samples_leaf=3, random_state=42, n_jobs=-1
        )
    return XGBRegressor(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.03,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
    )


def train_one(daily: pd.DataFrame, target_col: str, horizon: int) -> dict:
    sup = build_supervised(daily, horizon=horizon, target_col=target_col)
    train, test = time_split(sup, TEST_DAYS)
    cols = feature_columns(sup)

    X_train, y_train = train[cols], train["target"].to_numpy()
    X_test, y_test = test[cols], test["target"].to_numpy()

    # Held out (most recent TEST_DAYS never seen in training) — this is the
    # honest accuracy report, comparable to the baseline on the same rows.
    results = {"baseline": metrics(y_test, seasonal_naive_predict(test, target_col))}

    rf = make_model("random_forest")
    rf.fit(X_train, y_train)
    results["random_forest"] = metrics(y_test, rf.predict(X_test))

    xgb = make_model("xgboost")
    xgb.fit(X_train, y_train)
    results["xgboost"] = metrics(y_test, xgb.predict(X_test))

    # Pick whichever of the two models clears the baseline on more metrics;
    # ties go to XGBoost (lower MAE as the tiebreaker).
    rf_wins = sum(
        [
            results["random_forest"]["mae"] < results["baseline"]["mae"],
            results["random_forest"]["rmse"] < results["baseline"]["rmse"],
            results["random_forest"]["mape"] < results["baseline"]["mape"],
            results["random_forest"]["r2"] > results["baseline"]["r2"],
        ]
    )
    xgb_wins = sum(
        [
            results["xgboost"]["mae"] < results["baseline"]["mae"],
            results["xgboost"]["rmse"] < results["baseline"]["rmse"],
            results["xgboost"]["mape"] < results["baseline"]["mape"],
            results["xgboost"]["r2"] > results["baseline"]["r2"],
        ]
    )
    best_name = "xgboost" if xgb_wins >= rf_wins else "random_forest"

    # The model actually saved for forecasting is refit on ALL available
    # history (train + held-out test rows combined) using the same
    # architecture/hyperparameters just validated above — the held-out
    # split above exists only to pick the model type and report honest
    # accuracy; throwing away the most recent 90 days at serving time would
    # waste real signal for no reason.
    X_full = pd.concat([X_train, X_test], ignore_index=True)
    y_full = np.concatenate([y_train, y_test])
    final_model = make_model(best_name)
    final_model.fit(X_full, y_full)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODELS_DIR / f"{target_col}_h{horizon}_{best_name}.joblib"
    joblib.dump({"model": final_model, "feature_columns": cols}, model_path)

    return {
        "target": target_col,
        "horizon": horizon,
        "train_rows": len(train),
        "test_rows": len(test),
        "full_train_rows": len(X_full),
        "metrics": results,
        "chosen_model": best_name,
        "beats_baseline_on": max(rf_wins, xgb_wins),
        "model_path": str(model_path.relative_to(OUT_DIR.parent)),
    }


def main():
    daily = load_daily_area_series()
    report = []
    for target_col in TARGETS:
        for horizon in HORIZONS:
            row = train_one(daily, target_col, horizon)
            report.append(row)
            m = row["metrics"]
            print(
                f"{target_col:16s} h={horizon}  "
                f"baseline MAE={m['baseline']['mae']:.2f}  "
                f"chosen={row['chosen_model']:13s} "
                f"MAE={m[row['chosen_model']]['mae']:.2f}  "
                f"R2={m[row['chosen_model']]['r2']:.3f}  "
                f"beats baseline on {row['beats_baseline_on']}/4 metrics"
            )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_DIR / "metrics.json", "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nSaved metrics report to {OUT_DIR / 'metrics.json'}")
    print(f"Saved {len(report)} trained models to {MODELS_DIR}/")


if __name__ == "__main__":
    main()
