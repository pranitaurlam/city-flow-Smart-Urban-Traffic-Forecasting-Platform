"""Model candidates for the forecast, kept in their own module so saved
models stay loadable.

`train.py` runs as a script, so anything defined there pickles as
`__main__.X` and cannot be unpickled by `forecast.py` or the API. Estimator
classes therefore live here and are imported by both sides.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from xgboost import XGBRegressor


class Climatology:
    """Predicts the per-area mean of the target.

    On this dataset that is effectively the optimum: the series have no
    day-to-day autocorrelation, so the only reliable structure is which area a
    reading belongs to. Refining it by weekend or by a recent-window mean
    changes R² by less than 0.003 (see ml/README.md), so it is left plain.
    """

    def __init__(self, area_cols: list[str]):
        self.area_cols = list(area_cols)
        self._inner = Ridge(alpha=1.0)

    def fit(self, X: pd.DataFrame, y: np.ndarray):
        self._inner.fit(X[self.area_cols], y)
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return self._inner.predict(X[self.area_cols])


class ColumnScaler:
    """Standardises columns from training statistics only."""

    def fit(self, X: pd.DataFrame, y=None):
        self.mean_ = X.mean(axis=0)
        self.std_ = X.std(axis=0).replace(0, 1.0)
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        return (X - self.mean_) / self.std_

    def fit_transform(self, X: pd.DataFrame, y=None) -> pd.DataFrame:
        return self.fit(X, y).transform(X)


def build_candidates(area_cols: list[str]) -> dict:
    """Factories, so every fold and the final refit get a fresh estimator.

    The tree settings are deliberately shallow and heavily regularised: with
    no real temporal signal, extra depth only fits noise. The previous
    settings (depth 5, 400 trees, no penalty) scored below plain climatology
    at every horizon beyond one day.
    """
    from sklearn.pipeline import Pipeline

    return {
        "climatology": lambda: Climatology(area_cols),
        "ridge": lambda: Pipeline(
            [("scale", ColumnScaler()), ("model", Ridge(alpha=10.0))]
        ),
        "xgboost": lambda: XGBRegressor(
            n_estimators=300,
            max_depth=2,
            learning_rate=0.03,
            subsample=0.8,
            colsample_bytree=0.6,
            reg_lambda=20.0,
            reg_alpha=1.0,
            min_child_weight=30,
            random_state=42,
            n_jobs=-1,
        ),
        "random_forest": lambda: RandomForestRegressor(
            n_estimators=300,
            max_depth=6,
            min_samples_leaf=25,
            max_features=0.5,
            random_state=42,
            n_jobs=-1,
        ),
    }
