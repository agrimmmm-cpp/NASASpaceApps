"""Contract tests (docs/02_API_CONTRACT.md). Run against the stub predictor now; same assertions must hold for the real model."""
import json
import random
from pathlib import Path

import numpy as np
import pytest

import schemas
from conftest import SCENARIO

FIXTURES = Path(__file__).resolve().parents[2] / "docs" / "fixtures"
FIXTURE_MODELS = {
    "health.json": schemas.Health, "meta.json": schemas.Meta, "runs.json": schemas.RunsResponse,
    "predict.json": schemas.Prediction, "predict_edge_cases.json": schemas.Prediction,
    "heatmap.json": schemas.Heatmap, "compare.json": schemas.Compare, "insights.json": schemas.InsightsResponse,
    "ask.json": schemas.AskResponse, "error_validation.json": schemas.ApiError,
    "error_model_not_ready.json": schemas.ApiError,
}


# 1. every fixture validates against its Pydantic model
@pytest.mark.parametrize("name,model", FIXTURE_MODELS.items())
def test_fixture_validates(name, model):
    model.model_validate(json.loads((FIXTURES / name).read_text()))


# 2. every endpoint returns a body validating against the same model
def test_endpoints_validate(client):
    schemas.Health.model_validate(client.get("/api/health").json())
    meta = schemas.Meta.model_validate(client.get("/api/meta").json())
    schemas.RunsResponse.model_validate(client.get("/api/runs").json())
    schemas.Prediction.model_validate(client.post("/api/predict", json=SCENARIO).json())
    schemas.Heatmap.model_validate(client.post("/api/heatmap", json={k: SCENARIO[k] for k in ("material", "pressure_kpa", "gravity_g")}).json())
    schemas.Compare.model_validate(client.post("/api/compare", json={k: v for k, v in SCENARIO.items() if k != "gravity_g"}).json())
    schemas.InsightsResponse.model_validate(client.post("/api/insights", json={"scenario": SCENARIO}).json())
    schemas.AskResponse.model_validate(client.post("/api/ask", json={"question": "Why?", "scenario": SCENARIO}).json())
    cond = {k: v for k, v in SCENARIO.items() if k != "material"}
    p = schemas.Passport.model_validate(client.post("/api/passport", json=cond).json())
    assert [e.material for e in p.entries] == [m.id for m in sorted(meta.materials, key=lambda m: m.label)]
    schemas.AdviseResponse.model_validate(client.post("/api/advise", json={
        "scenario": SCENARIO, "t_s": 10, "state": {"spread_rate_mm_s": 1, "extinction_probability": 0.2, "risk_index": 40},
        "options": ["vent_off", "wait"]}).json())


def test_meta_is_self_consistent(client):
    m = client.get("/api/meta").json()
    assert m["data_source"] in ("mock", "nasa") and m["n_runs"] > 0
    assert m["model"]["weights"] == {"spread": 0.6, "survival": 0.4}
    assert [b["band"] for b in m["risk_bands"]] == ["low", "elevated", "high", "critical"]


# 4. out-of-range / unknown input -> 422 envelope on every endpoint (I-14)
ENDPOINT_BODIES = {
    "/api/predict": SCENARIO,
    "/api/heatmap": {k: SCENARIO[k] for k in ("material", "pressure_kpa", "gravity_g")},
    "/api/compare": {k: v for k, v in SCENARIO.items() if k != "gravity_g"},
    "/api/insights": {"scenario": SCENARIO},
    "/api/ask": {"question": "q", "scenario": SCENARIO},
}


def _mutate(path, body, field, value):
    b = json.loads(json.dumps(body))
    (b["scenario"] if "scenario" in b else b)[field] = value
    return b


@pytest.mark.parametrize("path,body", ENDPOINT_BODIES.items())
@pytest.mark.parametrize("field,value", [("o2_percent", 55), ("o2_percent", 5), ("pressure_kpa", 10), ("airflow_cm_s", -1), ("gravity_g", 2)])
def test_out_of_range_is_422(client, path, body, field, value):
    original = body["scenario"] if "scenario" in body else body
    if field not in original:  # endpoint doesn't take this field (e.g. heatmap has no o2) -> nothing to test
        pytest.skip("field not part of this endpoint")
    probe = _mutate(path, body, field, value)
    r = client.post(path, json=probe)
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "VALIDATION_ERROR" and err["details"]["field"] == field and "detail" not in r.json()


@pytest.mark.parametrize("path,body", ENDPOINT_BODIES.items())
def test_unknown_material_is_422(client, path, body):
    r = client.post(path, json=_mutate(path, body, "material", "unobtainium"))
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_MATERIAL"


def test_nan_and_bad_json_and_missing_are_envelopes(client):
    assert client.post("/api/predict", content=b"{not json", headers={"content-type": "application/json"}).json()["error"]["code"] == "VALIDATION_ERROR"
    assert client.post("/api/predict", json={}).status_code == 422
    r = client.post("/api/predict", content=b'{"material":"PMMA","o2_percent":NaN,"pressure_kpa":100,"airflow_cm_s":1,"gravity_g":0}',
                    headers={"content-type": "application/json"})
    assert r.status_code == 422


def test_ask_length_limit(client):
    assert client.post("/api/ask", json={"question": "x" * 501, "scenario": SCENARIO}).status_code == 422
    assert client.post("/api/ask", json={"question": "", "scenario": SCENARIO}).status_code == 422


