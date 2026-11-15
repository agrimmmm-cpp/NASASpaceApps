# 03 — Data Contract

Owner: Track A. Real-data acquisition (Track C) feeds into this. Invariants: I-03, I-09, I-13, I-17.

## 1. The CSV schema (`data/combustion_runs.csv`)

Column order and names are fixed. Header row required. UTF-8, `,` delimiter, `.` decimal, empty cell = null.

| column | type | allowed | null allowed? | notes |
|---|---|---|---|---|
| `run_id` | string | unique, non-empty | no | e.g. `BASS-II-042` |
| `experiment` | string | `BASS`, `BASS-II`, `FLEX`, `FLEX-2`, `Saffire`, `ACME`, `Ground` | no | other values accepted but logged as warning |
| `fuel_type` | string | `solid`, `droplet`, `gas` | no | |
| `material` | string | canonical id (§3) | no | unknown ids are accepted into the explorer but excluded from training and logged |
| `gravity_g` | float | 0.0–1.0 | no | |
| `o2_percent` | float | 15–40 | no | volume %; rows outside are rejected (§4) |
| `pressure_kpa` | float | 50–101.3 | no | |
| `airflow_cm_s` | float | 0–50 | no | |
| `spread_rate_mm_s` | float | ≥ 0 | yes (real data) | regression target |
| `flame_temp_k` | float | 300–3000 | yes | temperature target |
| `extinguished` | bool | `true/false/1/0/True/False` | yes | classification target |
| `burn_duration_s` | float | ≥ 0 | yes | displayed only, not modelled |
| `source_note` | string | non-empty | no | citation / description; for mock rows starts with `[MOCK]` |

`data/schema.json` encodes this table (names, types, min/max, nullability, required-for-model flags). Loader, validator,
Pydantic `Run` model and the explorer table columns are generated from it. **Adding a column = add to schema.json, nothing else breaks.**

## 2. Loader behaviour (`backend/data_loader.py`)

```
1. If data/combustion_runs.csv exists:
     validate against schema.json
       - fatal (startup error with readable message, exit non-zero): missing required column, wrong type in >5% of a column,
         duplicate run_id, zero valid rows.
       - row-level: drop rows violating a hard range (o2/pressure/airflow/gravity out of range, negative spread),
         count them, log first 10 reasons; surfaced in /api/meta? no — in logs and in `backend/data_report.json`.
     data_source = "nasa"
2. Else:
     generate data/mock_combustion_runs.csv (seeded, §5) if absent, load it
     data_source = "mock"
3. Never fall back to mock when a real file exists but is invalid (I-17). Fail loudly instead.
```

- Rows with null `spread_rate_mm_s` are kept for the Explorer but excluded from the spread regressor; null `flame_temp_k`
  likewise for the temperature model; null `extinguished` likewise for the classifier. Counts go in `data_report.json`.
