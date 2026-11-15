"""Risk formula, bands, CI repair/widening, time-to-critical. One implementation shared by every predictor (I-06, I-15, I-16, I-21).

risk_index = 100 * (W_SPREAD * clip(spread / SPREAD_REF, 0, 1) + W_SURVIVAL * (1 - extinction_probability))
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import config


def risk_from(spread, ext_prob, spread_ref: float):
    spread_norm = np.clip(np.asarray(spread, dtype=float) / spread_ref, 0.0, 1.0)
    return 100.0 * (config.W_SPREAD * spread_norm + config.W_SURVIVAL * (1.0 - np.asarray(ext_prob, dtype=float)))


def risk_band(risk: float) -> str:
    for b in config.RISK_BANDS:
        if risk < b["max"]:
            return b["band"]
    return config.RISK_BANDS[-1]["band"]  # 100 belongs to the last band


def grade_for(risk: float) -> str:
    for g in config.GRADE_BANDS:
        if risk < g["max_risk"]:
            return g["grade"]
    return config.GRADE_BANDS[-1]["grade"]


def finalize(gravity, spread, lo, hi, temp, ext, spread_ref: float) -> pd.DataFrame:
    """Turn raw model outputs into the contract columns (vectorised; single-scenario = batch of one).

    Applies, in order: non-negativity, CI repair (I-15), CI widening for sparse gravity (I-21), risk, band, time-to-critical.
    """
    g = np.asarray(gravity, dtype=float)
    spread = np.maximum(np.asarray(spread, dtype=float), 0.0)
    lo = np.maximum(np.minimum(np.asarray(lo, dtype=float), spread), 0.0)   # I-15: 0 <= lo <= point
    hi = np.maximum(np.asarray(hi, dtype=float), spread)                    #        point <= hi
    w = config.CI_WIDEN
    widened = (g > w["g_min"]) & (g < w["g_max"])
    f = np.where(widened, w["factor"], 1.0)
    lo = np.maximum(spread - f * (spread - lo), 0.0)
    hi = spread + f * (hi - spread)
    ext = np.clip(np.asarray(ext, dtype=float), 0.0, 1.0)
    risk = np.clip(risk_from(spread, ext, spread_ref), 0.0, 100.0)
    with np.errstate(divide="ignore", invalid="ignore"):
        ttc = np.where(spread < config.NO_ESCALATION_SPREAD_MM_S, np.nan,
                       np.minimum(config.CRITICAL_LENGTH_MM / np.maximum(spread, 1e-9), config.TTC_CAP_S))
    return pd.DataFrame({
        "spread_rate_mm_s": np.round(spread, 3),
        "spread_lo": np.round(lo, 3),
        "spread_hi": np.round(hi, 3),
        "ci_widened": widened,
        "flame_temp_k": np.round(np.asarray(temp, dtype=float), 0),
        "extinction_probability": np.round(ext, 3),
        "risk_index": np.round(risk, 1),
        "time_to_critical_s": np.round(ttc, 1),
    })
