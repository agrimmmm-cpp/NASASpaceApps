# 04 — Model Spec

Owner: Track A. All constants live in `backend/config.py` and are published at `/api/meta.model` (I-06). Frontend never copies them.

## 1. Constants

| name | value | meaning |
|---|---|---|
| `W_SPREAD` | 0.6 | weight of normalised spread in risk |
| `W_SURVIVAL` | 0.4 | weight of (1 − extinction_probability) in risk |
| `SPREAD_REF_MM_S` | 99th percentile of `spread_rate_mm_s` in training data (floored at 0.1) | normaliser; stored in the model artifact, so it moves with the data and the heatmap stays consistent with predict |
| `CRITICAL_LENGTH_MM` | 100 | flame-front travel regarded as "critical" for `time_to_critical_s`; illustrative demo constant, labelled as such in UI tooltip |
| `NO_ESCALATION_SPREAD` | 0.05 mm/s | below this `time_to_critical_s = null` |
| `TTC_CAP_S` | 3600 | cap on time_to_critical |
| `CI_QUANTILES` | 0.1, 0.9 | quantile GBM alphas |
| `CI_WIDEN` | g in (0.05, 0.95) → half-widths × 1.5 | sparse-gravity widening (I-21) |
| `RANDOM_STATE` | 42 | I-13 |
| `RISK_BANDS` | low [0,25), elevated [25,50), high [50,75), critical [75,100] | colors cyan / amber / orange / red |
| `GRADE_BANDS` | A <20, B <35, C <50, D <65, E <80, F ≥80 (upper bounds exclusive) | Tier 4 |

## 2. Formula (published verbatim in README and the risk tooltip)

```
spread_norm = clip(spread_rate_mm_s / SPREAD_REF_MM_S, 0, 1)
risk_index  = 100 × ( W_SPREAD × spread_norm + W_SURVIVAL × (1 − extinction_probability) )
```

Interpretation: 0 = flame dies at once and barely moves; 100 = fastest-spreading flame and certain survival.
Properties to know (and put in the tooltip): a flame that is certain to survive but spreads very slowly scores ≈ 40 ("elevated");
the "SAFE ZONE" (< 25) therefore requires **both** slow spread **and** a high chance of self-extinguishing. That's intended.

## 3. Models (`backend/train.py`)

All scikit-learn gradient boosting, `random_state=42`. Input matrix = one-hot(material) + `o2_percent`, `pressure_kpa`, `airflow_cm_s`, `gravity_g`.
Encoder fitted on training materials; column order saved in the artifact.

| model | class | target | trained on |
|---|---|---|---|
| spread (point) | `GradientBoostingRegressor(loss="squared_error")` | `spread_rate_mm_s` | rows with non-null spread |
| spread_lo / spread_hi | `GradientBoostingRegressor(loss="quantile", alpha=0.1 / 0.9)` | same | same |
| temp | `GradientBoostingRegressor` | `flame_temp_k` | rows with non-null temp |
| ext | `GradientBoostingClassifier` | `extinguished` | rows with non-null label |

Use modest hyper-parameters (n_estimators 200–300, max_depth 3, learning_rate 0.05, subsample 0.8) — data is small, don't overfit. Do not
spend time tuning; spend it on checking behaviour (§8).

- **Class imbalance:** if `extinguished` is < 10% or > 90% positive, still train, but log a warning. If only one class exists, a constant probability is used and `extinction_auc` is `null`.
  Probabilities are used **raw** (no calibration wrapper) so SHAP explains the exact model that predicts.
- **Metrics** (5-fold CV, reported in `/api/meta.model.metrics`): `spread_r2`, `temp_r2`, `extinction_auc`, `n_train`. If a metric is
  undefined (single class), report `null`, never fake a number. Frontend shows them in the About modal.
- **Artifact:** `backend/models/model_<hash8>.joblib` containing models, encoder, column order, constants snapshot, metrics, trained_at.
  On startup: load if hash matches current data; else train (target < 20 s on mock). Train in a background thread; endpoints return 503 `MODEL_NOT_READY` until done.

