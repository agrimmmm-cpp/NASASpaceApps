"""Automated part of the smoke test (docs/08_TASKS.md): health, meta, predict against the real app, in-process.

Steps 4-5 (open the UI, change material/preset/gravity) are manual. Exit code 1 on any failure.
"""
from __future__ import annotations

import sys

from fastapi.testclient import TestClient

import main
from schemas import Health, Meta, Prediction

SCENARIO = {"material": "PMMA", "o2_percent": 21.0, "pressure_kpa": 101.3, "airflow_cm_s": 10.0, "gravity_g": 0.0}


def main_() -> int:
    failures: list[str] = []
    with TestClient(main.app) as c:
        h = Health.model_validate(c.get("/api/health").json())
        if not h.model_ready:
            failures.append("health.model_ready is false")
        m = Meta.model_validate(c.get("/api/meta").json())
        if not m.materials:
            failures.append("meta.materials is empty")
        if "PMMA" not in [x.id for x in m.materials]:
            failures.append("PMMA missing from meta.materials (smoke scenario needs it)")
        r = c.post("/api/predict", json=SCENARIO)
        if r.status_code != 200:
            failures.append(f"predict returned {r.status_code}: {r.text[:200]}")
        else:
            Prediction.model_validate(r.json())
        print(f"data_source={h.data_source} runs={m.n_runs} stub={m.model.stub}")
    if failures:
        print("SMOKE FAILED:\n  - " + "\n  - ".join(failures))
        return 1
    print("SMOKE OK (automated steps 1-3). Manual: open :5173, confirm no console errors / error chips.")
    return 0


if __name__ == "__main__":
    sys.exit(main_())
