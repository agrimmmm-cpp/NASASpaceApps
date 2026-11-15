"""Endpoint logic shared by stub and real modes. All predictions go through predictor.predict_batch (I-16)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd

import config
import retrieval
import scoring
from data_loader import Dataset, load_vocab, records
from errors import unknown_material
from predictor import FEATURES, Predictor

ACTION_IDS = ["vent_off", "co2_extinguisher", "isolate_evacuate", "lower_o2", "vent_max", "wait"]


@dataclass
class AppState:
    dataset: Dataset
    predictor: Optional[Predictor]
    materials: list[dict]            # [{id,label,fuel_type}] present in data and in vocab
    reference: dict                  # dataset-average scenario for explanations
    trained_at: str = "1970-01-01T00:00:00Z"
    metrics: Optional[dict] = None
    model_error: Optional[str] = None

    @property
    def material_ids(self) -> list[str]:
        return [m["id"] for m in self.materials]


def build_materials(df: pd.DataFrame) -> list[dict]:
    """Materials the model may predict: in the vocabulary AND with at least MIN_MATERIAL_ROWS rows.
    Thinner materials stay visible in the Explorer (/api/runs) and in citations but can't be selected: a model fitted to
    2-4 rows would be noise presented as a prediction (R-09)."""
    vocab = load_vocab()
    counts = df["material"].value_counts()
    ok = [m for m, n in counts.items() if m in vocab and n >= config.MIN_MATERIAL_ROWS]
    return [vocab[m] for m in sorted(ok)]


def data_capabilities(df: pd.DataFrame) -> dict:
    """What the data can support, derived from the rows (used before a model exists; the trained model reports its own)."""
    g = df["gravity_g"]
    return {"flame_temp": int(df["flame_temp_k"].notna().sum()) >= config.MIN_TRAIN_ROWS,
            "gravity_effect": bool((g < 0.05).sum() >= config.MIN_GRAVITY_ROWS and (g > 0.95).sum() >= config.MIN_GRAVITY_ROWS)}


def reference_scenario(df: pd.DataFrame, materials: list[dict]) -> dict:
    mode = df["material"].mode().iat[0]
    return {"material": mode, "o2_percent": float(df["o2_percent"].median()),
            "pressure_kpa": float(df["pressure_kpa"].median()), "airflow_cm_s": float(df["airflow_cm_s"].median()),
            "gravity_g": float(df["gravity_g"].mean())}


def check_material(st: AppState, material: str) -> None:
    if material not in st.material_ids:
        raise unknown_material(material, st.material_ids)


def _batch(st: AppState, scenarios: list[dict]) -> pd.DataFrame:
    return st.predictor.predict_batch(pd.DataFrame(scenarios)[FEATURES])


def _none(x):
    return None if (x is None or (isinstance(x, float) and np.isnan(x))) else float(x)


def predict_one(st: AppState, sc: dict) -> dict:
    row = _batch(st, [sc]).iloc[0]
    base, shap = st.predictor.explain(sc, st.reference)
    risk = float(row["risk_index"])
    return {
        "scenario": sc,
        "spread_rate_mm_s": float(row["spread_rate_mm_s"]),
        "spread_rate_ci": (float(row["spread_lo"]), float(row["spread_hi"])),
        "ci_widened": bool(row["ci_widened"]),
        "flame_temp_k": _none(row["flame_temp_k"]),
        "extinction_probability": float(row["extinction_probability"]),
        "risk_index": risk,
        "risk_band": scoring.risk_band(risk),
        "time_to_critical_s": _none(row["time_to_critical_s"]),
        "shap": shap, "shap_base": base,
        "matching_runs": retrieval.count_matching(st.dataset.df, sc),
        "data_source": st.dataset.source, "model_version": st.predictor.version,
    }


def heatmap(st: AppState, material: str, pressure_kpa: float, gravity_g: float) -> dict:
    n = config.HEATMAP_N
    o2 = np.linspace(config.RANGES["o2_percent"]["min"], config.RANGES["o2_percent"]["max"], n)
    af = np.linspace(config.RANGES["airflow_cm_s"]["min"], config.RANGES["airflow_cm_s"]["max"], n)
    grid = pd.DataFrame([{"material": material, "o2_percent": o, "pressure_kpa": pressure_kpa,
                          "airflow_cm_s": a, "gravity_g": gravity_g} for a in af for o in o2])  # airflow-major => risk[airflow][o2] (I-07)
    risk = _batch_df(st, grid)["risk_index"].to_numpy(float).reshape(n, n)
    return {"material": material, "pressure_kpa": pressure_kpa, "gravity_g": gravity_g,
            "o2_values": [round(float(v), 3) for v in o2], "airflow_values": [round(float(v), 3) for v in af],
            "risk": risk.round(1).tolist(), "data_source": st.dataset.source}


def _batch_df(st: AppState, df: pd.DataFrame) -> pd.DataFrame:
    return st.predictor.predict_batch(df[FEATURES])


def compare(st: AppState, sc: dict) -> dict:
    res = _batch(st, [{**sc, "gravity_g": 0.0}, {**sc, "gravity_g": 1.0}])

    def side(i: int, g: float) -> dict:
        r = res.iloc[i]
        return {"gravity_g": g, "spread_rate_mm_s": float(r["spread_rate_mm_s"]), "flame_temp_k": _none(r["flame_temp_k"]),
                "extinction_probability": float(r["extinction_probability"]), "risk_index": float(r["risk_index"])}

    return {"scenario": {k: sc[k] for k in ("material", "o2_percent", "pressure_kpa", "airflow_cm_s")},
            "microgravity": side(0, 0.0), "earth": side(1, 1.0), "data_source": st.dataset.source}


def passport(st: AppState, cond: dict) -> dict:
    scs = [{**cond, "material": m["id"]} for m in st.materials]
    res = _batch(st, scs)
    entries = []
    for m, sc, (_, r) in zip(st.materials, scs, res.iterrows()):
        entries.append({"material": m["id"], "label": m["label"], "fuel_type": m["fuel_type"],
                        "risk_index": float(r["risk_index"]), "grade": scoring.grade_for(float(r["risk_index"])),
                        "spread_rate_mm_s": float(r["spread_rate_mm_s"]),
                        "extinction_probability": float(r["extinction_probability"]),
                        "flame_temp_k": _none(r["flame_temp_k"]),
                        "matching_runs": retrieval.count_matching(st.dataset.df, sc)})
    entries.sort(key=lambda e: e["label"])
    return {"conditions": cond, "entries": entries, "data_source": st.dataset.source}


_EFFECTS = {  # 06_TIER4_SPEC action catalogue, applied to the scenario passed to the predictor
    "vent_off": lambda s: {**s, "airflow_cm_s": 0.0},
    "co2_extinguisher": lambda s: {**s, "o2_percent": max(15.0, s["o2_percent"] - 6.0)},
    "lower_o2": lambda s: {**s, "o2_percent": max(15.0, s["o2_percent"] - 3.0)},
    "vent_max": lambda s: {**s, "airflow_cm_s": 50.0},
    "wait": lambda s: dict(s),
}


def advise(st: AppState, sc: dict, state: dict, options: list[str]) -> dict:
    """Recommendation is computed from the model (lowest resulting risk), never by an LLM (06 section B)."""
    scores: dict[str, float] = {}
    modelled = [o for o in options if o in _EFFECTS]
    if modelled:
        res = _batch(st, [_EFFECTS[o](sc) for o in modelled])
        scores.update({o: float(r) for o, r in zip(modelled, res["risk_index"])})
    if "isolate_evacuate" in options:  # fixed score favouring safety when the fire is already dangerous
        scores["isolate_evacuate"] = 10.0 if state["risk_index"] >= 60 else 60.0
    best = min(scores, key=lambda k: (scores[k], k))
    near = retrieval.nearest_runs(st.dataset.df, sc)
    return {"recommended_action_id": best,
            "justification": f"[Template] '{best}' gives the lowest modelled risk ({scores[best]:.0f}/100) among the options.",
            "cited_run_ids": near["run_id"].tolist()[:1], "generated_by": "template", "data_source": st.dataset.source}
