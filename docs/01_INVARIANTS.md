# 01 — Invariants (do not change)

These are decisions that, if changed unilaterally, silently break the other person's work or make the project
dishonest. Each has an ID; reference IDs in PRs and code comments (`// I-07`). To change one, follow
"Changing a contract" in `00_START_HERE.md` **and** get a yes from both people.

## Naming, units, shapes

- **I-01 — JSON is `snake_case` everywhere.** Request and response keys, TypeScript types included. No camelCase conversion layer.
- **I-02 — Units are fixed and never converted at the edges.**

  | Quantity | Unit | Notes |
  |---|---|---|
  | `gravity_g` | fraction of Earth g, 0.0–1.0 | Moon = 0.17, Mars = 0.38. Never m/s². |
  | `o2_percent` | volume %, 15–40 | `21`, not `0.21`. |
  | `pressure_kpa` | kPa, 50–101.3 | Not atm, not psi. |
  | `airflow_cm_s` | cm/s, 0–50 | |
  | `spread_rate_mm_s` | mm/s | Note: mm, while airflow is cm. Label axes explicitly. |
  | `flame_temp_k` | Kelvin | |
  | `*_s` | seconds | |
  | `*_probability` | 0–1 float | UI formats as %. |
  | `risk_index` | 0–100 number, 1 decimal | UI shows integer. |

- **I-03 — The CSV columns, their names and types are fixed** (`03_DATA_CONTRACT.md`). All code is schema-driven from
  `data/schema.json`; no hard-coded column lists scattered around.
- **I-04 — Material identifiers are canonical ids** (`PMMA`, `Nomex`, `SIBAL`, `heptane`, `ethanol`, `methane`).
  API and store use the `id`; display labels come from `/api/meta`. Frontend never hard-codes a material list.
- **I-05 — `extinction_probability` = P(flame self-extinguishes).** The KPI "Flame Survives?" shows
  `1 − extinction_probability`. Only the UI does this conversion, in exactly one helper (`survivalProbability()`).
  Backend never returns a "survival" field.
- **I-06 — The risk formula and every constant live in one place** (`backend/config.py`) and are published via
  `/api/meta.model`. Frontend **never recomputes** risk, spread, grades or bands; it displays what the API returns.
- **I-07 — Heatmap orientation is `risk[airflow_index][o2_index]`** (rows = airflow ascending, columns = O₂ ascending),
  axes arrays returned alongside. Exactly 20×20. Never transposed on either side.
- **I-08 — Risk bands and grade bands come from `/api/meta`**, not from frontend constants. Colors map by band name.
- **I-09 — Data-source honesty.** The badge reflects `/api/meta.data_source` (`"mock"` | `"nasa"`), which is set solely
  by which file the loader read. Mock rows' `source_note` must start with `[MOCK]`. AI text generated from mock data must
  never describe the runs as real NASA results; the UI shows the MOCK badge on every insight card in mock mode.

## Behaviour

- **I-10 — The app never shows a blank screen or an unhandled crash.** Each panel has its own loading skeleton, error state
  and empty state, and sits inside its own error boundary (I-22). Backend returns the documented error envelope, never a
  stack trace.
- **I-11 — Insights are grounded.** Every insight has ≥ 1 `cited_run_ids`, and every cited id must be in the retrieved set sent to
  the model. Backend validates after the LLM responds; any insight failing validation is dropped. If none survive → template
  fallback. The prompt instructs "only claim what the runs support".
- **I-12 — Secrets stay on the backend.** `LLM_API_KEY` only in `.env` (gitignored), read by FastAPI only. Never in frontend
  code, bundles, logs, error messages, or fixtures. `.env.example` has placeholders only.
- **I-13 — Determinism.** `random_state=42` for every model; mock generator uses a fixed seed (`20241014`) so two teammates
  generate identical mock data. Same inputs → same outputs (except LLM text).
- **I-14 — Out-of-range or unknown input → HTTP 422** with the error envelope. Never silently clamp. (Frontend sliders
  already constrain values; the API is the second line of defence.)
- **I-15 — Confidence interval ordering:** `low ≤ spread_rate_mm_s ≤ high` and `low ≥ 0`, enforced by explicit clamping after
  the quantile models (quantile GBMs can cross).
- **I-16 — One prediction code path.** `/api/predict`, `/api/heatmap`, `/api/compare`, `/api/passport` all call the same
  `predict_batch()`. Test: for any heatmap cell, `/api/predict` with that cell's inputs returns the same `risk_index` (±0.1).
- **I-17 — Never overwrite or edit `data/combustion_runs.csv` from code.** Mock output goes to
  `data/mock_combustion_runs.csv` only. A real file that fails validation is a **startup error with a readable message**,
  not a silent fall-back to mock.
- **I-18 — Fixed ports and wiring.** Backend `:8000`, frontend `:5173`, frontend calls relative `/api/*` through the Vite
  proxy; CORS also allows `http://localhost:5173` and `http://127.0.0.1:5173`.
- **I-19 — Stale responses are discarded.** Frontend tags each request and ignores any response that isn't the latest
  for that panel (AbortController or request counter). Predict echoes `scenario` so this is checkable.
- **I-20 — No runtime network dependency except the optional LLM.** Fonts and assets are bundled locally (no CDN links
  in the built app). Demo must work offline.
- **I-21 — Sparse-gravity honesty.** For `0.05 < gravity_g < 0.95` the CI is widened (factor in `/api/meta`) and the UI
  shows a visible "interpolated — sparse data" note on the uncertainty band. `ci_widened: true` is returned.
- **I-22 — Panel isolation.** A failure in one panel (API error, render exception) cannot affect any other panel.
- **I-23 — Heatmap and compare don't refetch on irrelevant inputs.** Heatmap depends on `{material, pressure_kpa, gravity_g}`;
  moving O₂ or airflow only moves the crosshair. Compare depends on `{material, o2, pressure, airflow}`; gravity changes
  don't refetch it. (Table in `05_FRONTEND_CONTRACT.md`.)

## Process

- **I-24 — Directory ownership** (see `00_START_HERE.md`). Cross-boundary edits only with the other person's OK.
- **I-25 — `main` always runs.** Never merge something that makes `make dev` fail. Run the smoke test (`08_TASKS.md`) before merging.
- **I-26 — Library pins.** Python 3.11 or 3.12 (not 3.13: `shap`/`numba` wheels lag). Pin versions in
  `backend/requirements.txt`; Node 20 LTS. Commit lockfiles.
- **I-27 — Not for real fire-safety decisions.** The UI footer and About modal state this is a research/education demo,
  not operational guidance.
