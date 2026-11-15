"""Map NASA PSI experimental tables to data/schema.json (docs/03_DATA_CONTRACT.md section 4).

    python -I data/mapping/psi_to_schema.py          # reads data/raw/*, writes data/candidate/*

Sources (both CC0-1.0, see data/SOURCES.md and data/raw/MANIFEST.json):
  * PSI-69  FLEX       droplet combustion on the ISS, 274 tests          -> methanol / heptane rows
  * PSI-99  Saffire-II large-scale solid-fuel fires in Cygnus, 9 samples -> silicone / SIBAL / PMMA rows

Principles
  * Nothing is invented. A quantity that was not measured stays EMPTY. Every assumption is written into the row's source_note
    and listed in ASSUMPTIONS below (copied into mapping_report.json).
  * Rows outside the dashboard's input ranges are REJECTED and counted (never clamped), with ONE documented exception:
    measured pressures of 101.3-102.0 kPa (within ~0.7% of 1 atm) are recorded as 101.3 and the measured value is kept in source_note.
  * This script is self-contained (pandas + stdlib only) so it can run with `python -I`; the raw files are untrusted data.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path(__file__).resolve().parents[1]
RAW = DATA / "raw"
OUT = DATA / "candidate"

# hard dashboard ranges (data/schema.json); kept in sync by the schema-header check at the bottom
O2_RANGE = (15.0, 40.0)
P_RANGE = (50.0, 101.3)
P_NOMINAL_TOLERANCE_MAX = 102.0   # 101.3 < p <= 102.0 kPa => recorded as 101.3 (documented exception)
MMHG_TO_KPA = 0.133322368

ASSUMPTIONS = [
    "gravity_g = 0.0 for every row: all flight data is ISS/Cygnus microgravity (residual acceleration not recorded in the tables).",
    "FLEX airflow_cm_s = 0.0: FLEX droplets are free-floating in a still chamber; the table does not record the small drift or "
    "translation flows used in some tests, so those tests are not distinguished.",
    "FLEX spread_rate_mm_s holds the droplet BURNING-RATE CONSTANT in mm^2/s (unit confirmed in NASA NTRS 20120016855), which is a "
    "different physical quantity from the flame-spread rate in mm/s used for solids. fuel_type separates them (R-05).",
    "FLEX extinguished: 'Extinction' -> true (flame went out before the droplet burned away), 'Completion' -> false "
    "(burned to completion), 'Disruption' -> empty (test ended by droplet disruption; outcome unknown).",
    "FLEX o2_percent = oxygen mole fraction x 100; diluents (N2/CO2/He) are not model features and are listed in source_note.",
    "FLEX pressure converted from mmHg (x0.133322368).",
    "Saffire-II pressure_kpa = 100.6 for all rows: not in the PSI table; cabin atmosphere at hatch closure was 22.1% O2, 100.6 kPa "
    "(Olson et al. 2019, Fire Technology, doi:10.1007/s10694-019-00863-3).",
    "Saffire-II o2_percent from the table's derived value ('~ 21.5' -> 21.5; '22.1 to 22.0' -> mean 22.05).",
    "Saffire-II extinguished: burn time 'Insignificant' (flame did not sustain, ~0 cm burned) -> true; a measured burn time -> false.",
    "Saffire-II spread_rate_mm_s only where the table gives a microgravity spread rate in mm/s; PMMA samples 2-8/2-9 report only a very "
    "slow regression rate (Note 4), left empty. Sample 2-7 (PMMA and Nomex on one card) is rejected: results cannot be attributed to one material.",
    "Saffire-II samples without a material name in the table (2-6, 2-9) inherit the previous row's material (merged cell).",
    "No flame temperature was measured in either source: flame_temp_k is empty for every row.",
    "1 g columns in the Saffire-II table are NOT used: their test conditions are not stated, and mixing them would invent a gravity effect.",
]

COLUMNS = ["run_id", "experiment", "fuel_type", "material", "gravity_g", "o2_percent", "pressure_kpa", "airflow_cm_s",
           "spread_rate_mm_s", "flame_temp_k", "extinguished", "burn_duration_s", "source_note"]


def _read_raw(path: Path) -> pd.DataFrame:
    """PSI tables are Windows-1252 (e.g. en dashes); try UTF-8 first. Everything is read as text, nothing is evaluated."""
    try:
        return pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8")
    except UnicodeDecodeError:
        return pd.read_csv(path, dtype=str, keep_default_na=False, encoding="cp1252")


def _num(x) -> float:
    try:
        return float(str(x).strip())
    except ValueError:
        return float("nan")


def _tolerate_pressure(p_kpa: float):
    """Return (recorded_kpa, note) or (None, reject_reason)."""
    if not np.isfinite(p_kpa) or p_kpa <= 0:
        return None, "bad_pressure"
    if p_kpa < P_RANGE[0]:
        return None, "pressure_below_50kPa"
    if p_kpa <= P_RANGE[1]:
        return round(p_kpa, 2), ""
    if p_kpa <= P_NOMINAL_TOLERANCE_MAX:
        return P_RANGE[1], f"measured {p_kpa:.2f} kPa recorded as {P_RANGE[1]} (within 0.7% of 1 atm)"
    return None, "pressure_above_101.3kPa_range"


# ---------------------------------------------------------------------------------------------------- FLEX (PSI-69)
def map_flex(path: Path) -> tuple[pd.DataFrame, Counter, int]:
    raw = _read_raw(path)
    raw.columns = [c.strip() for c in raw.columns]
    col = {k: next(c for c in raw.columns if c.lower().startswith(k)) for k in
           ("flex test", "flex i", "fuel", "ambient pressure", "o initial", "n initial", "co initial", "he initial",
            "droplet initial", "visible", "burning rate", "burn time", "test end")}
    fuels = {"Methanol": "methanol", "Heptane": "heptane"}
    rows, rejects = [], Counter()
    for _, r in raw.iterrows():
        test, ident = r[col["flex test"]].strip(), r[col["flex i"]].strip()
        fuel = fuels.get(r[col["fuel"]].strip())
        if fuel is None:
            rejects["unknown_fuel"] += 1
            continue
        p_kpa, pnote = _tolerate_pressure(_num(r[col["ambient pressure"]]) * MMHG_TO_KPA)
        if p_kpa is None:
            rejects[pnote] += 1
            continue
        o2 = _num(r[col["o initial"]]) * 100.0
        if not (O2_RANGE[0] <= o2 <= O2_RANGE[1]):
            rejects["o2_outside_15_40pct"] += 1
            continue
        k = _num(r[col["burning rate"]])
        end = r[col["test end"]].strip()
        ext = {"Extinction": True, "Completion": False}.get(end)
        dur = _num(r[col["burn time"]])
        diluent = ", ".join(f"{n} {float(_num(r[col[c]])):.2f}" for n, c in
                            (("N2", "n initial"), ("CO2", "co initial"), ("He", "he initial")) if _num(r[col[c]]) > 0)
        note = (f"PSI-69 FLEX test {test} ({ident}), doi:10.60555/mbq8-0451, CC0-1.0. Droplet d0 {r[col['droplet initial']].strip()} mm; "
                f"test end: {end}; diluent mole fractions: {diluent or 'none'}. spread_rate = droplet burning-rate constant (mm^2/s), "
                f"not flame spread. airflow assumed 0 (free droplet, still chamber). gravity 0 (ISS)."
                + (f" Pressure: {pnote}." if pnote else ""))
        rows.append({
            "run_id": f"FLEX-{int(test):03d}", "experiment": "FLEX", "fuel_type": "droplet", "material": fuel,
            "gravity_g": 0.0, "o2_percent": round(o2, 2), "pressure_kpa": p_kpa, "airflow_cm_s": 0.0,
            "spread_rate_mm_s": None if np.isnan(k) else round(k, 3), "flame_temp_k": None, "extinguished": ext,
            "burn_duration_s": None if np.isnan(dur) else round(dur, 1), "source_note": note})
    return pd.DataFrame(rows, columns=COLUMNS), rejects, len(raw)


# ---------------------------------------------------------------------------------------------------- Saffire-II (PSI-99)
SAFFIRE_PRESSURE_KPA = 100.6


def map_saffire2(path: Path) -> tuple[pd.DataFrame, Counter, int]:
    raw = _read_raw(path)
    raw.columns = [c.strip() for c in raw.columns]
    raw = raw[raw["Sample Number"].str.fullmatch(r"\d+-\d+")].reset_index(drop=True)   # drop F1C1 / Note lines
    mats = {"silicone": "silicone", "cotton-fiberglass (sibal)": "SIBAL", "pmma": "PMMA"}
    rows, rejects, prev = [], Counter(), ""
    for _, r in raw.iterrows():
        sample, name = r["Sample Number"].strip(), r["Material"].strip()
        inherited = not name
        name = name or prev
        prev = name
        if "&" in name or " and " in name.lower():
            rejects["mixed_material_sample"] += 1
            continue
        material = mats.get(name.lower())
        if material is None:
            rejects["unknown_material"] += 1
            continue
        flow = _num(re.sub(r"[^\d.]", "", r["Air Flow (cm/s)"]))
        o2_txt = r["Percent O2 (Note 1)"].replace("~", "").strip()
        o2_vals = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", o2_txt)]
        o2 = float(np.mean(o2_vals)) if o2_vals else float("nan")
        if not (O2_RANGE[0] <= o2 <= O2_RANGE[1]) or np.isnan(flow):
            rejects["missing_or_out_of_range_conditions"] += 1
            continue
        burn = r["Burn Time (s)"].strip()
        dur = _num(re.sub(r"[^\d.]", "", burn)) if re.search(r"\d", burn) else float("nan")
        ext = True if burn.lower().startswith("insignificant") else (False if not np.isnan(dur) else None)
        m = re.fullmatch(r"\s*([\d.]+)\s*mm/s\s*", r["?-g Spread Length"])
        spread = float(m.group(1)) if m else None
        note = (f"PSI-99 Saffire-II sample {sample} ({name}), doi:10.60555/2chp-m469, CC0-1.0. "
                f"{r['Flow Direction'].strip()} flow {flow:g} cm/s, thickness {r['Samle Thickness'].strip()}; "
                f"microgravity burn length {r['?-g Burn Length'].strip()}, burn time {burn}. "
                f"pressure {SAFFIRE_PRESSURE_KPA} kPa from Olson et al. 2019 (cabin at hatch closure), not in the PSI table."
                + (" Material inherited from the previous row (merged cell)." if inherited else ""))
        rows.append({
            "run_id": f"SAF-{sample}", "experiment": "Saffire", "fuel_type": "solid", "material": material,
            "gravity_g": 0.0, "o2_percent": round(o2, 2), "pressure_kpa": SAFFIRE_PRESSURE_KPA, "airflow_cm_s": flow,
            "spread_rate_mm_s": spread, "flame_temp_k": None, "extinguished": ext,
            "burn_duration_s": None if np.isnan(dur) else dur, "source_note": note})
    return pd.DataFrame(rows, columns=COLUMNS), rejects, len(raw)


# ---------------------------------------------------------------------------------------------------- build
def main() -> int:
    manifest = {m["accession"]: m for m in json.loads((RAW / "MANIFEST.json").read_text())}
    parts, report = [], {"sources": {}, "assumptions": ASSUMPTIONS}
    for acc, fn in (("PSI-69", map_flex), ("PSI-99", map_saffire2)):
        m = manifest[acc]
        df, rej, n_read = fn(DATA / m["path"])
        parts.append(df)
        report["sources"][acc] = {"experiment": m["experiment"], "doi": m["doi"], "license": m["license"],
                                  "sha256": m["sha256"], "retrieved_at": m["retrieved_at"], "rows_read": n_read,
                                  "rows_mapped": len(df), "rejected": dict(rej)}
    out = pd.concat(parts, ignore_index=True).sort_values("run_id", kind="stable").reset_index(drop=True)
    assert out["run_id"].is_unique, "run_id collision across sources"

    schema_cols = [c["name"] for c in json.loads((DATA / "schema.json").read_text())["columns"]]
    assert schema_cols == COLUMNS, f"mapping columns out of sync with schema.json: {schema_cols}"

    OUT.mkdir(parents=True, exist_ok=True)
    out.astype(object).where(out.notna(), None).to_csv(OUT / "combustion_runs.csv", index=False, lineterminator="\n")
    report["rows_total"] = len(out)
    report["by_material"] = out["material"].value_counts().to_dict()
    report["non_null"] = {c: int(out[c].notna().sum()) for c in COLUMNS}
    (OUT / "mapping_report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"wrote {OUT / 'combustion_runs.csv'}: {len(out)} rows  by material {report['by_material']}")
    for acc, s in report["sources"].items():
        print(f"  {acc} {s['experiment']}: read {s['rows_read']}, mapped {s['rows_mapped']}, rejected {s['rejected']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