def test_cors_allows_dev_origin(client):
    r = client.options("/api/predict", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


# I-07 + I-16: heatmap shape/orientation and consistency with /predict
def test_heatmap_matches_predict(client):
    hm = client.post("/api/heatmap", json={"material": "PMMA", "pressure_kpa": 80.0, "gravity_g": 0.17}).json()
    assert len(hm["o2_values"]) == len(hm["airflow_values"]) == 20
    assert hm["o2_values"] == sorted(hm["o2_values"]) and hm["o2_values"][0] == 15 and hm["o2_values"][-1] == 40
    assert hm["airflow_values"][0] == 0 and hm["airflow_values"][-1] == 50
    assert len(hm["risk"]) == 20 and all(len(r) == 20 for r in hm["risk"])
    rnd = random.Random(7)
    for _ in range(12):
        ia, io = rnd.randrange(20), rnd.randrange(20)  # asymmetric indices catch a transposed grid
        p = client.post("/api/predict", json={"material": "PMMA", "pressure_kpa": 80.0, "gravity_g": 0.17,
                                              "o2_percent": hm["o2_values"][io], "airflow_cm_s": hm["airflow_values"][ia]}).json()
        assert abs(p["risk_index"] - hm["risk"][ia][io]) <= 0.1, (ia, io)


# 5. CI ordering over random scenarios (I-15), widening flag (I-21), band/risk consistency
def test_ci_ordering_and_widening(client):
    rnd = random.Random(11)
    for _ in range(150):
        sc = {"material": rnd.choice(["PMMA", "Nomex", "SIBAL", "heptane", "ethanol", "methane"]),
              "o2_percent": rnd.uniform(15, 40), "pressure_kpa": rnd.uniform(50, 101.3),
              "airflow_cm_s": rnd.uniform(0, 50), "gravity_g": rnd.choice([0, 0.17, 0.38, 1, rnd.random()])}
        p = client.post("/api/predict", json=sc).json()
        lo, hi = p["spread_rate_ci"]
        assert 0 <= lo <= p["spread_rate_mm_s"] <= hi
        assert p["ci_widened"] == (0.05 < sc["gravity_g"] < 0.95)
        assert 0 <= p["risk_index"] <= 100 and 0 <= p["extinction_probability"] <= 1
        bands = {"low": (0, 25), "elevated": (25, 50), "high": (50, 75), "critical": (75, 100.01)}
        assert bands[p["risk_band"]][0] <= p["risk_index"] < bands[p["risk_band"]][1]


def test_risk_formula_matches_published_constants(client):
    m = client.get("/api/meta").json()["model"]
    p = client.post("/api/predict", json=SCENARIO).json()
    expect = 100 * (0.6 * min(p["spread_rate_mm_s"] / m["spread_ref_mm_s"], 1) + 0.4 * (1 - p["extinction_probability"]))
    assert abs(p["risk_index"] - expect) < 0.5  # rounding of the displayed inputs


def test_time_to_critical_rules(client):
    slow = client.post("/api/predict", json={**SCENARIO, "o2_percent": 15, "airflow_cm_s": 0, "pressure_kpa": 50}).json()
    assert slow["time_to_critical_s"] is None or slow["time_to_critical_s"] <= 3600
    fast = client.post("/api/predict", json={**SCENARIO, "o2_percent": 40, "gravity_g": 1}).json()
    assert fast["time_to_critical_s"] == pytest.approx(100 / fast["spread_rate_mm_s"], rel=0.02)


def test_compare_sides(client):
    c = client.post("/api/compare", json={k: v for k, v in SCENARIO.items() if k != "gravity_g"}).json()
    assert c["microgravity"]["gravity_g"] == 0.0 and c["earth"]["gravity_g"] == 1.0
    assert c["microgravity"]["flame_temp_k"] < c["earth"]["flame_temp_k"]  # 0 g flames are cooler


def test_runs_filters_and_nulls(client):
    all_ = client.get("/api/runs").json()
    assert all_["total"] == len(all_["runs"]) and not all_["truncated"]
    ids = [r["run_id"] for r in all_["runs"]]
    assert ids == sorted(ids)
    pm = client.get("/api/runs", params={"material": "PMMA", "gravity_max": 0.0, "o2_min": 20}).json()
    assert pm["runs"] and all(r["material"] == "PMMA" and r["gravity_g"] == 0 and r["o2_percent"] >= 20 for r in pm["runs"])
    assert client.get("/api/runs", params={"limit": 3}).json()["truncated"] is True
    assert client.get("/api/runs", params={"limit": 0}).status_code == 422


def test_stub_citations_are_real_run_ids(client):
    all_ids = {r["run_id"] for r in client.get("/api/runs").json()["runs"]}
    ins = client.post("/api/insights", json={"scenario": SCENARIO}).json()
    assert set(ins["retrieved_run_ids"]) <= all_ids and len(ins["retrieved_run_ids"]) == 5
    for i in ins["insights"]:
        assert i["cited_run_ids"] and set(i["cited_run_ids"]) <= set(ins["retrieved_run_ids"])  # I-11
    assert ins["generated_by"] == "template"


def test_insights_ignore_client_prediction(client):
    r = client.post("/api/insights", json={"scenario": SCENARIO, "prediction": {"risk_index": 9999}})
    assert r.status_code == 200
