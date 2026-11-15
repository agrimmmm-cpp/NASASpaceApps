# 07 — Risks: what can go wrong

Format: **ID — risk** · Likelihood/Impact (L/M/H) · *How we notice* · *Mitigation / what to do*. Owner in brackets.
Review this list at the end of each tier; add new ones as you hit them.

## Data

- **R-01 — Real NASA data doesn't fit our schema, or is too sparse/unavailable.** L: H · I: H · *Notice:* by hour 6 no mapped CSV with ≥ 100 usable rows. · *Mitigate:* time-box (`03` §4). Ship mock with honest badge; keep loader schema-driven; the "plug in real data" story is part of the pitch. Partial real data (even 40 rows of one experiment) is shown in the Explorer and used for citations. [C, A]
- **R-02 — Mock data mistaken for real (by judges, by the LLM, by us).** M · H · *Notice:* a screenshot with no badge; insight text saying "NASA data shows…". · *Mitigate:* I-09: persistent badge, `[MOCK]` source notes, MOCK tag on insight cards, LLM prompt told "these runs are `{data_source}`", About modal wording. Demo script says "mock data standing in for PSI" out loud. [A, B]
- **R-03 — Model learns the mock generator, not physics, and we over-claim.** H · M · *Mitigate:* describe the model as "trained on the dataset provided", show metrics honestly (they'll be suspiciously good on mock — say why), sanity checks (`04` §9) are about plausibility not proof. [A]
- **R-04 — Unit mismatches in real data** (m/s vs cm/s, °C vs K, fraction vs %, atm vs kPa, mm vs cm). H · H · *Notice:* spread rates 100× off; temps in the 100s; O₂ = 0.21. · *Mitigate:* one mapping file per source with a unit comment per column; the validator's hard ranges (`03` §1) reject out-of-range rows loudly; plot histograms of every column before committing real data. [C, A]
- **R-05 — Fuel types are not comparable.** Solid flame-spread rate, droplet burning/regression rate and gas-jet flame metrics are different physics. Mixing them under `spread_rate_mm_s` can mislead. H · M · *Mitigate:* material is a model feature; explorer colors by experiment and shows fuel_type; About modal limitation; Passport tags other fuel classes; never rank droplets against solids as "safer". Option if time: scope the headline demo to solids. [A, C]
- **R-06 — Class imbalance / label leakage in `extinguished`.** M · M · *Mitigate:* report class balance in `data_report.json`; calibration rule in `04` §3; extinction probability shown as a model estimate with matching-runs count next to it. [A]
- **R-07 — Duplicate / inconsistent run_ids across sources after merging.** M · L · *Mitigate:* loader fatal on duplicates; mapping files prefix ids with source. [A]
- **R-08 — Licensing/attribution of NASA data.** L · M · *Mitigate:* `data/SOURCES.md` with URL, retrieval date, terms; cite in About modal. [C]

## Model

- **R-09 — Extrapolation: user picks conditions far from any data** (e.g. Lunar 34% O₂ at 56.5 kPa for a material tested only at 21%). H · M · *Notice:* `matching_runs = 0`. · *Mitigate:* show matching count prominently; 0 → warning tint "extrapolating"; widen CI for partial g (I-21); LLM prompt includes the matching count; insights say so when low. [A, B]
- **R-10 — Quantile models cross, producing a negative or inverted CI.** M · L · *Mitigate:* I-15 clamps + test. [A]
- **R-11 — SHAP is slow/uninstallable (Python 3.13, numba) or doesn't sum to the risk.** M · M · *Notice:* install failure; startup > 20 s. · *Mitigate:* I-26 Python 3.11/3.12; compute SHAP only in `/predict` (not heatmap); cache explainer in the artifact; `shap: []` fallback; additive property only approximate (`04` §5) — UI never claims exactness. [A]
- **R-12 — Template insights assert something the data doesn't show.** M · H · *Mitigate:* templates compute every number from retrieved rows and only emit a sentence when its condition holds; unit tests for each template with fixture rows. [A]
- **R-13 — Positive-class mix-up** (`predict_proba[:,0]` is "survives"). M · H · *Notice:* extinction goes *up* with O₂. · *Mitigate:* assert `classes_` in code; sanity check #3/#1 in `04` §9; I-05 single-place conversion. [A, B]
- **R-14 — Model non-determinism makes the demo irreproducible.** L · M · *Mitigate:* I-13; commit the mock CSV; cache keyed by data hash. [A]
- **R-15 — Risk index misread as probability of catastrophe.** M · M · *Mitigate:* tooltip: "relative score, not a probability"; I-27. Note the ≈ 40 floor for slow-but-surviving flames (`04` §2). [B]

## API / integration

- **R-16 — Contract drift** (backend renames a field; frontend silently shows `undefined`). H · H · *Notice:* NaN in tiles. · *Mitigate:* fixtures + contract tests (`02`), types mirrored, PR rule in `00`. Frontend: validate responses at the boundary in `api/client.ts` (cheap runtime shape check on required keys → treat as error, not NaN). [A, B]
- **R-17 — Heatmap and predict disagree (orientation or code-path bug).** M · H · *Notice:* the crosshair sits on a "red" cell while the KPI says "low". · *Mitigate:* I-07, I-16 test; frontend visual check with fixture; shared test scenario in `08`. [A, B]
- **R-18 — Race conditions: late response overwrites newer inputs.** H · M · *Notice:* KPIs flash to old values after dragging. · *Mitigate:* I-19 (request ids + AbortController), echoed `scenario`. [B]
- **R-19 — Request storm from slider drags** (heatmap = 400 predictions). M · M · *Mitigate:* debounce table (`05` §3), I-23, vectorised batch (< 500 ms), in-memory LRU cache keyed by rounded inputs on the backend. [A, B]
- **R-20 — CORS / proxy misconfig on a fresh clone.** M · H · *Notice:* red CORS errors on the demo laptop. · *Mitigate:* I-18; Vite proxy + CORS both; test fresh clone on the *other* person's machine before every tier ends. [A]
- **R-21 — Backend slow on startup; frontend shows blank/errors.** M · M · *Mitigate:* `/api/health`, 503 `MODEL_NOT_READY` + frontend warm-up banner; joblib cache; training in background thread. [A, B]

## LLM

- **R-22 — LLM hallucinates run ids or facts.** H · H · *Mitigate:* I-11 validation, grounded prompt, low temperature, template fallback; the UI never shows a chip for an id that isn't in `/api/runs` (clicking an unknown id is guarded). [A]
- **R-23 — Prompt injection via `source_note` or the user's question.** L · M · *Mitigate:* notes are length-capped and delimited as data; output is JSON-parsed and validated so injected text can't create new run ids or actions; `/api/ask` ignores instructions to reveal prompts/keys; no tool access for the model. [A]
- **R-24 — No key / rate limit / timeout / wifi down during the demo.** H · H · *Mitigate:* template fallback (always works), 8 s timeout, response cache (`04` §8), `generated_by` badge so the UI is honest; rehearse the demo with the key unset. [A]
- **R-25 — Key leaked into git or logs.** L · H · *Mitigate:* `.env` gitignored, `.env.example` placeholders, no key in frontend, never log headers (I-12). Run `git log -p | grep -i key` before making the repo public. [A]
- **R-26 — LLM spend runaway from debounced inputs.** L · M · *Mitigate:* 800 ms debounce, 10-min cache, per-process rate limit (e.g. 30 LLM calls/min, then template). [A]

## Frontend

- **R-27 — Recharts can't do the heatmap / shaped scatter / diverging bars natively.** M · M (time sink) · *Mitigate:* heatmap = custom SVG; scatter uses custom `shape`; SHAP diverging bars via a single BarChart with ± values. Time-box each panel to 90 min; simplify if over. [B]
- **R-28 — Flame animation jank (re-render per slider tick).** M · M · *Mitigate:* Framer motion values, no state updates per frame (`05` §9); throttle. [B]
- **R-29 — Dashboard overload: too many panels, nothing readable at 1440 px.** M · M · *Mitigate:* grid layout fixed up front (hero row = setup + gravity + KPIs; middle = heatmap + compare + SHAP; bottom = explorer + insights); test on the actual demo laptop/projector resolution early. [B]
- **R-30 — Color-only encoding fails on projectors / for colour-blind judges.** M · M · *Mitigate:* band labels + numbers always present (`05` §7). [B]
- **R-31 — Memory leaks / timers in Command Mode.** M · M · *Mitigate:* engine is a pure module; one interval owned by one hook with cleanup; unit tests for engine; ABORT resets everything. [B]

## Process / team

- **R-32 — Merge conflicts and "works on my machine".** H · M · *Mitigate:* directory ownership, small PRs, pinned versions (I-26), lockfiles, `make dev` tested on both machines, `.env.example`. [A, B]
- **R-33 — Scope creep before Tier 2 is solid** (Command Mode before heatmap is right). H · H · *Mitigate:* tier acceptance checklist (`08`) — no starting the next tier with red boxes; Tier 4 is a luxury. [A, B]
- **R-34 — Backend blocks frontend (or vice versa).** H · M · *Mitigate:* `STUB_MODE`, fixtures, contract-first (`00` rule 2). [A]
- **R-35 — Demo-day failure** (laptop sleeps, port busy, projector resolution, no wifi). M · H · *Mitigate:* demo checklist in `08`; a 60-s screen recording of the full flow as a fallback; both people can launch the app; run from a clean clone the night before; `lsof -i :8000 -i :5173` check in `make dev`. [A, B, C]
- **R-36 — Over-claiming scientific or safety value in the pitch.** M · H · *Mitigate:* I-27, I-09; pitch language: "exploration and communication tool built on public research data"; list limitations ourselves before a judge does. [C]
- **R-37 — Stub values drift from the real model, so frontend never sees real edge cases.** M · M · *Mitigate:* stub covers edge fixtures (`shap: []`, `null` TTC, `ci_widened`, `matching_runs: 0`) via a `?scenario` switch; integrate with the real model by end of Tier 2 at the latest. [A]

## Changelog
- 2026-11-14 initial.
