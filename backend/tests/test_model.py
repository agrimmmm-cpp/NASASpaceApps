"""Tier 2 model tests: training, caching, direction of effects, SHAP additivity and fallbacks (docs/04_MODEL_SPEC.md)."""
import random

import numpy as np
import pandas as pd
import pytest

import config
import model
import sanity_check
import services
from conftest import SCENARIO
from data_loader import DataError, Dataset, load_dataset
from predictor import FEATURES


@pytest.fixture(scope="module")
def ds():
    return load_dataset(real_csv=config.DATA_DIR / "does_not_exist.csv", report_path=None)


@pytest.fixture(scope="module")
def materials(ds):
    return [m["id"] for m in services.build_materials(ds.df)]


@pytest.fixture(scope="module")
def pred(ds, materials, tmp_path_factory):
    return model.load_or_train(ds, materials, models_dir=tmp_path_factory.mktemp("models"))


def _x(**over):
    return pd.DataFrame([{**SCENARIO, **over}])[FEATURES]


def test_metrics_and_version(pred, ds):
    m = pred.metrics
    assert m["n_train"] == len(ds.df)
    assert m["spread_r2"] > 0.5 and m["temp_r2"] > 0.5 and m["extinction_auc"] > 0.7
    assert pred.version.endswith(ds.sha256[:8]) and pred.spread_ref >= 0.1 and not pred.is_stub


def test_training_is_deterministic(ds, materials):
    a, b = model.train(ds, materials), model.train(ds, materials)
    X = pd.DataFrame([{**SCENARIO, "o2_percent": o} for o in (16, 21, 30, 38)])[FEATURES]
    pa, pb = model.GBPredictor(a).predict_batch(X), model.GBPredictor(b).predict_batch(X)
    pd.testing.assert_frame_equal(pa, pb)  # I-13
    assert a.spread_ref == b.spread_ref and a.metrics == b.metrics


def test_artifact_cache_roundtrip_and_invalidation(ds, materials, tmp_path):
    first = model.load_or_train(ds, materials, models_dir=tmp_path)
    path = model.artifact_path(ds, tmp_path)
    assert path.exists()
    second = model.load_or_train(ds, materials, models_dir=tmp_path)
    assert second.version == first.version                        # loaded from cache, not retrained
    pd.testing.assert_frame_equal(first.predict_batch(_x()), second.predict_batch(_x()))
    changed = Dataset(df=ds.df, source=ds.source, path=ds.path, sha256="deadbeef" + ds.sha256[8:], report={})
    assert model.artifact_path(changed, tmp_path) != path         # new data => new artifact name => retrain
    path.write_bytes(b"corrupt")                                  # corrupt cache => retrain, no crash
    assert model.load_or_train(ds, materials, models_dir=tmp_path).metrics["n_train"] == len(ds.df)


def test_too_little_data_raises_readable_error(ds, materials):
    tiny = Dataset(df=ds.df.head(10), source="nasa", path=ds.path, sha256="x" * 64, report={})
    with pytest.raises(DataError, match="at least 30"):
        model.train(tiny, materials)


def test_all_targets_missing_is_rejected(ds, materials):
    df = ds.df.copy()
    df["extinguished"] = pd.array([pd.NA] * len(df), dtype="boolean")
    with pytest.raises(DataError, match="extinction"):
        model.train(Dataset(df=df, source="nasa", path=ds.path, sha256="y" * 64, report={}), materials)


def test_single_class_extinction_uses_constant_probability(ds, materials):
    df = ds.df.copy()
    df["extinguished"] = pd.array([False] * len(df), dtype="boolean")
    p = model.GBPredictor(model.train(Dataset(df=df, source="nasa", path=ds.path, sha256="z" * 64, report={}), materials))
    assert p.metrics["extinction_auc"] is None                     # undefined metric is null, not faked
    assert float(p.predict_batch(_x())["extinction_probability"].iat[0]) == 0.0
    base, shap = p.explain(SCENARIO, {})
    assert isinstance(shap, list)


def test_positive_class_is_extinguished(pred):
    starved = pred.predict_batch(_x(o2_percent=16, airflow_cm_s=1))["extinction_probability"].iat[0]
    fed = pred.predict_batch(_x(o2_percent=35, airflow_cm_s=15))["extinction_probability"].iat[0]
    assert starved > 0.7 and fed < 0.2  # R-13: not inverted


