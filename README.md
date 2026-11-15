# FIRE COMMAND: ZERO-G

AI-powered microgravity fire-safety dashboard (NASA Space Apps, "Flame in Freefall"). Configure a spacecraft scenario, see predicted
fire behaviour and risk, explore the NASA combustion runs behind the predictions, and read grounded AI insights.

> Research and education demo. Not for operational fire-safety decisions.

**Planning docs live in [`docs/`](docs/00_START_HERE.md)** (contracts, invariants, risks, task board). Read those before changing anything shared.

## Quick start

```bash
cp .env.example .env     # optional; STUB_MODE=0 (trained model) is the default
make setup               # python venv + deps (+ npm ci once /frontend exists)
make dev                 # backend http://localhost:8000  +  frontend http://localhost:5173
```

Requirements: Python 3.11 or 3.12 (not 3.13, see I-26), Node 20, `make`.

Backend only: `cd backend && .venv/bin/uvicorn main:app --reload` (interactive API docs at http://localhost:8000/docs).

| Command | What it does |
|---|---|
| `make setup` | create `backend/.venv`, install pinned deps, `npm ci` if the frontend exists, create `.env` |
| `make dev` | run backend (:8000) and frontend (:5173); Ctrl-C stops both; refuses if a port is busy |
| `make test` | backend tests (mock trends, loader rules, API contract) |
| `make smoke` | automated part of the smoke test (health, meta, predict) |
| `make mock` | regenerate `data/mock_combustion_runs.csv` (deterministic, seed 20241014) |
| `make train` | train and cache the model on the active data (`--force` to retrain) |
| `python backend/sanity_check.py` | 5 behaviour checks (O₂ raises risk, blow-off, starvation, cooler 0 g flames, heatmap corners); run before every demo |
| `make validate-data FILE=data/combustion_runs.csv` | validate a real CSV and print `backend/data_report.json` |

## Data: MOCK vs NASA

- `data/combustion_runs.csv` present and valid → **NASA DATA** badge. Present but invalid → the backend refuses to start and says why (it never silently falls back to mock).
- Absent → the deterministic mock file `data/mock_combustion_runs.csv` is used → **MOCK DATA** badge. Every mock row's `source_note` starts with `[MOCK]`.
- Column schema: `data/schema.json` (details in `docs/03_DATA_CONTRACT.md`). To plug in real NASA PSI data, follow section 4 of that doc, drop the CSV in `data/`, restart.

### Real NASA data (built, not active)

`make real-data` builds `data/candidate/combustion_runs.csv` from NASA PSI FLEX (droplets) and Saffire-II (solids), CC0; see [`data/SOURCES.md`](data/SOURCES.md).
Try it without activating: `make train DATA=data/candidate/combustion_runs.csv` and `make sanity DATA=data/candidate/combustion_runs.csv`.
Activate with `make promote-real` and restart: the badge becomes NASA DATA and the model retrains. **Be aware:** the real data is all 0 g, has no flame temperature and only
two predictable materials (methanol, heptane), so `meta.model.capabilities` is false/false, `flame_temp_k` is null and the Earth-vs-Space comparison has no real basis.

## Risk Index (shown verbatim in the dashboard tooltip)

```
spread_norm = clip(spread_rate_mm_s / SPREAD_REF, 0, 1)        SPREAD_REF = 99th percentile of spread rate in the training data
risk_index  = 100 × ( 0.6 × spread_norm + 0.4 × (1 − extinction_probability) )
```

0 = flame dies at once and barely moves; 100 = fastest-spreading flame that certainly survives. It is a **relative score, not a probability of loss**.
A flame that survives but spreads very slowly scores about 40, so the "SAFE ZONE" (risk < 25) needs both slow spread and a high chance of self-extinguishing.
Bands: low < 25 ≤ elevated < 50 ≤ high < 75 ≤ critical. All constants live in `backend/config.py` and are published at `/api/meta`.

## Model

Gradient boosting (scikit-learn): spread rate (+ 10%/90% quantile models for the interval), flame temperature, and an extinction classifier, trained on the active dataset at startup
(background thread; endpoints return 503 `MODEL_NOT_READY` until ready) and cached in `backend/models/` keyed by the data hash, so replacing the CSV retrains automatically.
SHAP explains the risk in risk-index points. Metrics are in `/api/meta` (`model.metrics`); on mock data they show how well the model recovers the generator, not physics.

## AI insights

`/api/insights` and `/api/ask` retrieve the 5 most similar runs, then (if `LLM_API_KEY` is set in `.env`) ask the configured LLM (`LLM_PROVIDER=openai|anthropic`, optional `LLM_BASE_URL` for compatible servers) to explain them.
Every citation is validated against the retrieved runs; anything invalid, slow (>`LLM_TIMEOUT_S`), rate-limited or failing falls back to deterministic templates computed from the same runs, so the app never breaks and works offline.
Responses say which path produced them (`generated_by`). Never put the key anywhere except `.env`.

## Stub mode

`STUB_MODE=1` serves every endpoint from a cheap analytic surface with realistic directions (more O₂ → faster, 0 g → cooler, starved flames die),
so the frontend can be built before the model exists. `/api/meta.model.stub` is `true` and the UI shows a STUB tag. Retrieval, matching-run counts and citations are real (computed from the loaded runs).

## Layout

```
backend/    FastAPI app, loader, mock generator, scoring, retrieval, tests   (Track A)
frontend/   React + Vite dashboard                                             (Track B)
data/       schema.json, vocab.json, mock CSV, (real CSV + SOURCES.md later)
docs/       contracts, invariants, risks, tasks, fixtures
scripts/    dev.sh
```

## API

Full contract: [`docs/02_API_CONTRACT.md`](docs/02_API_CONTRACT.md), examples in `docs/fixtures/`.
`GET /api/health` · `GET /api/meta` · `GET /api/runs` · `POST /api/predict` · `POST /api/heatmap` · `POST /api/compare` · `POST /api/insights` · `POST /api/ask` · `POST /api/passport` · `POST /api/advise`
