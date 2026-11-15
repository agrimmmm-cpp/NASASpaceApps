"""Predictor interface + the Tier 1 stub predictor.

Every endpoint calls `predictor.predict_batch(df)` (I-16: one prediction code path). Tier 2 adds a gradient-boosting predictor with
the same interface; STUB_MODE chooses which one is used. `ToyPredictor` is a cheap analytic surface with physically plausible
directions (O2 up => faster, 0 g cooler, starved/low-O2 flames die) so the frontend sliders visibly do something.
"""
from __future__ import annotations

from typing import Protocol

import numpy as np
import pandas as pd

import config
import scoring

FEATURES = ["material", "o2_percent", "pressure_kpa", "airflow_cm_s", "gravity_g"]
_BASE = {"PMMA": 0.9, "Nomex": 0.7, "SIBAL": 0.5, "heptane": 1.4, "ethanol": 1.1, "methane": 2.0}
_TOFF = {"PMMA": 0, "Nomex": -30, "SIBAL": -50, "heptane": 40, "ethanol": -80, "methane": 60}


class Predictor(Protocol):
    spread_ref: float
    version: str
    is_stub: bool

    def predict_batch(self, df: pd.DataFrame) -> pd.DataFrame: ...

    def explain(self, scenario: dict, reference: dict) -> tuple[float, list[dict]]: ...


class ToyPredictor:
    is_stub = True
    version = "stub"
    metrics = None
    trained_at = "1970-01-01T00:00:00Z"

    def __init__(self, spread_ref: float = config.SPREAD_REF_DEFAULT_MM_S):
        self.spread_ref = spread_ref

    def predict_batch(self, df: pd.DataFrame) -> pd.DataFrame:
        o2, p = df["o2_percent"].to_numpy(float), df["pressure_kpa"].to_numpy(float)
        a, g = df["airflow_cm_s"].to_numpy(float), df["gravity_g"].to_numpy(float)
        base = df["material"].map(_BASE).fillna(0.9).to_numpy(float)
        x = a / 15.0
        flow = (1 - g) * (0.25 + 0.75 * x * np.exp(1 - x)) + g * (1 + 0.004 * a)
        spread = base * (o2 / 21.0) ** 2.6 * (p / 101.3) ** 1.3 * (1 + 2.2 * g ** 0.7) * flow
        starve = np.where(g < 0.3, np.exp(-a / 2.5) * (1 - g / 0.3), 0.0)
        blow = np.where(g < 0.3, np.clip((a - 40) / 10, 0, 1) * 1.5, 0.0)
        ext = 1 / (1 + np.exp(-(0.6 * (21 - o2) - 2 + 3.5 * starve + blow - g)))
        spread = spread * (1 - 0.8 * ext)  # expected-ish spread: dying flames barely move
        temp = 1350 + 575 * g ** 0.6 + 8 * (o2 - 21) + df["material"].map(_TOFF).fillna(0).to_numpy(float)
        lo, hi = spread * 0.65, spread * 1.45
        return scoring.finalize(g, spread, lo, hi, temp, ext, self.spread_ref)

    def explain(self, scenario: dict, reference: dict) -> tuple[float, list[dict]]:
        """One-at-a-time ablation against a reference scenario (stub stand-in for SHAP). Positive = raises risk."""
        rows = [scenario, reference] + [{**scenario, f: reference[f]} for f in FEATURES]
        out = self.predict_batch(pd.DataFrame(rows))["risk_index"].to_numpy(float)
        risk, base, ablated = out[0], out[1], out[2:]
        items = [{"feature": f, "contribution": round(float(risk - ablated[i]), 2)} for i, f in enumerate(FEATURES)]
        items.sort(key=lambda d: -abs(d["contribution"]))
        return round(float(base), 1), items
