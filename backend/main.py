"""FastAPI app. Run: `uvicorn main:app --reload` from /backend (port 8000).  Contract: docs/02_API_CONTRACT.md"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware

import config
import errors
import services
from data_loader import load_dataset, records
from errors import model_not_ready
from predictor import ToyPredictor
from schemas import (AdviseRequest, AdviseResponse, AskRequest, AskResponse, CompareRequest, Compare, Health, Heatmap,
                     HeatmapRequest, InsightsRequest, InsightsResponse, Meta, Passport, PassportRequest, Prediction,
                     RunsResponse, Scenario)
from services import ACTION_IDS, AppState

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("fire")


def build_state() -> AppState:
    ds = load_dataset()  # DataError here stops startup with a readable message (I-17)
    materials = services.build_materials(ds.df)
    st = AppState(dataset=ds, predictor=None, materials=materials,
                  reference=services.reference_scenario(ds.df, materials),
                  trained_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    if config.stub_mode():
        st.predictor = ToyPredictor()
        log.warning("STUB_MODE=1: predictions come from the toy surface, not a trained model")
    # Tier 2: otherwise load/train the gradient-boosting predictor here (background thread) and set st.predictor.
    return st


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.fire = build_state()
    log.info("data_source=%s runs=%d", app.state.fire.dataset.source, app.state.fire.dataset.n_runs)
    yield


app = FastAPI(title="Fire Command: Zero-G API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
errors.install(app)


def _st(request: Request) -> AppState:
    return request.app.state.fire


def _ready(st: AppState) -> AppState:
    if st.predictor is None:
        raise model_not_ready()
    return st


@app.get("/api/health", response_model=Health)
def health(request: Request):
    st = _st(request)
    return {"status": "ok", "model_ready": st.predictor is not None, "data_source": st.dataset.source}


@app.get("/api/meta", response_model=Meta)
def meta(request: Request):
    st = _st(request)
    df, p = st.dataset.df, st.predictor
    metrics = {"n_train": len(df), **{k: None for k in ("spread_r2", "temp_r2", "extinction_auc")}}
    if st.metrics:
        metrics = st.metrics
    return {
        "data_source": st.dataset.source, "n_runs": st.dataset.n_runs,
        "materials": st.materials, "experiments": sorted(df["experiment"].unique().tolist()),
        "vehicles": config.VEHICLES, "ranges": config.RANGES, "gravity_marks": config.GRAVITY_MARKS,
        "risk_bands": config.RISK_BANDS, "grade_bands": config.GRADE_BANDS,
        "model": {
            "version": p.version if p else "untrained", "trained_at": st.trained_at,
            "spread_ref_mm_s": p.spread_ref if p else config.SPREAD_REF_DEFAULT_MM_S,
            "weights": {"spread": config.W_SPREAD, "survival": config.W_SURVIVAL},
            "critical_length_mm": config.CRITICAL_LENGTH_MM, "ci_widen": config.CI_WIDEN,
            "metrics": metrics, "stub": bool(p and p.is_stub),
        },
        "llm_enabled": config.llm_enabled(),
    }


@app.get("/api/runs", response_model=RunsResponse)
def runs(request: Request, material: Optional[str] = None, experiment: Optional[str] = None,
         gravity_min: Optional[float] = None, gravity_max: Optional[float] = None,
         o2_min: Optional[float] = None, o2_max: Optional[float] = None,
         limit: int = Query(5000, ge=1, le=5000)):
    st = _st(request)
    df = st.dataset.df
    if material:
        df = df[df["material"] == material]
    if experiment:
        df = df[df["experiment"] == experiment]
    if gravity_min is not None:
        df = df[df["gravity_g"] >= gravity_min]
    if gravity_max is not None:
        df = df[df["gravity_g"] <= gravity_max]
    if o2_min is not None:
        df = df[df["o2_percent"] >= o2_min]
    if o2_max is not None:
        df = df[df["o2_percent"] <= o2_max]
    df = df.sort_values("run_id", kind="stable")
    total = len(df)
    return {"runs": records(df.head(limit)), "total": total, "truncated": total > limit,
            "data_source": st.dataset.source}


@app.post("/api/predict", response_model=Prediction)
def predict(body: Scenario, request: Request):
    st = _ready(_st(request))
    services.check_material(st, body.material)
    return services.predict_one(st, body.model_dump())


@app.post("/api/heatmap", response_model=Heatmap)
def heatmap(body: HeatmapRequest, request: Request):
    st = _ready(_st(request))
    services.check_material(st, body.material)
    return services.heatmap(st, body.material, body.pressure_kpa, body.gravity_g)


@app.post("/api/compare", response_model=Compare)
def compare(body: CompareRequest, request: Request):
    st = _ready(_st(request))
    services.check_material(st, body.material)
    return services.compare(st, body.model_dump())


@app.post("/api/insights", response_model=InsightsResponse)
def insights(body: InsightsRequest, request: Request):
    st = _ready(_st(request))
    sc = body.scenario.model_dump()
    services.check_material(st, sc["material"])
    if not st.predictor.is_stub:
        raise model_not_ready()  # Tier 3 (retrieval + LLM + templates)
    return services.stub_insights(st, sc, services.predict_one(st, sc))


@app.post("/api/ask", response_model=AskResponse)
def ask(body: AskRequest, request: Request):
    st = _ready(_st(request))
    sc = body.scenario.model_dump()
    services.check_material(st, sc["material"])
    if not st.predictor.is_stub:
        raise model_not_ready()  # Tier 3
    return services.stub_ask(st, sc, services.predict_one(st, sc))


@app.post("/api/passport", response_model=Passport)
def passport(body: PassportRequest, request: Request):
    st = _ready(_st(request))
    return services.passport(st, body.model_dump())


@app.post("/api/advise", response_model=AdviseResponse)
def advise(body: AdviseRequest, request: Request):
    st = _ready(_st(request))
    services.check_material(st, body.scenario.material)
    bad = [o for o in body.options if o not in ACTION_IDS]
    if bad:
        raise errors.ApiException("VALIDATION_ERROR", f"Unknown action ids: {bad}", 422,
                                  {"field": "options", "allowed": ACTION_IDS})
    if not st.predictor.is_stub:
        raise model_not_ready()  # Tier 4
    return services.advise(st, body.scenario.model_dump(), body.state.model_dump(), body.options)
