"""Deterministic mock combustion data (docs/03_DATA_CONTRACT.md section 5).

Plausible trends so the UI and model have something to show. NOT science. Every source_note starts with "[MOCK]" (I-09).
Seeded (I-13): two teammates generate byte-identical files. Never writes data/combustion_runs.csv (I-17).

    python mock_data.py [--force-mock] [--out PATH]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

import config

COLUMNS = ["run_id", "experiment", "fuel_type", "material", "gravity_g", "o2_percent", "pressure_kpa",
           "airflow_cm_s", "spread_rate_mm_s", "flame_temp_k", "extinguished", "burn_duration_s", "source_note"]

# (experiment, material, count, gravity: 0.0 | 1.0 | "partial")   -> 260 + 100 + 40 = 400 rows
GROUPS = [
    ("BASS", "PMMA", 50, 0.0),
    ("BASS-II", "PMMA", 30, 0.0), ("BASS-II", "Nomex", 20, 0.0), ("BASS-II", "SIBAL", 20, 0.0),
    ("Saffire", "Nomex", 20, 0.0), ("Saffire", "SIBAL", 16, 0.0),
    ("FLEX", "heptane", 25, 0.0), ("FLEX", "ethanol", 20, 0.0),
    ("FLEX-2", "heptane", 15, 0.0), ("FLEX-2", "ethanol", 14, 0.0),
    ("ACME", "methane", 30, 0.0),
    ("Ground", "PMMA", 30, 1.0), ("Ground", "Nomex", 14, 1.0), ("Ground", "SIBAL", 14, 1.0),
    ("Ground", "heptane", 14, 1.0), ("Ground", "ethanol", 14, 1.0), ("Ground", "methane", 14, 1.0),
    ("BASS-II", "PMMA", 12, "partial"), ("BASS-II", "Nomex", 6, "partial"), ("BASS-II", "SIBAL", 6, "partial"),
    ("FLEX-2", "heptane", 8, "partial"), ("FLEX-2", "ethanol", 8, "partial"),
]
FUEL = {"PMMA": "solid", "Nomex": "solid", "SIBAL": "solid", "heptane": "droplet", "ethanol": "droplet", "methane": "gas"}
BASE_SPREAD = {"PMMA": 0.9, "Nomex": 0.7, "SIBAL": 0.5, "heptane": 1.4, "ethanol": 1.1, "methane": 2.0}  # mm/s at 21% O2, 101.3 kPa, 0 g, peak airflow
TEMP_OFFSET = {"PMMA": 0, "Nomex": -30, "SIBAL": -50, "heptane": 40, "ethanol": -80, "methane": 60}
PREFIX = {"Ground": "GRND", "Saffire": "SAF"}
O2_EXP = 2.6          # spread ~ (o2/21)^2.6                     (M-1)
P_EXP = 1.3           # spread ~ (p/101.3)^1.3                   (M-2)
G_GAIN = 2.2          # 1 g spreads ~3.2x faster than 0 g at equal conditions


def _o2(rng, n):
    low = rng.uniform(15, 25, n)
    high = rng.uniform(25, 40, n)
    return np.where(rng.random(n) < 0.55, low, high)


def _pressure(rng, n):
    pick = rng.random(n)
    p = np.where(pick < 0.50, 101.3, np.where(pick < 0.70, 70.3, np.where(pick < 0.85, 56.5, rng.uniform(50, 101.3, n))))
    return np.clip(p, 50.0, 101.3)


def _airflow(rng, n, g):
    if g < 0.3:  # oversample starved-flow region in microgravity
        return np.where(rng.random(n) < 0.25, rng.uniform(0, 4, n), rng.uniform(4, 50, n))
    return rng.uniform(0, 50, n)


def _airflow_factor(a, g):
    x = a / 15.0
    micro = 0.25 + 0.75 * x * np.exp(1.0 - x)   # peak 1.0 at 15 cm/s, ~0.49 at 50 cm/s (blow-off)  (M-3)
    earth = 1.0 + 0.004 * a                      # buoyancy dominates; flow matters little
    return (1.0 - g) * micro + g * earth


def _ext_prob(o2, a, g):
    starve = np.where(g < 0.3, np.exp(-a / 2.5) * (1.0 - g / 0.3), 0.0)          # (M-4)
    blow = np.where(g < 0.3, np.clip((a - 40.0) / 10.0, 0.0, 1.0) * 1.5, 0.0)
    z = 0.6 * (21.0 - o2) - 2.0 + 3.5 * starve + blow - 1.0 * g                   # high O2 => rare (M-6)
    return 1.0 / (1.0 + np.exp(-z))


def generate_mock(seed: int = config.MOCK_SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows: list[pd.DataFrame] = []
    counters: dict[str, int] = {}
    partial_cycle = 0
    for experiment, material, n, gspec in GROUPS:
        if gspec == "partial":
            g = np.array([0.17 if (partial_cycle + i) % 2 == 0 else 0.38 for i in range(n)])
            partial_cycle += n
        else:
            g = np.full(n, float(gspec))
        o2, p = _o2(rng, n), _pressure(rng, n)
        a = np.concatenate([_airflow(rng, 1, gi) for gi in g])
        spread = (BASE_SPREAD[material] * (o2 / 21.0) ** O2_EXP * (p / 101.3) ** P_EXP
                  * (1.0 + G_GAIN * g ** 0.7) * _airflow_factor(a, g) * rng.lognormal(0.0, 0.12, n))
        ext = rng.random(n) < _ext_prob(o2, a, g)
        spread = np.where(ext, spread * rng.uniform(0.05, 0.30, n), spread)        # spread at time of extinction
        temp = (1350.0 + 575.0 * g ** 0.6 + 8.0 * (o2 - 21.0) + TEMP_OFFSET[material]
                - np.where(ext, 80.0, 0.0) + rng.normal(0.0, 40.0, n))              # (M-5, M-7)
        dur = np.where(ext, rng.uniform(5, 40, n),
                       np.clip(100.0 / np.maximum(spread, 0.2) * rng.uniform(0.8, 1.2, n), 30, 600))
        pre = PREFIX.get(experiment, experiment)
        ids = []
        for _ in range(n):
            counters[pre] = counters.get(pre, 0) + 1
            ids.append(f"{pre}-{counters[pre]:03d}")
        rows.append(pd.DataFrame({
            "run_id": ids, "experiment": experiment, "fuel_type": FUEL[material], "material": material,
            "gravity_g": g, "o2_percent": o2.round(1), "pressure_kpa": p.round(1), "airflow_cm_s": a.round(1),
            "spread_rate_mm_s": spread.round(3), "flame_temp_k": temp.round(0), "extinguished": ext,
            "burn_duration_s": dur.round(1),
            "source_note": [f"[MOCK] Synthetic {material} run ({experiment}, {gi:g} g) for UI/model development only"
                            for gi in g],
        }))
    df = pd.concat(rows, ignore_index=True)[COLUMNS]
    return df


def write_mock(out: Path = config.MOCK_CSV, force: bool = False) -> Path:
    if config.REAL_CSV.exists() and not force:
        raise RuntimeError(f"{config.REAL_CSV} exists: real data present, nothing to mock. Pass --force-mock to override.")
    out = Path(out)
    if out.resolve() == config.REAL_CSV.resolve():
        raise RuntimeError("Refusing to write the real data file (I-17).")
    out.parent.mkdir(parents=True, exist_ok=True)
    generate_mock().to_csv(out, index=False, lineterminator="\n")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force-mock", action="store_true")
    ap.add_argument("--out", type=Path, default=config.MOCK_CSV)
    a = ap.parse_args()
    try:
        path = write_mock(a.out, force=a.force_mock)
    except RuntimeError as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1
    print(f"wrote {path} ({len(pd.read_csv(path))} rows)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
