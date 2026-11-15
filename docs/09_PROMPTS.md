# 09 — Kickoff Prompts (one per person)

Paste your prompt into your own Claude Code session at the repo root. Both people use the same docs as the source of truth.
Split: **Person A = Data + Backend + ML (+ real NASA data hunt)**. **Person B = Frontend (+ About copy, demo script, slides)**.
Swap names if you like, but keep the boundaries.

---

## Shared preamble (already included in both prompts below)

We are a 2-person team building "Fire Command: Zero-G" for NASA Space Apps (track: Flame in Freefall).
The planning docs in `/docs` are the source of truth. Read `docs/00_START_HERE.md` first, then the docs listed for your role.
`docs/01_INVARIANTS.md` rules (I-xx) must not be broken. Do not change a contract unilaterally: follow "Changing a contract" in `00_START_HERE.md`.
Work only in the directories you own. Small PRs into `main`; `main` must always run (I-25).

---

## Prompt for Person A — Data + Backend + ML

```
You are Person A (Track A: Data + Backend + ML) on a 2-person NASA Space Apps team building "Fire Command: Zero-G",
a microgravity fire-safety dashboard. Person B builds the frontend in parallel.

Read first, in this order: docs/00_START_HERE.md, docs/01_INVARIANTS.md, docs/02_API_CONTRACT.md, docs/03_DATA_CONTRACT.md,
docs/04_MODEL_SPEC.md, docs/07_RISKS.md, docs/08_TASKS.md. Skim docs/05_FRONTEND_CONTRACT.md and docs/06_TIER4_SPEC.md.
Use docs/fixtures/*.json as the exact response shapes.

You own: /backend, /data, docs/02-04, docs/fixtures, root README.md, Makefile, .env.example, .gitignore.
Do NOT edit /frontend. If you need a frontend change, message Person B.

Order of work (follow docs/08_TASKS.md; finish each tier's acceptance checklist before starting the next):
1. Day-0: scaffold the monorepo, Makefile (make setup/dev/test/train/mock/smoke), pinned Python 3.11/3.12 deps,
   backend/schemas.py (Pydantic, mirroring the contract), data/schema.json, and STUB_MODE=1 for EVERY endpoint
   returning fixture-shaped data so Person B is never blocked. Push this first and tell Person B.
2. Tier 1: config.py (all constants), data_loader.py, mock_data.py with the M-1..M-7 trend tests, real /api/health, /api/meta,
   /api/runs, CORS, the error envelope, contract tests.
3. Tier 2: train.py, predict_batch (single code path, I-16), /api/predict with SHAP grouping and conversion, /api/heatmap,
   /api/compare, sanity_check.py. Default to STUB_MODE=0.
4. Tier 3: retrieval.py, llm.py (provider switch, JSON validation of cited ids, timeout, cache, rate limit), templates.py,
   /api/insights, /api/ask. Test with the key unset, invalid, and timing out.
5. Tier 4 only if Tier 3 is green: /api/passport and /api/advise.
Parallel track: hunt for real NASA Physical Sciences Informatics data (time-box: decide by hour 6). Record sources in
data/SOURCES.md, write one mapping file per source with a unit comment per column, never invent values, never mix in mock rows.

Hard rules: snake_case JSON and fixed units (I-01, I-02); API returns 422 for out-of-range input, never clamps (I-14);
LLM key only in .env, never logged (I-12); every cited run id must be in the retrieved set (I-11); never overwrite
data/combustion_runs.csv from code (I-17); deterministic seeds (I-13).
Before each merge run make test and make smoke. Report at the end of each tier: what was built, how to run it, what's next,
and anything in docs/07_RISKS.md that you hit or that is now more likely.
```

---

## Prompt for Person B — Frontend (+ content)

```
You are Person B (Track B: Frontend, plus Track C content/demo) on a 2-person NASA Space Apps team building
"Fire Command: Zero-G", a mission-control dashboard for microgravity fire safety. Person A builds the backend, data and ML in parallel.

Read first, in this order: docs/00_START_HERE.md, docs/01_INVARIANTS.md, docs/02_API_CONTRACT.md, docs/05_FRONTEND_CONTRACT.md,
docs/07_RISKS.md, docs/08_TASKS.md. Skim docs/03_DATA_CONTRACT.md, docs/04_MODEL_SPEC.md, docs/06_TIER4_SPEC.md.
Use docs/fixtures/*.json as the exact response shapes, including predict_edge_cases.json.

You own: /frontend, docs/05, and frontend/src/types.ts (mirror docs/02 exactly, snake_case, I-01).
Do NOT edit /backend or /data. If you need an API change, message Person A and use the contract-change process.

Stack: React + Vite + TypeScript (strict) + Tailwind + Recharts + Framer Motion + Zustand. Node 20. Fonts and assets bundled
locally, no CDN (I-20). Vite proxies /api to localhost:8000.

Order of work (follow docs/08_TASKS.md; finish each tier's acceptance checklist before starting the next):
1. Tier 1: scaffold, tokens, PanelShell/ErrorBoundary/skeletons, api/client.ts (abort, envelope parsing, response shape check),
   header with data-source badge and mode toggle, Mission Setup bar (presets from /api/meta), KPI tiles, Experiment Explorer
   (scatter + table + drawer). Develop against Person A's STUB_MODE until the real model lands; render every fixture.
2. Tier 2: wire KPIs, custom SVG heatmap (crosshair, SAFE ZONE label), Earth vs Space as three small multiples, SHAP panel with
   plain-language rows. Implement the dependency/debounce table exactly (heatmap and compare must not refetch on irrelevant
   inputs, I-23) and stale-response guards (I-19).
3. Tier 3: gravity slider with marks and sparse-gravity shading, the Flame SVG component (no per-frame React renders), CI band,
   Insight Feed with cited-run chips, Ask the Fire Lab, About-the-Data modal.
4. Tier 4 only if Tier 3 is green: Material Passport, sim/engine.ts (pure, seeded, unit-tested), Command Mode UI and debrief.
Content/demo track (do in gaps): About-the-Data copy, glossary tooltips, review template insight wording for claims the data
doesn't support, verify vehicle preset values with citations (send corrections to Person A), the 3-minute demo script and a
60-second backup screen recording.

Hard rules: never recompute risk, grades or bands in the frontend (I-06, I-08); survival = 1 - extinction_probability in exactly
one helper (I-05); every panel has loading, error and empty states and its own error boundary, and the page never goes blank (I-10, I-22);
the MOCK DATA badge reflects /api/meta.data_source (I-09); colour is never the only signal; respect prefers-reduced-motion.
Before each merge, check the network tab during a rapid slider drag and run the frontend checklist in docs/05 section 11.
Report at the end of each tier: what was built, how to run it, what's next, and any risk from docs/07_RISKS.md you hit.
```

---

## Sync points (both people, 5 minutes each)

1. After Day-0: Person A confirms stub mode serves every endpoint; Person B confirms the dashboard shell loads from the stubs.
2. End of Tier 1 and Tier 2: fresh-clone `make dev` on the *other* person's machine; compare the shared test scenarios in docs/08.
3. Before Tier 4: both agree Tier 3 acceptance is fully green.
4. Night before the demo: full rehearsal with wifi off and the API key unset.
