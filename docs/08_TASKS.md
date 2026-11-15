# 08 — Task Board

Tick boxes in PRs. Each task lists **owner track** and **done when**. Tiers are sequential: no starting Tier N+1 work (except Track C
and pre-agreed stubs) until Tier N's **acceptance checklist** is entirely green. Track names: A = Data/Backend/ML, B = Frontend, C = Content/Demo.

## Day-0 setup (together, ≤ 1 hour)

- [ ] **(A)** Scaffold monorepo: `/frontend`, `/backend`, `/data`, `/docs`, root `README.md`, `Makefile`, `.env.example`, `.gitignore` (`.env`, `node_modules`, `__pycache__`, `backend/models/`, `data/raw/`, `.venv`). *Done when:* both people clone and see the same tree.
- [ ] **(A)** `Makefile` targets: `make setup` (venv + pip + npm ci), `make dev` (both servers, Ctrl-C kills both, port-in-use check), `make test`, `make train`, `make mock`, `make smoke`. *Done when:* `make dev` works on both machines from a fresh clone.
- [ ] **(A)** Pin Python 3.11/3.12 (`.python-version`), `requirements.txt` with exact versions, Node 20 (`.nvmrc`). (I-26)
- [ ] **(A)** `backend/schemas.py` (Pydantic) + `frontend/src/types.ts` created from `02_API_CONTRACT.md`; `data/schema.json` from `03` §1.
- [ ] **(A)** `STUB_MODE=1` endpoints for **every** endpoint returning fixture-shaped data (loaded from `docs/fixtures/*.json`, with a scenario-dependent tweak so sliders visibly change numbers). *Done when:* frontend can build all panels without the real model. (R-34)
- [ ] **(both)** Agree design tokens + grid layout sketch (`05` §7, R-29).

## Tier 1 — MVP (runs end to end)

**Track A**
- [ ] `config.py` (all constants), `data_loader.py` (loader rules `03` §2), `mock_data.py` (§5, with trend tests M-1…M-7), `data/schema.json`, `data_report.json` output. *Done when:* `pytest` green; mock CSV committed.
- [ ] `main.py` FastAPI: CORS (I-18), error envelope handler (`02`), `/api/health`, `/api/meta`, `/api/runs` (real implementations; the rest still stub).
- [ ] Contract tests 1, 2, 4 from `02` passing for the implemented endpoints.

**Track B**
- [ ] Vite + TS + Tailwind + Zustand scaffold, proxy, tokens, fonts bundled, `PanelShell`/`ErrorBoundary`/skeletons.
- [ ] Header (title, source badge, mode toggle, About button placeholder), Mission Setup bar (presets from meta), KPI tiles (placeholders or stub-driven), Experiment Explorer (scatter + table + drawer) on real `/api/runs`.
- [ ] `api/client.ts` with envelope parsing, abort, boundary shape check (R-16).

**Track C**
- [ ] Start PSI data hunt (R-01): list candidate datasets with URL/format/rows/license in `data/SOURCES.md`; report by hour 6.
- [ ] Verify vehicle preset values (ISS / Gateway / Lunar / Mars Transit) with citations; send corrections to A (they live in backend config only).

**Tier 1 acceptance (all must be true)**
- [ ] Fresh clone → `cp .env.example .env` → `make setup && make dev` → dashboard loads at :5173 on both machines.
- [ ] Badge reads MOCK DATA; Explorer scatter + table + drawer work; filters work; empty-filter state shows.
- [ ] Stop backend → all panels show error states, page doesn't crash; start backend → Retry recovers.
- [ ] No console errors; `make test` green.

## Tier 2 — Model + core panels

**Track A**
- [ ] `train.py` per `04` §3 (joblib cache keyed by data hash; background training; metrics).
- [ ] `predict_batch`, `/api/predict` (incl. SHAP with grouping & conversion, `matching_runs`), `/api/heatmap`, `/api/compare` — real, replacing stubs (`STUB_MODE=0` default).
- [ ] `sanity_check.py` (`04` §9) + contract tests 3, 5 (I-16, I-15).
- [ ] Update README with the risk formula verbatim.

**Track B**
- [ ] KPI tiles wired (all 5, with formatting `05` §6, tooltip formula from `meta.model.weights`), heatmap (custom SVG, crosshair, SAFE ZONE label, tooltip), Earth vs. Space (3 small multiples), SHAP panel (plain-language rows).
- [ ] Debounce + stale-response guards + dependency table (`05` §3). Verified in the network tab.

