"""Real NASA data pipeline (data/fetch_psi.py -> data/mapping/psi_to_schema.py -> data/candidate/) and the model/API on top of it.

Offline: uses the committed raw PSI files in data/raw/. The API tests run an isolated app state on the candidate CSV and restore the
previous state afterwards so other test modules are unaffected.
"""
import importlib.util
import json
import os
import random
import time
from pathlib import Path

import pandas as pd
import pytest

import config
import model
import sanity_check
import services
from data_loader import load_csv
from predictor import FEATURES

DATA = config.DATA_DIR
CANDIDATE = DATA / "candidate" / "combustion_runs.csv"
pytestmark = pytest.mark.skipif(not CANDIDATE.exists(), reason="run `make real-data` first")


@pytest.fixture(scope="module")
def mapping():
    spec = importlib.util.spec_from_file_location("psi_to_schema", DATA / "mapping" / "psi_to_schema.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def mapped(mapping):
    man = {m["accession"]: m for m in json.loads((DATA / "raw" / "MANIFEST.json").read_text())}
    flex, frej, fread = mapping.map_flex(DATA / man["PSI-69"]["path"])
    saf, srej, sread = mapping.map_saffire2(DATA / man["PSI-99"]["path"])
    return {"flex": flex, "frej": frej, "fread": fread, "saf": saf, "srej": srej, "sread": sread}


# ---------------------------------------------------------------- mapping
def test_raw_files_match_manifest():
    import hashlib

    for m in json.loads((DATA / "raw" / "MANIFEST.json").read_text()):
        assert hashlib.sha256((DATA / m["path"]).read_bytes()).hexdigest() == m["sha256"], m["path"]
        assert m["license"] == "CC0-1.0" and m["doi"].startswith("10.60555/")


def test_flex_counts_and_rejections_are_accounted_for(mapped):
    assert mapped["fread"] == 274 and len(mapped["flex"]) == 182
    assert dict(mapped["frej"]) == {"pressure_above_101.3kPa_range": 76, "o2_outside_15_40pct": 15, "bad_pressure": 1}
    assert len(mapped["flex"]) + sum(mapped["frej"].values()) == mapped["fread"]       # every row mapped or rejected, none lost


def test_flex_row_values(mapped):
    f = mapped["flex"].set_index("run_id")
    r = f.loc["FLEX-002"]
    assert (r.material, r.fuel_type, r.experiment, r.gravity_g, r.airflow_cm_s) == ("methanol", "droplet", "FLEX", 0.0, 0.0)
    assert (r.o2_percent, r.pressure_kpa, r.spread_rate_mm_s, r.burn_duration_s) == (21.0, 101.3, 0.6, 5.0)
    assert bool(r.extinguished) is True                                               # test end: Extinction
    assert pd.isna(f.loc["FLEX-001", "extinguished"])                                 # Disruption -> unknown, not guessed
    assert set(f.material) == {"methanol", "heptane"}
    assert f.o2_percent.between(15, 40).all() and f.pressure_kpa.between(50, 101.3).all()
    assert f.flame_temp_k.isna().all()                                                # never measured => never invented
    assert (f.gravity_g == 0).all()


def test_pressure_tolerance_exception_is_documented_per_row(mapped):
    f = mapped["flex"]
    near = f[f.source_note.str.contains("recorded as 101.3")]
    assert len(near) > 0 and (near.pressure_kpa == 101.3).all()
    assert near.source_note.str.contains(r"measured 10[12]\.\d+ kPa").all()           # the measured value is preserved in the note


def test_every_row_carries_provenance_and_assumptions(mapped):
    for df in (mapped["flex"], mapped["saf"]):
        assert df.source_note.str.contains("CC0-1.0").all() and df.source_note.str.contains(r"doi:10\.60555/").all()
    assert mapped["flex"].source_note.str.contains("mm\\^2/s").all() and mapped["flex"].source_note.str.contains("airflow assumed 0").all()
    assert mapped["saf"].source_note.str.contains("100.6 kPa from Olson").all()


def test_saffire_rows(mapped):
    s = mapped["saf"].set_index("run_id")
    assert len(s) == 8 and mapped["sread"] == 9 and dict(mapped["srej"]) == {"mixed_material_sample": 1}
    assert "SAF-2-7" not in s.index                                                   # PMMA + Nomex card: not attributable
    r = s.loc["SAF-2-5"]
    assert (r.material, r.spread_rate_mm_s, r.pressure_kpa, r.airflow_cm_s, r.burn_duration_s) == ("SIBAL", 2.1, 100.6, 20.0, 145.0)
    assert bool(r.extinguished) is False
    assert s.loc["SAF-2-6", "material"] == "SIBAL" and s.loc["SAF-2-6", "spread_rate_mm_s"] == 2.6
    assert "Material inherited" in s.loc["SAF-2-6", "source_note"]
    assert s.loc["SAF-2-9", "material"] == "PMMA" and s.loc["SAF-2-9", "o2_percent"] == 21.95   # '22.0 to 21.9' -> mean
    assert pd.isna(s.loc["SAF-2-8", "spread_rate_mm_s"])                              # Note 4: regression rate, not a spread rate
    for rid in ("SAF-2-1", "SAF-2-2", "SAF-2-3", "SAF-2-4"):                          # silicone: no sustained flame
        assert s.loc[rid, "material"] == "silicone" and bool(s.loc[rid, "extinguished"]) is True and pd.isna(s.loc[rid, "spread_rate_mm_s"])


def test_candidate_file_is_what_the_mapping_produces(mapped):
    cand = pd.read_csv(CANDIDATE).set_index("run_id")
    regen = pd.concat([mapped["flex"], mapped["saf"]]).set_index("run_id")
    assert set(cand.index) == set(regen.index) and len(cand) == 190
    for c in ("o2_percent", "pressure_kpa", "airflow_cm_s", "spread_rate_mm_s", "burn_duration_s"):
        pd.testing.assert_series_equal(cand[c].sort_index().astype(float), regen[c].sort_index().astype(float), check_names=False, atol=1e-9)
    report = json.loads((DATA / "candidate" / "mapping_report.json").read_text())
    assert report["rows_total"] == 190 and len(report["assumptions"]) >= 10


def test_candidate_passes_the_loader_without_drops():
    ds = load_csv(CANDIDATE, "nasa", report_path=None)
    assert len(ds.df) == 190 and ds.report["rows_dropped"] == {} and ds.report["warnings"] == []
    assert ds.report["usable_for_training"]["temp"] == 0 and set(ds.report["gravity_values"]) == {"0.0"}


# ---------------------------------------------------------------- model on real data
@pytest.fixture(scope="module")
def real_ds():
    return load_csv(CANDIDATE, "nasa", report_path=None)


@pytest.fixture(scope="module")
def real_state(real_ds, tmp_path_factory):
    mats = services.build_materials(real_ds.df)
    pred = model.load_or_train(real_ds, [m["id"] for m in mats], models_dir=tmp_path_factory.mktemp("rm"))
    return services.AppState(dataset=real_ds, predictor=pred, materials=mats, reference=services.reference_scenario(real_ds.df, mats))


def test_only_materials_with_enough_rows_are_predictable(real_state):
    assert real_state.material_ids == ["heptane", "methanol"]          # silicone(4) / SIBAL(2) / PMMA(2) < MIN_MATERIAL_ROWS
    assert config.MIN_MATERIAL_ROWS == 10


def test_capabilities_reflect_the_data(real_state, real_ds):
    caps = real_state.predictor.capabilities
    assert caps == {"flame_temp": False, "gravity_effect": False}
    assert services.data_capabilities(real_ds.df) == caps
    mock = load_csv(config.MOCK_CSV, "mock", report_path=None)
    assert services.data_capabilities(mock.df) == {"flame_temp": True, "gravity_effect": True}


def test_small_data_settings_and_honest_metrics(real_state):
    art = real_state.predictor.art
    assert art.spread.max_depth == 1 and art.ext.max_depth == 1         # shallow settings for < 300 rows
    m = real_state.predictor.metrics
    assert art.temp is None and m["temp_r2"] is None                    # no temperature model, null metric (not faked)
    assert m["n_train"] == 182 and 0.1 < m["spread_r2"] < 0.6 and 0.55 < m["extinction_auc"] < 0.9
    # The weak scores are the finding, not a bug: guard against silently pretending they are high.
    assert m["spread_r2"] < 0.6 and m["extinction_auc"] < 0.9


def test_predictions_are_well_formed_without_temperature(real_state):
    df = pd.DataFrame([{"material": m, "o2_percent": o, "pressure_kpa": 101.3, "airflow_cm_s": 0.0, "gravity_g": 0.0}
                       for m in ("methanol", "heptane") for o in (16, 21, 30)])[FEATURES]
    res = real_state.predictor.predict_batch(df)
    assert res["flame_temp_k"].isna().all()
    assert ((res.spread_lo <= res.spread_rate_mm_s) & (res.spread_rate_mm_s <= res.spread_hi)).all()
    assert res.extinction_probability.between(0, 1).all() and res.risk_index.between(0, 100).all()


def test_sanity_checks_on_real_data_have_no_failures(real_state):
    results = sanity_check.run_checks(real_state)
    assert not [r for r in results if r[1] == "FAIL"], results
    skipped = {r[0][:2] for r in results if r[1] == "SKIP"}
    assert skipped == {"2.", "4."}                                      # blow-off (one airflow value) and temperature are honestly skipped


def test_gravity_is_ignored_when_data_has_no_gravity_variation(real_state):
    a = real_state.predictor.predict_batch(pd.DataFrame([{"material": "methanol", "o2_percent": 21, "pressure_kpa": 101.3,
                                                          "airflow_cm_s": 0, "gravity_g": g} for g in (0.0, 1.0)])[FEATURES])
    assert a.spread_rate_mm_s.nunique() == 1 and a.extinction_probability.nunique() == 1   # the model cannot know any gravity effect


# ---------------------------------------------------------------- API on real data
@pytest.fixture(scope="module")
def real_client(tmp_path_factory):
    from fastapi.testclient import TestClient

    import main

    mp = pytest.MonkeyPatch()
    prev_state = getattr(main.app.state, "fire", None)
    prev_env = os.environ.get("STUB_MODE")
    mp.setattr(config, "REAL_CSV", CANDIDATE)
    mp.setattr(config, "MODELS_DIR", tmp_path_factory.mktemp("api_models"))
    mp.setattr(config, "DATA_REPORT_JSON", tmp_path_factory.mktemp("rep") / "r.json")
    os.environ["STUB_MODE"] = "0"
    try:
        with TestClient(main.app) as c:
            t0 = time.time()
            while not c.get("/api/health").json()["model_ready"]:
                assert time.time() - t0 < 60
                time.sleep(0.2)
            yield c
    finally:
        mp.undo()
        if prev_env is None:
            os.environ.pop("STUB_MODE", None)
        else:
            os.environ["STUB_MODE"] = prev_env
        main.app.state.fire = prev_state


SC = {"material": "methanol", "o2_percent": 21.0, "pressure_kpa": 101.3, "airflow_cm_s": 0.0, "gravity_g": 0.0}


def test_api_reports_real_data_and_capabilities(real_client):
    h = real_client.get("/api/health").json()
    m = real_client.get("/api/meta").json()
    assert h["data_source"] == "nasa" and m["data_source"] == "nasa" and m["n_runs"] == 190
    assert [x["id"] for x in m["materials"]] == ["heptane", "methanol"] and m["experiments"] == ["FLEX", "Saffire"]
    assert m["model"]["capabilities"] == {"flame_temp": False, "gravity_effect": False} and m["model"]["stub"] is False
    assert m["model"]["metrics"]["temp_r2"] is None and m["model"]["metrics"]["spread_r2"] is not None


def test_api_predict_has_null_temperature_and_valid_shape(real_client):
    import schemas

    p = schemas.Prediction.model_validate(real_client.post("/api/predict", json=SC).json())
    assert p.flame_temp_k is None and p.data_source == "nasa" and p.matching_runs > 0
    assert len(p.shap) == 5 and abs(next(s for s in p.shap if s.feature == "gravity_g").contribution) < 1e-6   # constant feature


def test_api_all_endpoints_validate_with_null_temperature(real_client):
    import schemas

    hm = schemas.Heatmap.model_validate(real_client.post("/api/heatmap", json={"material": "heptane", "pressure_kpa": 90, "gravity_g": 0}).json())
    assert len(hm.risk) == 20
    c = schemas.Compare.model_validate(real_client.post("/api/compare", json={k: v for k, v in SC.items() if k != "gravity_g"}).json())
    assert c.microgravity.flame_temp_k is None and c.earth.flame_temp_k is None
    assert c.microgravity.spread_rate_mm_s == c.earth.spread_rate_mm_s            # no gravity effect learned; meta capability tells the UI
    p = schemas.Passport.model_validate(real_client.post("/api/passport", json={"o2_percent": 21, "pressure_kpa": 101.3, "airflow_cm_s": 0, "gravity_g": 0}).json())
    assert [e.material for e in p.entries] == ["methanol", "heptane"] and all(e.flame_temp_k is None for e in p.entries)


def test_api_compare_uses_labelled_mock_reference_when_real_data_has_no_gravity(real_client):
    """Real data is all 0 g, so for a material the mock data also has (heptane) /api/compare answers from the mock-trained
    reference model and says so (data_source="mock", I-09). Nothing else changes source."""
    import schemas

    hep = {"material": "heptane", "o2_percent": 21.0, "pressure_kpa": 101.3, "airflow_cm_s": 0.0}
    c = schemas.Compare.model_validate(real_client.post("/api/compare", json=hep).json())
    assert c.data_source == "mock"
    assert c.microgravity.flame_temp_k is not None and c.earth.flame_temp_k is not None    # mock reference has temperatures
    assert c.microgravity.flame_temp_k < c.earth.flame_temp_k                                # 0 g cooler (sanity check 4)
    # the simulated reference never leaks into anything else
    assert real_client.post("/api/predict", json={**hep, "gravity_g": 0.0}).json()["data_source"] == "nasa"
    assert real_client.get("/api/meta").json()["model"]["capabilities"]["gravity_effect"] is False
    # a material the mock data doesn't have (methanol) keeps the real, gravity-blind answer
    assert real_client.post("/api/compare", json={**hep, "material": "methanol"}).json()["data_source"] == "nasa"


def test_api_heatmap_matches_predict_on_real_model(real_client):
    hm = real_client.post("/api/heatmap", json={"material": "methanol", "pressure_kpa": 85.0, "gravity_g": 0.0}).json()
    rnd = random.Random(2)
    for _ in range(10):
        ia, io = rnd.randrange(20), rnd.randrange(20)
        p = real_client.post("/api/predict", json={"material": "methanol", "pressure_kpa": 85.0, "gravity_g": 0.0,
                                                   "o2_percent": hm["o2_values"][io], "airflow_cm_s": hm["airflow_values"][ia]}).json()
        assert abs(p["risk_index"] - hm["risk"][ia][io]) <= 0.1                    # I-16


def test_unpredictable_materials_are_422_but_their_runs_stay_visible(real_client):
    r = real_client.post("/api/predict", json={**SC, "material": "PMMA"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_MATERIAL"
    runs = real_client.get("/api/runs", params={"material": "PMMA"}).json()
    assert runs["total"] == 2 and all(x["run_id"].startswith("SAF-") for x in runs["runs"]) and runs["data_source"] == "nasa"
    allr = real_client.get("/api/runs").json()
    assert allr["total"] == 190 and any(x["spread_rate_mm_s"] is None for x in allr["runs"])


def test_insights_cite_real_runs_and_never_claim_mock(real_client):
    j = real_client.post("/api/insights", json={"scenario": SC}).json()
    ids = {x["run_id"] for x in real_client.get("/api/runs").json()["runs"]}
    assert j["generated_by"] == "template" and j["data_source"] == "nasa"
    assert 3 <= len(j["insights"]) <= 5
    for i in j["insights"]:
        assert not i["text"].startswith("[MOCK]")
        assert i["cited_run_ids"] and set(i["cited_run_ids"]) <= set(j["retrieved_run_ids"]) <= ids
    a = real_client.post("/api/ask", json={"question": "Why does oxygen matter?", "scenario": SC}).json()
    assert a["cited_run_ids"] and not a["answer"].startswith("[MOCK]")
