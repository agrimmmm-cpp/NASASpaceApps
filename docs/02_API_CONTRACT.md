# 02 — API Contract

Owner: Track A (backend). Consumers: Track B (frontend). Canonical types: `backend/schemas.py` (Pydantic) and
`frontend/src/types.ts` — they must mirror this doc. Example payloads: `docs/fixtures/`.
Invariants referenced: see `01_INVARIANTS.md`.

## Global conventions

- Base path `/api`. JSON in, JSON out. `Content-Type: application/json`. Keys `snake_case` (I-01). Units per I-02.
- Numbers: floats rounded server-side — `risk_index` 1 dp, `spread_rate_mm_s` 3 dp, probabilities 3 dp, `flame_temp_k` 0 dp.
- No pagination except `/api/runs` (see below). No auth.
- Every error uses the envelope below; HTTP status in table. FastAPI's default `{"detail": ...}` 422 body must be overridden.
- Unknown extra request fields are ignored; missing/invalid required fields → 422.
- `STUB_MODE=1` (env): every endpoint returns deterministic, cheaply-computed data in the exact shapes below, and `/api/meta.model.stub = true`.
  Frontend shows a small "STUB" tag when this is true.

### Error envelope

```ts
interface ApiError {
  error: {
    code: "VALIDATION_ERROR" | "UNKNOWN_MATERIAL" | "MODEL_NOT_READY" | "DATA_ERROR" | "INTERNAL";
    message: string;          // human-readable, safe to show
    details?: Record<string, unknown>; // e.g. { field: "o2_percent", min: 15, max: 40 }
  };
}
```

| Status | When |
|---|---|
| 200 | Success (including template-fallback insights) |
| 422 | `VALIDATION_ERROR` (out of range, wrong type), `UNKNOWN_MATERIAL` |
| 503 | `MODEL_NOT_READY` (still training/loading) — frontend shows "model warming up" and retries with backoff |
| 500 | `INTERNAL` (never leak traces) |
| — | LLM failure is **not** an error: fall back to template, `generated_by: "template"` |

### Shared types

```ts
type DataSource = "mock" | "nasa";
type MaterialId = string;      // canonical id from /api/meta.materials[].id  (I-04)
type RiskBand = "low" | "elevated" | "high" | "critical";

interface Scenario {           // every predictive endpoint takes some subset of this
  material: MaterialId;
  o2_percent: number;          // 15–40
  pressure_kpa: number;        // 50–101.3
  airflow_cm_s: number;        // 0–50
  gravity_g: number;           // 0–1
}
```

Valid ranges come from `/api/meta.ranges`; the API enforces them (I-14).

---

## GET `/api/health`

Cheap liveness probe the frontend polls at startup.

```ts
interface Health { status: "ok"; model_ready: boolean; data_source: DataSource; }
```

---

## GET `/api/meta`

Single source of configuration for the UI (I-04, I-06, I-08).

```ts
interface Meta {
  data_source: DataSource;              // I-09
  n_runs: number;
  materials: { id: MaterialId; label: string; fuel_type: "solid" | "droplet" | "gas" }[];
  experiments: string[];                // distinct values present in data
  vehicles: VehiclePreset[];
  ranges: {
    o2_percent:   { min: number; max: number; step: number };   // 15, 40, 0.5
    pressure_kpa: { min: number; max: number; step: number };   // 50, 101.3, 0.1
    airflow_cm_s: { min: number; max: number; step: number };   // 0, 50, 1
    gravity_g:    { min: number; max: number; step: number };   // 0, 1, 0.01
  };
  gravity_marks: { value: number; label: string }[];            // 0 "Microgravity", 0.17 "Moon", 0.38 "Mars", 1 "Earth"
  risk_bands: { band: RiskBand; min: number; max: number }[];   // inclusive-min, exclusive-max; last max = 100 inclusive
  grade_bands: { grade: "A"|"B"|"C"|"D"|"E"|"F"; max_risk: number }[];  // Tier 4
  model: {
    version: string;                    // "<trained_at ISO>-<data hash first 8>"
    trained_at: string;                 // ISO 8601
    spread_ref_mm_s: number;            // SPREAD_REF used in risk formula
    weights: { spread: number; survival: number };   // 0.6 / 0.4
    critical_length_mm: number;         // used for time_to_critical (100)
    ci_widen: { g_min: number; g_max: number; factor: number };  // 0.05, 0.95, 1.5
    capabilities: { flame_temp: boolean; gravity_effect: boolean };  // what the loaded data can support; UI hides temperature / Earth-vs-Space when false
    metrics: { spread_r2: number | null; temp_r2: number | null; extinction_auc: number | null; n_train: number | null };  // null = not available (no model yet / undefined)
    stub: boolean;
  };
  llm_enabled: boolean;                 // false if no key → UI shows "template insights" note
}

interface VehiclePreset {
  id: string;                           // "iss" | "gateway" | "lunar" | "mars_transit"
  label: string;
  o2_percent: number;
  pressure_kpa: number;
  airflow_cm_s: number;                 // typical cabin ventilation
  gravity_g: number;                    // iss/gateway/mars_transit 0.0, lunar 0.17
  note: string;                         // e.g. "NASA exploration atmosphere" — shown as tooltip
}
```

