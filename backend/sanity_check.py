"""Behaviour sanity checks (docs/04_MODEL_SPEC.md section 9). Run before every demo:  python sanity_check.py [--data PATH]

Checks adapt to what the loaded data can support: a check that the data cannot inform is reported as SKIP with the reason
(never silently passed, never failed for lack of data). On MOCK data every check applies and should pass. On REAL data a FAIL is
information, not necessarily a bug: it changes what the demo can claim. Default exit code is 0; --strict exits 1 on any FAIL.
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

import config
import model
import services
from data_loader import load_csv, load_dataset
from predictor import FEATURES
from services import AppState

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"


def _row(pred, base: dict, **over) -> pd.Series:
    return pred.predict_batch(pd.DataFrame([{**base, **over}])[FEATURES]).iloc[0]


def run_checks(st: AppState) -> list[tuple[str, str, str]]:
    pred, df, out = st.predictor, st.dataset.df, []
    sub = df[df["material"].isin(st.material_ids)]
    mat = "PMMA" if "PMMA" in st.material_ids else st.material_ids[0]
    ref = sub[sub["material"] == mat]
    base = {"material": mat, "o2_percent": float(ref["o2_percent"].median()), "pressure_kpa": float(ref["pressure_kpa"].median()),
            "airflow_cm_s": float(ref["airflow_cm_s"].median()), "gravity_g": float(ref["gravity_g"].median())}
    lo_o2, hi_o2 = float(ref["o2_percent"].quantile(0.1)), float(ref["o2_percent"].quantile(0.9))
    out.append(("0. checking material", PASS, f"{mat} at median conditions {base}"))

    # 1. risk rises with oxygen (within the range the data covers)
    r_lo, r_hi = _row(pred, base, o2_percent=lo_o2)["risk_index"], _row(pred, base, o2_percent=hi_o2)["risk_index"]
    out.append((f"1. risk rises with O2 ({lo_o2:.0f}% -> {hi_o2:.0f}%)", PASS if r_hi > r_lo else FAIL, f"{r_lo} -> {r_hi}"))

    # 2. 0 g spread vs airflow rises then falls (blow-off) - needs airflow variation in the data
    if ref["airflow_cm_s"].nunique() < 5:
        out.append(("2. 0 g spread rises then falls with airflow", SKIP, f"data has {ref['airflow_cm_s'].nunique()} distinct airflow value(s) for {mat}"))
    else:
        af = np.arange(0, 51, 2.5)
        sp = pred.predict_batch(pd.DataFrame([{**base, "gravity_g": 0.0, "airflow_cm_s": a} for a in af])[FEATURES])["spread_rate_mm_s"].to_numpy()
        peak = float(af[int(sp.argmax())])
        out.append(("2. 0 g spread rises then falls with airflow (peak 5-25 cm/s, lower at 50)",
                    PASS if (5 <= peak <= 25 and sp[-1] < sp.max()) else FAIL,
                    f"peak at {peak} cm/s, spread {sp.max():.2f} -> {sp[-1]:.2f} mm/s at 50"))

    # 3. extinction likelier at low oxygen than at high oxygen
    e_lo, e_hi = _row(pred, base, o2_percent=lo_o2)["extinction_probability"], _row(pred, base, o2_percent=hi_o2)["extinction_probability"]
    out.append((f"3. extinction likelier at low O2 ({lo_o2:.0f}%) than high O2 ({hi_o2:.0f}%)", PASS if e_lo > e_hi else FAIL, f"{e_lo} vs {e_hi}"))

    # 4. 0 g flame cooler than 1 g - needs temperature data AND a gravity effect
    caps = pred.capabilities
    if not caps["flame_temp"] or not caps["gravity_effect"]:
        why = "no flame-temperature data" if not caps["flame_temp"] else "no 0 g + 1 g data"
        out.append(("4. 0 g flame cooler than 1 g", SKIP, why))
    else:
        t0, t1 = _row(pred, base, gravity_g=0.0)["flame_temp_k"], _row(pred, base, gravity_g=1.0)["flame_temp_k"]
        out.append(("4. 0 g flame cooler than 1 g", PASS if t0 < t1 else FAIL, f"{t0:.0f} K vs {t1:.0f} K"))

    # 5. heatmap: calm corner safer than a hot cell
    hm = services.heatmap(st, mat, base["pressure_kpa"], base["gravity_g"])
    corner, hot = hm["risk"][0][0], max(max(r) for r in hm["risk"])
    out.append(("5. heatmap: low-O2/low-airflow corner is not the riskiest cell", PASS if corner < hot else FAIL, f"corner {corner} vs max {hot}"))

    # 6. probabilities and CI are well-formed over a coarse grid (always applies)
    grid = pd.DataFrame([{**base, "o2_percent": o, "airflow_cm_s": a} for o in np.linspace(15, 40, 6) for a in (0, 10, 25, 50)])[FEATURES]
    res = pred.predict_batch(grid)
    ok = bool(((res["extinction_probability"].between(0, 1)) & (res["spread_lo"] <= res["spread_rate_mm_s"])
               & (res["spread_rate_mm_s"] <= res["spread_hi"]) & res["risk_index"].between(0, 100)).all())
    out.append(("6. probabilities in [0,1], CI ordered, risk in [0,100]", PASS if ok else FAIL, f"{len(res)} grid points"))
    return out


def build_state(data: Optional[Path]) -> AppState:
    ds = load_csv(data, "nasa", report_path=None) if data else load_dataset()
    materials = services.build_materials(ds.df)
    ids = [m["id"] for m in materials]
    return AppState(dataset=ds, predictor=model.load_or_train(ds, ids), materials=materials,
                    reference=services.reference_scenario(ds.df, materials))


def main() -> int:
    logging.basicConfig(level=logging.WARNING)
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--data", type=Path, help="CSV to check instead of the active dataset (treated as real data)")
    a = ap.parse_args()
    st = build_state(a.data)
    results = run_checks(st)
    for name, status, detail in results:
        print(f"{status}  {name}  [{detail}]")
    n = {s: sum(1 for r in results if r[1] == s) for s in (PASS, FAIL, SKIP)}
    print(f"\n{n[PASS]} passed, {n[FAIL]} failed, {n[SKIP]} skipped on {st.dataset.source.upper()} data ({st.dataset.n_runs} runs, "
          f"{len(st.material_ids)} predictable materials: {st.material_ids})")
    if n[FAIL] and st.dataset.source == "nasa":
        print("Failures on real data are information, not necessarily bugs: tell the team, it changes what the demo can claim.")
    return 1 if (n[FAIL] and a.strict) else 0


if __name__ == "__main__":
    sys.exit(main())
