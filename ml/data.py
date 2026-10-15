"""Loads the raw Kaggle Bengaluru traffic dataset and resamples it to a
regular daily series per area.

The raw CSV has one row per (area, road, date), sampled irregularly (each
area has between 50% and 99% coverage of its date span — see README.md in
this folder). For lag-based forecasting we need an evenly spaced daily
index, so this module:

1. Aggregates the two roads per area into one area-level daily reading
   (mean for numeric columns, most-frequent value for weather).
2. Reindexes each area to a full daily date range and linearly
   interpolates numeric gaps (short gaps only; see MAX_GAP_DAYS).
3. Fills weather gaps by forward-fill then back-fill (a missing day's
   weather is assumed to match the nearest known day).
"""

from pathlib import Path

import numpy as np
import pandas as pd

RAW_CSV = Path(__file__).resolve().parent.parent / "src" / "data" / "bangalore_traffic_pulse.csv"

# Columns forecast features are allowed to use. Incident/roadwork columns are
# deliberately excluded — a 7-day-ahead forecast can't assume advance
# knowledge of unplanned incidents, and including them would leak
# same-day information into what should be a horizon-only prediction.
NUMERIC_COLS = [
    "Traffic Volume",
    "Average Speed",
    "Congestion Level",
]

# A reading is only trusted if it's within this many days of a real
# observation on either side; beyond that we'd be interpolating across a
# gap too large to be meaningful (e.g. Electronic City's ~50% coverage).
MAX_GAP_DAYS = 10


def load_daily_area_series() -> pd.DataFrame:
    df = pd.read_csv(RAW_CSV, parse_dates=["Date"])

    daily = (
        df.groupby(["Area Name", "Date"])
        .agg(
            **{c: (c, "mean") for c in NUMERIC_COLS},
            **{"Weather Conditions": ("Weather Conditions", lambda s: s.mode().iat[0])},
        )
        .reset_index()
    )

    areas = []
    for area, sub in daily.groupby("Area Name"):
        sub = sub.set_index("Date").sort_index()
        full_index = pd.date_range(sub.index.min(), sub.index.max(), freq="D")
        observed = sub.reindex(full_index)

        # Distance (in days) from each slot to the nearest real observation,
        # used to drop interpolated points that sit in too-large a gap.
        has_data = observed[NUMERIC_COLS[0]].notna().to_numpy()
        gap_days = _distance_to_nearest_true(has_data)

        filled = observed.copy()
        filled[NUMERIC_COLS] = filled[NUMERIC_COLS].interpolate(method="linear", limit_direction="both")
        filled["Weather Conditions"] = filled["Weather Conditions"].ffill().bfill()
        filled["Area Name"] = area
        filled["is_interpolated"] = ~has_data
        filled = filled[gap_days <= MAX_GAP_DAYS]

        filled = filled.reset_index().rename(columns={"index": "Date"})
        areas.append(filled)

    result = pd.concat(areas, ignore_index=True)
    result = result.rename(
        columns={
            "Traffic Volume": "traffic_volume",
            "Average Speed": "avg_speed_kph",
            "Congestion Level": "congestion_pct",
            "Weather Conditions": "weather",
            "Area Name": "area",
            "Date": "date",
        }
    )
    return result.sort_values(["area", "date"]).reset_index(drop=True)


def _distance_to_nearest_true(mask: np.ndarray) -> np.ndarray:
    """For each position, the number of steps to the nearest True in `mask`."""
    n = len(mask)
    dist = np.full(n, n, dtype=int)
    last = -n
    for i in range(n):
        if mask[i]:
            last = i
        dist[i] = min(dist[i], i - last)
    last = 2 * n
    for i in range(n - 1, -1, -1):
        if mask[i]:
            last = i
        dist[i] = min(dist[i], last - i)
    return dist


if __name__ == "__main__":
    daily = load_daily_area_series()
    print(daily.groupby("area")["date"].agg(["min", "max", "count"]))
    print(f"\nTotal rows: {len(daily)}; interpolated: {daily['is_interpolated'].sum()}")
