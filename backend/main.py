"""FastAPI app. Run: `uvicorn main:app --reload` from /backend (port 8000).  Contract: docs/02_API_CONTRACT.md"""
from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware

import config
import errors
import ai
import tts
import model as model_mod
import services
from data_loader import load_csv, load_dataset, records
from errors import model_not_ready
from predictor import ToyPredictor
from schemas import (AdviseRequest, AdviseResponse, AskRequest, AskResponse, CompareRequest, Compare, Health, Heatmap,
                     HeatmapRequest, InsightsRequest, InsightsResponse, Meta, Passport, PassportRequest, Prediction,
                     RunsResponse, Scenario, TTSRequest)
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
    else:
        # Train (or load the cached artifact) off the request path: endpoints answer 503 MODEL_NOT_READY meanwhile.
        threading.Thread(target=_train_in_background, args=(st,), name="model-train", daemon=True).start()
    return st


def _train_in_background(st: AppState) -> None:
    try:
        predictor = model_mod.load_or_train(st.dataset, st.material_ids)
    except Exception as e:  # health stays model_ready=false; the reason is in the logs and /api/health-adjacent state
        st.model_error = str(e)
        log.error("MODEL TRAINING FAILED: %s", e)
        return
    _load_gravity_reference(st)  # before publishing, so model_ready also means compare is final
    st.predictor = predictor
    log.info("model ready: %s", predictor.version)


def _load_gravity_reference(st: AppState) -> None:
    """When the loaded (real) data has no 0 g vs 1 g contrast, train/load the mock model as a SIMULATED reference for
    /api/compare only. Never mixed into predictions, runs, insights or metrics; compare labels it data_source="mock"."""
    if st.dataset.source == "mock" or services.data_capabilities(st.dataset.df)["gravity_effect"]:
        return
    try:
        mock = load_csv(config.MOCK_CSV, "mock", report_path=None) if config.MOCK_CSV.exists() else None
        if mock is None:
            log.info("no mock CSV; Earth-vs-Space stays unavailable on this data")
            return
        mats = [m["id"] for m in services.build_materials(mock.df)]
        st.gravity_ref = model_mod.load_or_train(mock, mats)
        st.gravity_ref_materials = mats
        log.info("simulated gravity reference ready (mock model) for compare: %s", mats)
    except Exception as e:  # optional feature: compare falls back to the loaded model
        log.warning("gravity reference unavailable: %s", e)


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
    if p is not None and getattr(p, "metrics", None):
        metrics = p.metrics
    return {
        "data_source": st.dataset.source, "n_runs": st.dataset.n_runs,
        "materials": st.materials, "experiments": sorted(df["experiment"].unique().tolist()),
        "vehicles": config.VEHICLES, "ranges": config.RANGES, "gravity_marks": config.GRAVITY_MARKS,
        "risk_bands": config.RISK_BANDS, "grade_bands": config.GRADE_BANDS,
        "model": {
            "version": p.version if p else "untrained",
            "trained_at": getattr(p, "trained_at", st.trained_at),
            "spread_ref_mm_s": p.spread_ref if p else config.SPREAD_REF_DEFAULT_MM_S,
            "weights": {"spread": config.W_SPREAD, "survival": config.W_SURVIVAL},
            "critical_length_mm": config.CRITICAL_LENGTH_MM, "ci_widen": config.CI_WIDEN,
            "metrics": metrics,
            "capabilities": getattr(p, "capabilities", None) or services.data_capabilities(df),
            "stub": bool(p and p.is_stub),
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
    return ai.insights(st, sc, services.predict_one(st, sc))


@app.post("/api/ask", response_model=AskResponse)
def ask(body: AskRequest, request: Request):
    st = _ready(_st(request))
    sc = body.scenario.model_dump()
    services.check_material(st, sc["material"])
    return ai.ask(st, sc, services.predict_one(st, sc), body.question)


@app.post("/api/tts", responses={200: {"content": {"audio/wav": {}}}})
def text_to_speech(body: TTSRequest):
    """Nova's voice (Gemini TTS). 503 + envelope when unavailable; the frontend then uses the browser voice."""
    try:
        audio, mime = tts.synthesize(body.text)
    except tts.TTSUnavailable:
        raise errors.ApiException("INTERNAL", "Voice unavailable right now; using the browser voice instead.", 503)
    return Response(content=audio, media_type=mime, headers={"Cache-Control": "private, max-age=3600"})


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
    return services.advise(st, body.scenario.model_dump(), body.state.model_dump(), body.options)