def test_sanity_checks_pass_on_mock(pred, ds, materials):
    mats = services.build_materials(ds.df)
    st = services.AppState(dataset=ds, predictor=pred, materials=mats, reference=services.reference_scenario(ds.df, mats))
    results = sanity_check.run_checks(st)
    assert all(ok for _, ok, _ in results), [r for r in results if not r[1]]


def test_unknown_material_rejected_by_encoder(pred):
    with pytest.raises(ValueError):
        pred.predict_batch(_x(material="unobtainium"))


def test_batch_equals_single(pred):
    rnd = random.Random(3)
    rows = [{"material": rnd.choice(["PMMA", "Nomex", "heptane"]), "o2_percent": rnd.uniform(15, 40),
             "pressure_kpa": rnd.uniform(50, 101.3), "airflow_cm_s": rnd.uniform(0, 50), "gravity_g": rnd.random()}
            for _ in range(25)]
    batch = pred.predict_batch(pd.DataFrame(rows)[FEATURES])
    for i, r in enumerate(rows):
        single = pred.predict_batch(pd.DataFrame([r])[FEATURES]).iloc[0]
        assert single["risk_index"] == batch["risk_index"].iat[i]  # I-16: the heatmap path equals the predict path


def test_shap_structure_and_additivity(pred):
    rnd = random.Random(5)
    errs = []
    for _ in range(60):
        sc = {"material": rnd.choice(["PMMA", "Nomex", "SIBAL", "heptane", "ethanol", "methane"]),
              "o2_percent": rnd.uniform(15, 40), "pressure_kpa": rnd.uniform(50, 101.3),
              "airflow_cm_s": rnd.uniform(0, 50), "gravity_g": rnd.choice([0, 0.17, 0.38, 1])}
        base, shap = pred.explain(sc, {})
        risk = float(pred.predict_batch(pd.DataFrame([sc])[FEATURES])["risk_index"].iat[0])
        assert {s["feature"] for s in shap} == {"material", "o2_percent", "pressure_kpa", "airflow_cm_s", "gravity_g"}
        mags = [abs(s["contribution"]) for s in shap]
        assert mags == sorted(mags, reverse=True)                  # sorted by |contribution| desc
        errs.append(abs(base + sum(s["contribution"] for s in shap) - risk))
    assert max(errs) <= 8.0 and np.median(errs) <= 1.0, (max(errs), np.median(errs))  # approximate only: clipping/rounding


def test_shap_signs_make_sense(pred):
    base, shap = pred.explain({**SCENARIO, "o2_percent": 38.0}, {})
    o2 = next(s for s in shap if s["feature"] == "o2_percent")["contribution"]
    assert o2 > 0  # high oxygen raises risk
    base, shap = pred.explain({**SCENARIO, "o2_percent": 16.0, "airflow_cm_s": 1.0}, {})
    assert next(s for s in shap if s["feature"] == "o2_percent")["contribution"] < 0  # low oxygen lowers it


def test_shap_failure_falls_back_to_empty(pred, monkeypatch):
    fresh = model.GBPredictor(pred.art)
    monkeypatch.setattr(model.GBPredictor, "_explainers", lambda self: (_ for _ in ()).throw(ImportError("no shap")))
    base, shap = fresh.explain(SCENARIO, {})
    assert shap == [] and base > 0                                 # never fails the request (R-11)


def test_api_reports_real_model(client):
    if client.mode != "real":
        pytest.skip("real model only")
    m = client.get("/api/meta").json()["model"]
    assert m["stub"] is False and m["metrics"]["extinction_auc"] is not None
    p = client.post("/api/predict", json=SCENARIO).json()
    assert p["model_version"] == m["version"] and len(p["shap"]) == 5


def test_503_while_model_not_ready(client):
    st = client.app.state.fire
    saved = st.predictor
    st.predictor = None
    try:
        assert client.get("/api/health").json()["model_ready"] is False
        r = client.post("/api/predict", json=SCENARIO)
        assert r.status_code == 503 and r.json()["error"]["code"] == "MODEL_NOT_READY"
        assert client.get("/api/meta").status_code == 200          # meta works while warming up
        assert client.get("/api/meta").json()["model"]["version"] == "untrained"
    finally:
        st.predictor = saved