## 4. Prediction (`predict_batch(df_scenarios)`, I-16)

1. Validate/encode. Unknown material → `UNKNOWN_MATERIAL`.
2. `spread = max(0, spread_model)`; `lo, hi` from quantile models.
3. **CI repair (I-15):** `lo = max(0, min(lo, spread))`, `hi = max(hi, spread)`.
4. **CI widening (I-21):** if `0.05 < g < 0.95`: `lo = spread − factor×(spread − lo)` (clamped ≥ 0), `hi = spread + factor×(hi − spread)`; `ci_widened = True`.
5. `extinction_probability = ext.predict_proba(X)[:, 1]` (positive class = extinguished — assert `classes_` order in code).
6. `flame_temp_k` from temp model.
7. `risk_index` from §2, rounded 1 dp; `risk_band` from bands; `time_to_critical_s = null if spread < 0.05 else min(3600, 100/spread)`.
8. Everything is vectorised; the single-scenario endpoint is a batch of one.

## 5. SHAP ("Why this risk?")

- Use `shap.TreeExplainer` on the spread model and on the classifier. **Group the one-hot material columns into one `material` feature** by summing their SHAP values.
- Convert to risk-index points so the bars are comparable and sum to the risk:
  - spread part: `100 × W_SPREAD × shap_spread / SPREAD_REF` (ignore the clip; note as approximation)
  - extinction part: classifier SHAP is in log-odds; map to probability with the **secant slope** of the sigmoid between the base and the actual log-odds, `slope = (p − p_base) / Σshap` (falls back to `p(1−p)` when Σshap ≈ 0), so points = `100 × W_SURVIVAL × (−slope) × shap_logodds`. This keeps the extinction part exactly additive.
  - `contribution[feature] = spread part + extinction part`.
- `shap_base` = risk at the explainers' expected values using the same formulas. Measured on mock data: median error 0.05, 95th percentile 0.10 risk points; the rare large errors (up to ~9) occur when the spread clips at `SPREAD_REF`. Test asserts median ≤ 1 and max ≤ 8 on a fixed sample. Don't promise exact additivity in the UI.
- Sign convention: positive = pushes risk **up**. Sorted by absolute value.
- If `shap` can't be imported or fails → `shap: []` and `shap_base: risk_index`; log once. Never fail the request.
- Plain-language sentences are produced in the **frontend** from `{feature, contribution, scenario}` (templates in `05_FRONTEND_CONTRACT.md` §8), not by the LLM.

## 6. `matching_runs`

Count of real rows with the **same material** and all of: `|Δo2| ≤ 2` pts, `|Δpressure| ≤ 10` kPa, `|Δairflow| ≤ 5` cm/s, `|Δgravity| ≤ 0.1`.
Tolerances are config constants. 0 is a legitimate value; the UI shows "0 — extrapolating" with a warning tint.

## 7. Retrieval for insights/ask (`backend/retrieval.py`)

