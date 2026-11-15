"""Single source of truth for every constant (I-06). Published to the frontend via /api/meta.

Nothing in the frontend may duplicate these values. Documented in docs/04_MODEL_SPEC.md section 1.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
ROOT = BACKEND_DIR.parent
load_dotenv(ROOT / ".env")

# ---- paths ---------------------------------------------------------------
DATA_DIR = ROOT / "data"
REAL_CSV = DATA_DIR / "combustion_runs.csv"          # never written by code (I-17)
MOCK_CSV = DATA_DIR / "mock_combustion_runs.csv"
SCHEMA_JSON = DATA_DIR / "schema.json"
VOCAB_JSON = DATA_DIR / "vocab.json"
MODELS_DIR = BACKEND_DIR / "models"
DATA_REPORT_JSON = BACKEND_DIR / "data_report.json"

# ---- determinism (I-13) ---------------------------------------------------
MOCK_SEED = 20241014
RANDOM_STATE = 42

# ---- input ranges (I-02, I-14) -------------------------------------------
RANGES: dict[str, dict[str, float]] = {
    "o2_percent": {"min": 15.0, "max": 40.0, "step": 0.5},
    "pressure_kpa": {"min": 50.0, "max": 101.3, "step": 0.1},
    "airflow_cm_s": {"min": 0.0, "max": 50.0, "step": 1.0},
    "gravity_g": {"min": 0.0, "max": 1.0, "step": 0.01},
}
GRAVITY_MARKS = [
    {"value": 0.0, "label": "Microgravity"},
    {"value": 0.17, "label": "Moon"},
    {"value": 0.38, "label": "Mars"},
    {"value": 1.0, "label": "Earth"},
]
HEATMAP_N = 20  # 20 x 20 grid (I-07)

# ---- risk formula --------------------------------------------------------
W_SPREAD = 0.6
W_SURVIVAL = 0.4
# Used by the stub predictor and until a trained model supplies its own 99th-percentile value.
SPREAD_REF_DEFAULT_MM_S = 6.0
CRITICAL_LENGTH_MM = 100.0
NO_ESCALATION_SPREAD_MM_S = 0.05
TTC_CAP_S = 3600.0

# lower bound inclusive, upper exclusive; the last band includes 100
RISK_BANDS = [
    {"band": "low", "min": 0.0, "max": 25.0},
    {"band": "elevated", "min": 25.0, "max": 50.0},
    {"band": "high", "min": 50.0, "max": 75.0},
    {"band": "critical", "min": 75.0, "max": 100.0},
]
GRADE_BANDS = [  # grade = first band where risk < max_risk (Tier 4)
    {"grade": "A", "max_risk": 20.0},
    {"grade": "B", "max_risk": 35.0},
    {"grade": "C", "max_risk": 50.0},
    {"grade": "D", "max_risk": 65.0},
    {"grade": "E", "max_risk": 80.0},
    {"grade": "F", "max_risk": 100.0},
]

# ---- confidence interval (I-15, I-21) ------------------------------------
CI_QUANTILES = (0.1, 0.9)
CI_WIDEN = {"g_min": 0.05, "g_max": 0.95, "factor": 1.5}

# ---- matching runs (04 section 6) and retrieval (04 section 7) -----------
MATCH_TOLERANCE = {"o2_percent": 2.0, "pressure_kpa": 10.0, "airflow_cm_s": 5.0, "gravity_g": 0.1}
RETRIEVAL_K = 5
RETRIEVAL_WEIGHTS = {"o2_percent": 1.0, "pressure_kpa": 0.5, "airflow_cm_s": 1.0, "gravity_g": 2.0}
RETRIEVAL_MATERIAL_PENALTY = 1.0

# ---- vehicle presets (the only place they live) --------------------------
VEHICLES = [
    {"id": "iss", "label": "ISS", "o2_percent": 21.0, "pressure_kpa": 101.3, "airflow_cm_s": 10.0,
     "gravity_g": 0.0, "note": "Typical ISS cabin atmosphere (sea-level air)"},
    {"id": "gateway", "label": "Artemis Gateway", "o2_percent": 21.0, "pressure_kpa": 101.3,
     "airflow_cm_s": 10.0, "gravity_g": 0.0, "note": "Placeholder - Track C to verify"},
    {"id": "lunar", "label": "Lunar Habitat", "o2_percent": 34.0, "pressure_kpa": 56.5,
     "airflow_cm_s": 8.0, "gravity_g": 0.17, "note": "Exploration atmosphere (34% O2, 56.5 kPa)"},
    {"id": "mars_transit", "label": "Mars Transit", "o2_percent": 26.5, "pressure_kpa": 70.3,
     "airflow_cm_s": 8.0, "gravity_g": 0.0, "note": "Placeholder - Track C to verify"},
]

# ---- server --------------------------------------------------------------
CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


def stub_mode() -> bool:
    """Read at call time so tests can flip it. Default on until the real model ships (Tier 2)."""
    return os.getenv("STUB_MODE", "1").strip().lower() in ("1", "true", "yes", "on")


LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai")
LLM_TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "8") or 8)


def llm_enabled() -> bool:
    return bool(os.getenv("LLM_API_KEY", "").strip())
