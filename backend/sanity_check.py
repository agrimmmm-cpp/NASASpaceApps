"""Behaviour sanity checks (docs/04_MODEL_SPEC.md section 9). Run before every demo:  python sanity_check.py

On MOCK data all checks should pass. On REAL data a failing check is information, not necessarily a bug: it changes what the
demo can claim. By default this prints PASS/FAIL and exits 0; pass --strict to exit 1 on any failure.
"""
from __future__ import annotations

import argparse
import logging
import sys

import numpy as np
import pandas as pd

import model
import services
from data_loader import load_dataset
from predictor import FEATURES
from services import AppState

BASE = {"material": "PMMA", "o2_percent": 21.0, "pressure_kpa": 101.3, "airflow_cm_s": 10.0, "gravity_g": 0.0}


def _p(pred, **over) -> pd.Series:
    return pred.predict_batch(pd.DataFrame([{**BASE, **over}])[FEATURES]).iloc[0]


def run_checks(st: AppState) -> list[tuple[str, bool, str]]:
    pred, out = st.predictor, []
    if "PMMA" not in st.material_ids:
        return [("PMMA present in data", False, "checks use PMMA; not in the loaded materials")]

    r21, r35 = _p(pred, o2_percent=21)["risk_index"], _p(pred, o2_percent=35)["risk_index"]
    out.append(("1. risk rises with O2 (21% -> 35%)", r35 > r21, f"{r21} -> {r35}"))

    af = np.arange(0, 51, 2.5)
    sp = pred.predict_batch(pd.DataFrame([{**BASE, "airflow_cm_s": a} for a in af])[FEATURES])["spread_rate_mm_s"].to_numpy()
    peak = float(af[int(sp.argmax())])
    out.append(("2. 0 g spread vs airflow rises then falls (peak 5-25 cm/s, lower at 50)",
                5 <= peak <= 25 and sp[-1] < sp.max(), f"peak at {peak} cm/s, spread {sp.max():.2f} -> {sp[-1]:.2f} mm/s at 50"))

    e_starved = _p(pred, o2_percent=16, airflow_cm_s=1)["extinction_probability"]
    e_fed = _p(pred, o2_percent=30, airflow_cm_s=10)["extinction_probability"]
    out.append(("3. extinction likelier when starved (16% O2, 1 cm/s) than fed (30%, 10 cm/s)", e_starved > e_fed,
                f"{e_starved} vs {e_fed}"))

    t0, t1 = _p(pred, gravity_g=0.0)["flame_temp_k"], _p(pred, gravity_g=1.0)["flame_temp_k"]
    out.append(("4. 0 g flame cooler than 1 g", t0 < t1, f"{t0:.0f} K vs {t1:.0f} K"))

    hm = services.heatmap(st, "PMMA", 101.3, 0.0)
    mid = int(np.argmin(np.abs(np.array(hm["airflow_values"]) - 15)))
    corner, hot = hm["risk"][0][0], hm["risk"][mid][-1]
    out.append(("5. heatmap: low-O2/low-airflow corner safer than high-O2/mid-airflow cell", corner < hot, f"{corner} vs {hot}"))
    return out


def main() -> int:
    logging.basicConfig(level=logging.WARNING)
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args()
    ds = load_dataset()
    materials = services.build_materials(ds.df)
    ids = [m["id"] for m in materials]
    st = AppState(dataset=ds, predictor=model.load_or_train(ds, ids), materials=materials,
                  reference=services.reference_scenario(ds.df, materials))
    results = run_checks(st)
    for name, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name}  [{detail}]")
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed on {ds.source.upper()} data ({ds.n_runs} runs)")
    if failed and ds.source == "nasa":
        print("Failures on real data are information, not necessarily bugs: tell the team, it changes what the demo can claim.")
    return 1 if (failed and a.strict) else 0


if __name__ == "__main__":
    sys.exit(main())
