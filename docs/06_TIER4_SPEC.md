# 06 — Tier 4 Spec: Command Mode + Material Passport

Do not start until Tier 3 acceptance (`08_TASKS.md`) is green. This doc fixes the shapes now so work can split cleanly later.

## A. Material Passport

`POST /api/passport` — body: `{ o2_percent, pressure_kpa, airflow_cm_s, gravity_g }` (conditions only; no material).

```ts
interface PassportEntry {
  material: MaterialId; label: string; fuel_type: "solid" | "droplet" | "gas";
  risk_index: number; grade: "A"|"B"|"C"|"D"|"E"|"F";     // from meta.grade_bands (I-08)
  spread_rate_mm_s: number; extinction_probability: number; flame_temp_k: number | null;
  matching_runs: number;
}
interface Passport { conditions: Omit<Scenario,"material">; entries: PassportEntry[]; data_source: DataSource; }
```

- One batch through `predict_batch` (I-16), all materials in `meta.materials`, sorted by material label.
- Grade rule: first band where `risk_index < max_risk` (bands in `04_MODEL_SPEC.md` §1). Server-side only.
- Depends on `{o2, pressure, airflow, gravity}` — debounce 300 ms like predict. Card click opens a detail drawer: the entry's numbers, a mini heatmap link (sets the material), and the nearest 3 runs (reuse `/api/runs` filter client-side).
- Cards for fuel types with no applicable ventilated-solid semantics (droplet/gas) carry a "different fuel class" tag (R-05).
- `matching_runs == 0` → grade shown with a hatched border and "extrapolated" tag. Never show a confident grade without it.

## B. Command Mode

A 90-second scripted-but-data-driven fire event. **The simulation engine is a pure, deterministic TypeScript module (`frontend/src/sim/engine.ts`)**
that takes the scenario's predicted values and action choices and returns the timeline. It is unit-testable without UI.
The only network calls are `POST /api/predict` (re-predict after an action changes conditions) and `POST /api/advise`.

### Engine

- Time step 0.5 s sim-time, rendered at 1 s per real second (no speed-ups in the demo; a `?fast=1` dev flag gives 4×).
- State: `t`, `scenario_eff` (effective o2, airflow, pressure after actions), `spread_mm_s`, `burned_area_cm2`, `extinction_p`, `status: running|extinguished|contained|failed`.
- `burned_area_cm2` rises as `∫ π·(r)²` style growth using `spread_mm_s` (spherical in 0g, i.e. area ∝ (spread·t)² ×k): define `k` in the module with a comment; the exact value is cosmetic but fixed.
- Each tick: with probability `extinction_p × dt / τ` (τ = 8 s, seeded RNG, seed from scenario hash) the flame goes out. Seeded → the same actions give the same outcome (reproducible demo, I-13).
- "Failed" = burned area exceeds `FAIL_AREA_CM2` (config constant) or t = 90 without containment; "contained" = extinguished or spread < 0.05 for 5 s.
- Decision points: **t = 10, 30, 60 s**. At each, simulation pauses (or slows to 0.2×; pick pause), 3 action cards shown, 10 s to choose (auto-picks "no action" on timeout and says so).

### Action catalogue (ids fixed; choose 3 per decision point, may repeat across points if still applicable)

| id | label | effect on `scenario_eff` | other |
|---|---|---|---|
| `vent_off` | Shut off ventilation | `airflow_cm_s → 0` (re-predict) | crew-comfort cost: −0 score; in 0g this starves the flame |
| `co2_extinguisher` | Deploy CO₂ extinguisher | `o2_percent −= 6` for 20 s, then recovers +1/s; `extinction_p += 0.25` (cap 1) during the window | uses the single extinguisher charge (can't repeat) |
| `isolate_evacuate` | Isolate module & evacuate | none on flame; stops damage to crew; sets `status=contained_isolated` | ends sim; scores highest on safety, lowest on asset-saving |
| `lower_o2` | Lower O₂ supply | `o2_percent −= 3` every 5 s down to 16 (re-predict) | slow, effective if started early |
| `vent_max` | Max ventilation (decoy) | `airflow_cm_s → 50` | in 0g can blow the flame off *or* feed it: the model decides |
| `wait` | Monitor | none | |

Effects are applied to the **scenario passed to `/api/predict`**; the response, not hand-written numbers, drives spread and extinction.
Every action's real-world plausibility is the team's judgment call — label it "simulation" in the UI (I-27).

### `POST /api/advise`

```ts
// body
{ scenario: Scenario; t_s: number; state: { spread_rate_mm_s: number; extinction_probability: number; risk_index: number };
  options: string[] /* action ids offered */ }
// response
{ recommended_action_id: string;            // ∈ options
  justification: string;                     // one line, ≤ 25 words
  cited_run_ids: string[];                   // ⊆ retrieved (I-11)
  generated_by: "llm" | "template"; data_source: DataSource }
```

Server evaluates each option's modified scenario via `predict_batch`, then recommends the option with the lowest resulting `risk_index`
(isolate_evacuate = a fixed score favouring safety if risk is high). **The recommendation is computed by the model, not the LLM**; the LLM only writes the justification
from retrieved runs. If LLM fails → template justification. Recommendation must always be one of `options`.

### Debrief card

Outcome (contained / failed / evacuated), time to containment, burned area, score, "what the data suggests would have worked better":
re-run the engine headlessly with the other action choices (same seed) and report the best alternative path — computed, not LLM-invented; LLM may rephrase it, citing runs.

Score (0–1000, formula documented in a UI tooltip): `score = 1000 − a·burned_area_cm2 − b·time_to_containment_s − c·[evacuated]`, floored at 0, with `a, b, c` defined once in `sim/config.ts`.
Required properties (unit-test them): less area ⇒ higher score; faster containment ⇒ higher score; an evacuation scores strictly higher than a failed outcome.

### Command-mode UI rules

- IGNITE button disabled until `prediction.status == ready`. Pressing it freezes the scenario (inputs locked, shown as "scenario locked").
- Flame size ∝ `burned_area`; KPIs tick live from engine state; timeline bar with decision-point markers.
- ABORT/RESET always available; leaving Command mode mid-run stops the engine cleanly (no timers leaked).
- No decisions are made with stale predictions: while a re-predict after an action is in flight, show "recalculating…" and hold the sim (max 2 s, then continue with last known + warning).

## Changelog
- 2026-11-14 initial.