Vehicle values (placeholders for Track C to verify and cite; the backend is the only place they live):

| id | label | O₂ % | kPa | airflow | g |
|---|---|---|---|---|---|
| `iss` | ISS | 21.0 | 101.3 | 10 | 0.0 |
| `gateway` | Artemis Gateway | 21.0 | 101.3 | 10 | 0.0 |
| `lunar` | Lunar Habitat | 34.0 | 56.5 | 8 | 0.17 |
| `mars_transit` | Mars Transit | 26.5 | 70.3 | 8 | 0.0 |

---

## GET `/api/runs`

Query (all optional): `material`, `experiment`, `gravity_min`, `gravity_max`, `o2_min`, `o2_max`, `limit` (default 5000, max 5000).

```ts
interface Run {                    // exactly the CSV columns (I-03). null only where real data has gaps.
  run_id: string;
  experiment: string;
  fuel_type: "solid" | "droplet" | "gas";
  material: MaterialId;
  gravity_g: number;
  o2_percent: number;
  pressure_kpa: number;
  airflow_cm_s: number;
  spread_rate_mm_s: number | null;
  flame_temp_k: number | null;
  extinguished: boolean | null;
  burn_duration_s: number | null;
  source_note: string;
}
interface RunsResponse { runs: Run[]; total: number; truncated: boolean; data_source: DataSource; }
```

Sorted by `run_id` ascending (stable). Filtering and sorting in the table are done client-side on the returned list.

---

## POST `/api/predict`

Body: `Scenario`.

```ts
interface Prediction {
  scenario: Scenario;                       // echo, for stale-response detection (I-19)
  spread_rate_mm_s: number;
  spread_rate_ci: [number, number];         // [low, high], low ≤ spread ≤ high (I-15)
  ci_widened: boolean;                      // true when g in (0.05, 0.95) (I-21)
  flame_temp_k: number | null;              // added vs. original brief. null when the loaded data has no temperature measurements (meta.model.capabilities.flame_temp = false)
  extinction_probability: number;           // 0–1, P(extinguish)  (I-05)
  risk_index: number;                       // 0–100
  risk_band: RiskBand;                      // derived server-side from meta.risk_bands
  time_to_critical_s: number | null;        // null = no escalation (spread < 0.05 mm/s)
  shap: { feature: "material" | "o2_percent" | "pressure_kpa" | "airflow_cm_s" | "gravity_g";
          contribution: number }[];         // risk-index points; + increases risk; sorted by |contribution| desc
  shap_base: number;                        // risk at the dataset-average scenario; base + Σcontribution ≈ risk_index
  matching_runs: number;                    // runs within tolerance box (04_MODEL_SPEC §6)
  data_source: DataSource;
  model_version: string;
}
```

`shap` may be an empty array if SHAP is unavailable; the UI must render an "explanation unavailable" state (not an error).

---

## POST `/api/heatmap`

Body: `{ material, pressure_kpa, gravity_g }`.