**Tier 2 acceptance**
- [ ] Moving O₂ slider changes predict only (+ insights later), **not** heatmap/compare requests (I-23).
- [ ] Heatmap cell under the crosshair has same risk as KPI (±1) — check at 5 random points (I-16/R-17).
- [ ] PMMA: risk increases with O₂; 0g vs 1g bars differ in the expected direction (temp lower in 0g) on mock.
- [ ] `matching_runs: 0` and `shap: []` render without errors (use fixtures/stub switch).
- [ ] `make test` + `make smoke` green; frontend fetches ≤ 1 predict per 300 ms during a drag.

## Tier 3 — Gravity, uncertainty, AI

**Track A**
- [ ] `retrieval.py` (`04` §7), `llm.py` (`04` §8) with provider switch, validation, cache, timeout, rate limit; `templates.py`; `/api/insights`, `/api/ask`.
- [ ] Contract test 6 (made-up run id dropped; fallback works). Test with key unset, key invalid, and LLM timing out.

**Track B**
- [ ] Gravity slider (marks, snapping, sparse-gravity shading), `<Flame>` (`05` §9), CI band/"widened" tag on the spread KPI.
- [ ] Insight Feed (cards, run chips → drawer, source/`generated_by` badges, MOCK tag, shimmer on refresh) + Ask the Fire Lab (500-char limit, example chips, pending/err states).
- [ ] About-the-Data modal using Track C copy.

**Track C**
- [ ] About modal copy (`05` §10) + template insight wording review (R-12) + glossary tooltips (diffusion flame, blow-off, extinction, quenching).

**Tier 3 acceptance**
- [ ] Unset `LLM_API_KEY` → insights appear (template) and `Ask` answers; badge says Template.
- [ ] With key: every chip resolves to a real run in the drawer; fabricated ids never show.
- [ ] Gravity drag keeps flame at 60 fps (no per-frame React renders) and band widens between 0.05–0.95 g.
- [ ] 10 random scenarios: insights make no claim contradicted by the cited runs (spot check by hand).

## Tier 4 — Command Mode, Material Passport, polish (only if Tier 3 is green)

- [ ] **(A)** `/api/passport`, `/api/advise` per `06`. **(B)** Passport grid + detail drawer; `sim/engine.ts` + unit tests; Command Mode UI + debrief. **(C)** debrief copy, action descriptions, polish checklist, demo recording.
- [ ] Polish: empty states, motion, keyboard focus, responsive 1280/1024, favicon, tab title, README screenshots.

**Tier 4 acceptance**
- [ ] Command Mode runs 3× in a row with identical results for identical choices (seeded).
- [ ] Every action visibly changes the predicted spread/extinction in the next KPI tick.
- [ ] Leaving Command mode mid-run leaves no timers/listeners (check devtools perf).

## Smoke test (run before every merge to `main`; `make smoke` automates what it can)

1. `curl :8000/api/health` → `status: ok`, `model_ready: true` (after warm-up).
2. `curl :8000/api/meta` → `data_source`, materials non-empty, ranges present.
3. POST `/api/predict` with fixture body → validates against `Prediction`.
4. Open :5173 → no console errors, all panels leave skeleton state within 5 s.
5. Change material + preset + gravity once → no error chips.

## Shared test scenarios (use these in demos and bug reports so we compare like with like)

| Name | material | O₂ % | kPa | airflow | g |
|---|---|---|---|---|---|
| ISS baseline | PMMA | 21 | 101.3 | 10 | 0 |
| Lunar habitat | PMMA | 34 | 56.5 | 8 | 0.17 |
| Starved flame | PMMA | 16 | 101.3 | 1 | 0 |
| Fed flame | PMMA | 35 | 101.3 | 15 | 0 |
| Earth ref | PMMA | 21 | 101.3 | 10 | 1 |

## 3-minute demo script (Track C owns; rehearse 3×)

1. (0:00) "Fire behaves differently without gravity" — open dashboard, point at MOCK/NASA badge, say what it is honestly.
2. (0:20) Pick ISS preset; slide gravity 1g → 0g; flame morphs; Earth-vs-Space panel shows cooler, slower flame.
3. (1:00) Raise O₂ to 35% → heatmap crosshair moves into the danger zone, SHAP says why in plain language.
4. (1:30) Click a cited run chip → drawer with source note; "every claim is grounded in a real experiment run".
5. (1:50) Ask the Fire Lab a question live.
6. (2:15) Command Mode: IGNITE, make two decisions, show debrief. (Skip if Tier 4 isn't green.)
7. (2:50) Limitations + "drop in real PSI data and the badge flips".

**Pre-demo checklist:** fresh-clone run on the demo laptop · wifi off run · key unset run · browser at demo resolution · `.env` has working key (or intentionally none) ·
60-s screen recording saved locally · both people know how to restart both servers · battery/sleep settings off.

## Changelog
- 2026-11-14 initial.