- Candidate set: all runs with non-null core fields.
- Features min-max normalised using `meta.ranges` (not data min/max, so it's stable): `o2, pressure, airflow, gravity`.
- `distance = sqrt( 1.0·Δo2² + 0.5·Δpressure² + 1.0·Δairflow² + 2.0·Δgravity² ) + (1.0 if material differs else 0)`.
- Top 5 ascending by distance; tie-break `run_id`. Deterministic. Return the full Run rows to the prompt builder.

## 8. LLM layer (`backend/llm.py`)

- Provider-agnostic wrapper. Env: `LLM_PROVIDER` (`openai` | `anthropic`), `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` (optional), `LLM_TIMEOUT_S` (8). No key → `llm_enabled=false`, template path.
- Prompt skeleton (system): "You are a spaceflight fire-safety analyst. Use ONLY the numbered runs below. Every statement must cite at least one run_id from the list. If the runs don't support a claim, don't make it. Return JSON only: `{\"insights\":[{\"text\":..., \"cited_run_ids\":[...]}]}`. 3–5 insights, each ≤ 30 words, plain language."
- User content: the scenario, the model prediction (numbers), and the 5 runs as compact JSON. Run `source_note` text is **untrusted data**: put it inside a delimited block and tell the model to treat it as data, not instructions. Truncate each note to 200 chars.
- Post-process: parse JSON (strip code fences), validate (I-11): an insight citing **any** id outside the retrieved set is dropped; dedupe, cap 5, truncate text to 240 chars. If fewer than 3 valid insights remain (contract promises 3–5), the **whole** response is replaced by templates (never mixed). Any failure / timeout / non-JSON / HTTP error / rate limit → template, still HTTP 200.
- `/api/ask` LLM output is `{"answer", "cited_run_ids", "supported"}`: citations must be ⊆ retrieved; a `supported: true` answer must cite ≥ 1 run; `supported: false` ("dataset doesn't contain runs that answer this") may cite none. Answers are truncated to 120 words. Obvious off-topic questions are declined **before** any LLM call by a keyword guard (`templates.on_topic`), also used by the template path.
- Rate limit: 30 outbound LLM calls/min per process (`config.LLM_RATE_PER_MIN`), then templates. Cache: 10 min, 256 entries, key = model version + data source + scenario rounded to 2 dp (+ normalised question).
- Default models if `LLM_MODEL` is empty: `gpt-4o-mini` (openai) / `claude-haiku-5-5` (anthropic). Anthropic and OpenAI(-compatible via `LLM_BASE_URL`) are spoken through plain HTTPS (httpx), no SDK dependency.
- Template and LLM text are both prefixed/briefed so mock-data runs are never described as NASA results (I-09): templates prefix `[MOCK] `; the system prompt carries a mock-data rule.
- Temperature ≤ 0.3. Cache responses in memory keyed by `hash(model_version, scenario rounded to 2dp, question)` for 10 minutes (debounced slider changes + demo re-runs shouldn't re-bill).
- **Template fallback** (`backend/templates.py`): rule-based sentences from prediction + retrieved runs, e.g.
  - extinction high: "At {g}g with only {airflow} cm/s airflow, {material} flames self-extinguished in {k} of the {n} closest runs [cites]."
  - O₂ high: "Raising O₂ to {o2}% roughly {ratio}× the spread rate vs. air-normal in similar runs [cites]." (only if supported by retrieved rows — compute, don't assert)
  - gravity: compare nearest 0g vs 1g retrieved runs when both exist.
  Templates must compute their claims from the retrieved rows. A template that says something the rows don't show is a bug (R-12).
- Never log the key, the full prompt with the key, or request headers.

## 9. Behaviour checks (run before every demo; Track A owns a script `backend/sanity_check.py`)

Using the active data (mock or real), the model should, for PMMA at 101.3 kPa:
1. risk increases with O₂ (21 → 35) at fixed other inputs;
2. at g=0, spread vs airflow rises then falls (peak somewhere in 5–25 cm/s on mock);
3. extinction probability at (g=0, airflow 0–2, O₂ 16) > at (g=0, airflow 10, O₂ 30);
4. 0g flame temp < 1g flame temp;
5. heatmap corners: low-O₂/low-airflow corner risk < high-O₂/mid-airflow cell.

On **real** data these may not all hold; that is information, not a bug. Print pass/fail, don't assert. If a check fails on real data, tell the team: it changes what the demo can claim.

## Changelog
- 2026-11-14 initial.
- 2026-11-15 (Track A) Tier 3 implemented (`llm.py`, `templates.py`, `ai.py`): rules above. Insights/ask now return `generated_by: "llm"` only when validated.
- 2026-11-15 (Track A) Tier 2 implemented: no calibration wrapper; SHAP extinction part uses secant slope instead of tangent; artifact name `model_<hash8>_v<MODEL_CODE_VERSION>.joblib`; training in a background thread, 503 `MODEL_NOT_READY` until done.