```ts
interface Heatmap {
  material: MaterialId; pressure_kpa: number; gravity_g: number;   // echo
  o2_values: number[];        // length 20, linspace(15, 40, 20) ascending
  airflow_values: number[];   // length 20, linspace(0, 50, 20) ascending
  risk: number[][];           // 20 × 20, risk[airflow_index][o2_index]   (I-07)
  data_source: DataSource;
}
```

Latency budget: < 500 ms warm (vectorised batch of 400 rows, I-16).

---

## POST `/api/compare`

Body: `{ material, o2_percent, pressure_kpa, airflow_cm_s }`.

```ts
interface CompareSide {
  gravity_g: number;                 // exactly 0.0 or 1.0
  spread_rate_mm_s: number;
  flame_temp_k: number | null;
  extinction_probability: number;
  risk_index: number;
}
interface Compare {
  scenario: Omit<Scenario, "gravity_g">;   // echo
  microgravity: CompareSide;
  earth: CompareSide;
  data_source: DataSource;
}
```

---

## POST `/api/insights`

Body: `{ scenario: Scenario }`. The server computes the prediction itself (deviation from the original brief, which sent
`scenario + prediction`: trusting a client-supplied prediction lets stale/forged numbers reach the LLM). Any extra `prediction` field is ignored.

```ts
interface Insight { text: string; cited_run_ids: string[]; }   // ≥ 1 id each (I-11)
interface InsightsResponse {
  scenario: Scenario;                   // echo
  insights: Insight[];                  // 3–5
  retrieved_run_ids: string[];          // the 5 nearest runs sent to the model (04 §7)
  generated_by: "llm" | "template";
  data_source: DataSource;
}
```

Server timeout for the LLM call: `LLM_TIMEOUT_S` (default 8 s) → template fallback. Total endpoint budget: 10 s.
Template insights are instant, deterministic, and also cite retrieved runs.

---

## POST `/api/ask`

Body: `{ question: string (1–500 chars); scenario: Scenario }`.

```ts
interface AskResponse {
  answer: string;                // plain language, ≤ 120 words
  cited_run_ids: string[];       // ⊆ retrieved_run_ids (I-11); may be empty only for "can't answer" replies
  retrieved_run_ids: string[];
  generated_by: "llm" | "template";
  data_source: DataSource;
}
```

Behaviour rules: if the retrieved runs don't support an answer the reply says so ("The dataset doesn't contain runs
that answer this"). Off-topic questions (not about fire/combustion/materials/spacecraft conditions) get a polite decline.
The question text is untrusted data: it can't change the system prompt or reveal it. Template fallback answers with
a short summary of the retrieved runs plus the prediction.

---

## Tier 4 endpoints

`POST /api/passport` and `POST /api/advise` are specified in `06_TIER4_SPEC.md`. Do not build them before Tier 3 is accepted.

---

## Contract tests (Track A owns, runs in CI/pre-merge)

1. Every fixture in `docs/fixtures/` validates against its Pydantic model.
2. Calling each endpoint (stub **and** real mode) returns a body that validates against the same model.
3. I-16 consistency test (heatmap cell vs. predict).
4. I-14: out-of-range value → 422 with envelope for each endpoint.
5. I-15: `low ≤ point ≤ high` over a random sample of 500 scenarios.
6. I-11: stub the LLM to return a made-up run id → it's dropped; if all dropped → `generated_by: "template"`.

## Changelog
- 2026-11-14 (Track A) `meta.model.metrics` fields are nullable (null in stub mode / before training). Frontend: show "—".
- 2026-11-14 initial. Deviations from the original brief: added `/api/health`, `flame_temp_k` and `risk_band`/`shap_base`/`ci_widened`/`scenario` echo on predict; `/api/insights` body is `{scenario}` only; `material.id` canonical vs label.
- 2026-11-15 (Track A) **UI-affecting:** `flame_temp_k` is `number | null` on Prediction, CompareSide and PassportEntry; `meta.model.capabilities {flame_temp, gravity_effect}` added. On mock data temperature is always a number and both capabilities are true; on the real NASA data (`data/SOURCES.md`) temperature is null and both are false. Fixtures: `*_real_data.json`.