- The model needs **≥ 30 usable rows per target**, else training raises `DATA_ERROR` and `/api/health.model_ready` stays false
  with a clear log line (don't ship a model trained on 12 rows without saying so).
- Data hash = SHA-256 of the CSV bytes; used in `model.version` and as the joblib cache key (cache invalidates when data changes).
- `data_report.json` (written on every load): rows read / kept / dropped-by-reason, per-column null counts, materials and
  experiments found, gravity histogram. Track C reads this when mapping real data.

## 3. Canonical vocabularies

Materials (ids; labels for UI):

| id | label | fuel_type | typical experiments |
|---|---|---|---|
| `PMMA` | PMMA (acrylic) | solid | BASS, BASS-II, Ground |
| `Nomex` | Nomex fabric | solid | Saffire, BASS-II |
| `SIBAL` | Cotton-fiberglass (SIBAL) | solid | Saffire, BASS-II |
| `heptane` | n-Heptane | droplet | FLEX, FLEX-2 |
| `ethanol` | Ethanol | droplet | FLEX |
| `methane` | Methane (gas jet) | gas | ACME |

Adding a material: add it to the vocabulary file (`data/vocab.json`), nothing else. The one-hot encoder is built from
the materials **present in the training data**; `/api/meta.materials` lists only those. A material absent from training can't be predicted (422 `UNKNOWN_MATERIAL`).

> **Semantic caveat (must appear in About the Data):** `spread_rate_mm_s` means flame-spread rate for solids, but for droplets
> it's a regression/burning-rate proxy and for gas jets a flame-propagation proxy. The model uses `fuel_type`/material to
> separate them; cross-fuel comparisons of raw spread rate are not apples-to-apples. See R-05.

## 4. Real data (Track C): NASA Physical Sciences Informatics (PSI)

PSI (search "NASA Physical Sciences Informatics"; Track C records the exact URLs in `data/SOURCES.md`, verify them rather than trusting this doc)
publishes combustion experiment datasets in varied formats, with per-experiment columns that will not match ours.
Procedure:

1. **Time-box: decide by hour 6 of the hackathon** whether a usable real dataset exists. If not, we ship mock + a clearly labelled
   "ready for real data" story. Don't burn the weekend on scraping.
2. Pull 1–3 experiments (prefer ones with tabular results: flame spread vs. O₂/pressure/flow, e.g. BASS / BASS-II / SOFIE / FLEX).
   Record URL, DOI/accession, license/terms, and date retrieved in `data/SOURCES.md`.
3. Write `data/mapping/<experiment>.py` (or `.yaml`) that converts that dataset to our schema, with a unit-conversion
   comment per column (e.g. "source gives flow in m/s → ×100 → cm/s"). One mapping file per source; the merge step concatenates into `combustion_runs.csv`.
4. Every row's `source_note` includes dataset id/DOI and original run/test identifier so a human can trace it.
5. If a quantity wasn't measured, leave it empty. **Never fill gaps with invented values.** Never mix mock rows into the real file.
6. Run `python backend/data_loader.py --validate data/combustion_runs.csv` and read `data_report.json` before committing.
7. Raw downloads live in `data/raw/` (gitignored if large; otherwise committed with SOURCES.md).

If real coverage is thin for some materials/gravities, that's fine: the CI-widening and "matching runs" count make the sparsity visible. Say so in the About modal.

## 5. Mock generator (`backend/mock_data.py`)

Deterministic (`numpy.random.default_rng(20241014)`, I-13). ~400 rows. Mock exists to exercise the UI and model; it must be
plausible but is **not** science.

Required trends (each has a unit test that checks the sign/shape on the generated file):

| # | Trend | Test |
|---|---|---|
| M-1 | Spread rate increases with O₂ % (solids), monotone in the mean over O₂ bins | Spearman ρ(o2, spread) > 0.5 for PMMA at g=0 |
| M-2 | Spread rate increases with pressure | ρ(pressure, spread) > 0.2 |
| M-3 | In 0g, spread rises with airflow to a peak at ~10–20 cm/s then falls (blow-off) | peak bin of mean spread in [10, 20]; mean at 45–50 cm/s < peak by ≥ 30% |
| M-4 | At 0g with airflow < 3 cm/s, extinction probability high, higher still at O₂ 15–18% | extinguished rate in that cell ≥ 0.6, and > rate at O₂ ≥ 25 |
| M-5 | 0g flames cooler: ~1200–1500 K vs 1g ~1800–2000 K | mean(T@0g) < mean(T@1g) − 250 K |
| M-6 | At O₂ ≥ 30%, extinction is rare at any gravity | rate ≤ 0.1 |
| M-7 | Noise: multiplicative lognormal σ≈0.12 on spread, Gaussian σ≈40 K on temp | — |

Composition: ~65% at g=0.0; ~25% at g=1.0 (experiment `Ground`); ~10% at partial g (0.17, 0.38). Experiments/materials pair realistically:
BASS/BASS-II/Saffire → solids, FLEX/FLEX-2 → droplets, ACME → gas, Ground → any. `run_id = <experiment>-<3-digit counter>` unique.
Extinguished rows record `spread_rate_mm_s` at the point of extinction (small, ≥ 0, never null). Every `source_note` begins `[MOCK]`.
The generator refuses to run if `data/combustion_runs.csv` exists (nothing to mock) unless `--force-mock` is passed, and **never** writes to `combustion_runs.csv`.

## 6. Git hygiene for data

- `data/mock_combustion_runs.csv` — committed (so both people see the same file even if generator changes).
- `data/combustion_runs.csv` — committed once real, with `SOURCES.md`; until then absent (don't commit an empty placeholder: it would flip the app into "real" mode and fail validation).
- `data/raw/`, `backend/models/*.joblib`, `backend/data_report.json` — gitignored.

## Changelog
- 2026-11-14 initial.
