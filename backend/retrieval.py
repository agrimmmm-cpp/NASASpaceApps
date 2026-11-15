"""Nearest-run retrieval and matching-run counts (docs/04_MODEL_SPEC.md sections 6 and 7). Deterministic."""
from __future__ import annotations

import numpy as np
import pandas as pd

import config

_FEATS = ["o2_percent", "pressure_kpa", "airflow_cm_s", "gravity_g"]


def _norm(x, feat: str):
    r = config.RANGES[feat]
    return (np.asarray(x, dtype=float) - r["min"]) / (r["max"] - r["min"])  # stable: uses meta ranges, not data min/max


def nearest_runs(df: pd.DataFrame, scenario: dict, k: int = config.RETRIEVAL_K) -> pd.DataFrame:
    """Top-k closest runs (ascending distance, tie-break run_id). Returns full Run rows."""
    if df.empty:
        return df
    d2 = np.zeros(len(df))
    for f in _FEATS:
        d2 += config.RETRIEVAL_WEIGHTS[f] * (_norm(df[f], f) - _norm(scenario[f], f)) ** 2
    dist = np.sqrt(d2) + np.where(df["material"].to_numpy() == scenario["material"], 0.0,
                                  config.RETRIEVAL_MATERIAL_PENALTY)
    order = pd.DataFrame({"dist": dist, "run_id": df["run_id"].to_numpy()}).sort_values(["dist", "run_id"]).index[:k]
    return df.iloc[order]


def count_matching(df: pd.DataFrame, scenario: dict) -> int:
    """Same material and inside every tolerance (matching_runs KPI)."""
    m = df["material"] == scenario["material"]
    for f, tol in config.MATCH_TOLERANCE.items():
        m &= (df[f] - scenario[f]).abs() <= tol + 1e-9
    return int(m.sum())
