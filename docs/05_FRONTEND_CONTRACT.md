# 05 — Frontend Contract

Owner: Track B. Backend skims §2 and §4 so they know what traffic to expect. Invariants: I-01, I-05–I-08, I-10, I-19, I-21–I-23.

## 1. Stack & structure

React + Vite + TypeScript (strict) + Tailwind + Recharts + Framer Motion + Zustand. Node 20.

```
frontend/src/
  types.ts                 // mirrors 02_API_CONTRACT.md exactly (I-01). Hand-written, no codegen needed.
  api/client.ts            // fetch wrapper: base "/api", AbortController, error-envelope parsing, retry on 503
  store/useStore.ts        // the ONE Zustand store (§2)
  hooks/                   // useDebouncedEffect, usePanelData
  components/panels/       // one file per panel (§5), each wrapped in <PanelShell>
  components/common/       // PanelShell (title, skeleton, error, empty), Badge, Tooltip, NumberTicker, ErrorBoundary
  lib/format.ts            // all number formatting (§6) — no inline toFixed in components
  lib/survival.ts          // survivalProbability(p) = 1 - p   (I-05, the only place)
  lib/shapText.ts          // plain-language sentences (§8)
  theme/tokens.css         // design tokens (§7)
vite.config.ts             // proxy "/api" → http://localhost:8000 (I-18)
```

Build with Vite's `base: "./"` and no CDN links (I-20). Fonts bundled via `@fontsource/*` (e.g. a mono like JetBrains Mono, and Inter/Rajdhani for labels).

## 2. State (single store)

```ts
interface AppState {
  // inputs (the scenario) — what the user controls
  material: MaterialId; o2_percent: number; pressure_kpa: number; airflow_cm_s: number; gravity_g: number;
  vehicle_id: string | null;           // null once user edits a slider after picking a preset ("Custom")
  mode: "explore" | "command";
  // server data, each with status
  meta:        Async<Meta>;
  prediction:  Async<Prediction>;      // keeps previous data while refetching (stale-while-revalidate)
  heatmap:     Async<Heatmap>;
  compare:     Async<Compare>;
  insights:    Async<InsightsResponse>;
  runs:        Async<RunsResponse>;
  selectedRunId: string | null;        // drives the explorer drawer
  // actions
  setScenario(patch: Partial<Scenario>): void;
  applyVehicle(id: string): void;      // sets o2/pressure/airflow/gravity from meta.vehicles[id]; keeps material
}
type Async<T> = { status: "idle" | "loading" | "ready" | "error"; data: T | null; error: ApiError["error"] | null; requestId: number };
```

Rules:
- Initial scenario comes from `meta` (ISS preset, first material) — never hard-coded numbers. Until `meta` loads, every panel shows skeletons.
- `setScenario` with a slider drag updates UI instantly (inputs are local-first) and schedules fetches (§3).
- Stale-response guard (I-19): every fetch increments that slice's `requestId`; on resolve, apply only if the id is still current. Abort the in-flight request on supersede.
- Errors never clear existing `data`; the panel shows the last data dimmed plus an inline error chip with Retry.

## 3. Which input triggers which call (I-23)

| Call | Depends on | Debounce | Notes |
|---|---|---|---|
| `GET /api/meta` | — | once at load | retry 3× with backoff if the backend isn't up; show "Connecting to mission server…" |
| `GET /api/runs` | — | once at load (+ refetch not needed; filtering is client-side) | |
| `POST /api/predict` | all 5 inputs | 300 ms | |
| `POST /api/heatmap` | material, pressure_kpa, gravity_g | 300 ms | O₂/airflow moves only the crosshair |
| `POST /api/compare` | material, o2, pressure, airflow | 300 ms | gravity does not refetch it |
| `POST /api/insights` | all 5 inputs | 800 ms | shows "updating…" shimmer; old cards stay until new ones arrive |
| `POST /api/ask` | on submit only | none | one at a time; disable button while pending |

On 503 `MODEL_NOT_READY`: banner "Model warming up…", retry every 2 s up to 60 s, then error state.

## 4. Panels (Explore mode) & required states

Every panel is `<PanelShell>`-wrapped, has an `ErrorBoundary` (I-22), and implements all four states:

| State | Appearance |
|---|---|
| loading (no data yet) | skeleton matching final layout (no spinners alone) |
| refetching (has data) | data stays, subtle top-edge progress line; numbers tween (≤ 400 ms) |
| error | inline message from `error.message`, Retry button, last data dimmed if any |
| empty | explicit message (e.g. "No runs match these filters") with a clear-filters action |

| # | Panel | Source | Key behaviours |
|---|---|---|---|
| 1 | Mission Setup bar | meta | preset dropdown → `applyVehicle`; material dropdown from `meta.materials`; sliders O₂/pressure/airflow bound to `meta.ranges`; shows "Custom" after manual edits |
| 2 | Gravity slider + flame | meta.gravity_marks | full width; ticks labelled 0g / 0.17g Moon / 0.38g Mars / 1g Earth; step 0.01; marks are clickable snap points; shaded "interpolated — sparse data" region for 0.05 < g < 0.95 (I-21); flame (§9) |
| 3 | KPI tiles ×5 | prediction | Spread rate (+ CI range and "widened" tag), Risk Index gauge (band color), Flame Survives? (`survivalProbability`), Time to Critical (`null` → "No escalation"), Matching NASA Runs (0 → warning tint "extrapolating"). Info tooltip on Risk Index shows the formula from `meta.model.weights` |
| 4 | Danger Zone heatmap | heatmap | custom SVG/canvas (Recharts has no heatmap). Cells colored by band; crosshair at (o2, airflow) of current scenario, positioned by interpolating the axis arrays; "SAFE ZONE" label drawn over the largest connected `low` region (centroid of low-band cells; hide label if none); hover tooltip = `risk` value + cell O₂/airflow; click a cell sets o2/airflow (nice-to-have) |
| 5 | Earth vs. Space | compare | grouped bars: spread rate, flame temp, extinction probability. Three small-multiple charts (different units!) — do **not** put K and mm/s on one axis |
| 6 | SHAP panel | prediction.shap | horizontal diverging bars (red = raises risk, cyan = lowers); plain-language rows (§8); empty `shap` → "Explanation unavailable" state |
| 7 | Experiment Explorer | runs | scatter O₂ (x) vs spread (y), color = experiment, shape = gravity class (0g circle, partial g diamond, 1g triangle); sortable/filterable table (material, experiment, gravity range, O₂ range); row click → drawer with all fields and `source_note`; current scenario drawn as a highlighted marker; nulls rendered "—" and excluded from the scatter (count shown: "k runs hidden: missing values") |
| 8 | AI Insight Feed + Ask the Fire Lab | insights, ask | 3–5 cards, each with cited run chips (click → opens that run's drawer); `generated_by` badge ("AI" / "Template"); in mock mode every card shows MOCK; Ask input with 500-char limit, example question chips |
| 9 | Material Passport (Tier 4) | passport | see `06_TIER4_SPEC.md` |

Header: title "FIRE COMMAND: ZERO-G", subtitle, **data source badge** (MOCK DATA amber / NASA DATA cyan) from `meta.data_source` (I-09), mode toggle `[EXPLORE | COMMAND]`, About button (modal §10), small footer with the I-27 disclaimer. If `meta.model.stub` → "STUB" tag.

## 5. Interactions that are easy to get wrong

- Gravity slider drag is high-frequency: update the flame animation immediately from local state; debounce the network.
- Preset dropdown is `applyVehicle` = one store update → one debounced fetch (not four).
- Switching material triggers all four fetches; show skeleton shimmer only on panels with no data, dimming on others.
- Clicking a cited chip while on the Insight feed opens the drawer without losing scroll position.
- Heatmap crosshair uses the axis arrays from the response, not assumptions about `linspace`.

## 6. Number formatting (`lib/format.ts`, only place that formats)

| Value | Format | Example |
|---|---|---|
| spread rate | 2 dp + " mm/s" | `0.82 mm/s`; CI `0.51–1.24` |
| flame temp | integer + " K" | `1385 K` |
| probability | integer % | `69%` |
| risk | integer, `/100` in gauge | `36` |
| time to critical | `<60 s` → "47 s"; `<3600` → "2 min 2 s"; null → "No escalation" |
| gravity | 2 dp + "g", 0 → "0 g (microgravity)" | `0.17 g` |
| numbers in KPIs | monospace, tabular-nums, tween via `NumberTicker` (≤ 400 ms) | |

## 7. Design tokens (`theme/tokens.css`) — fixed so both people's screens agree

| token | hex | use |
|---|---|---|
| `--bg` | `#070B14` | page background (near-black navy), with subtle 32px grid lines at 4% white |
| `--panel` | `#0D1424` | panel fill |
| `--panel-border` | `#1F2A44` | 1px borders; corner-tick accents optional |
| `--text` | `#E6ECF5` | primary text |
| `--text-dim` | `#8A97B1` | labels (small, uppercase, letter-spacing 0.12em) |
| `--fire` | `#FF9A1F` | flame / amber highlights / "elevated" |
| `--fire-hot` | `#FF6A1A` | "high" |
| `--danger` | `#FF3B3B` | "critical" |
| `--cool` | `#3DD9FF` | "low" / safe / NASA DATA |
| `--mock` | `#FFC83D` | MOCK badge |

Band → color: `low`=cool, `elevated`=fire, `high`=fire-hot, `critical`=danger. **Colour is never the only signal** (colour-blind and projector safety):
always pair with the band name/label text and the number. Minimum text contrast 4.5:1 on `--panel`. Respect `prefers-reduced-motion` (flame static; tweens off).
Optimise layout for 1440×900; must remain usable at 1280 and not break at 1024 (single column).

## 8. Plain-language SHAP sentences (`lib/shapText.ts`)

Built from `{feature, contribution}` and the current scenario. Format: `"<Phrase> is <increasing|decreasing> risk by <±N>"`, N = rounded points.

| feature | phrase rule |
|---|---|
| `o2_percent` | `o2 ≥ 28` "High oxygen (X%)"; `o2 ≤ 19` "Low oxygen (X%)"; else "Oxygen (X%)" |
| `pressure_kpa` | `≥ 90` "Near-sea-level pressure"; `≤ 65` "Reduced pressure"; else "Cabin pressure (X kPa)" |
| `airflow_cm_s` | `≤ 3` "Very low airflow"; `≥ 30` "Strong airflow"; else "Moderate airflow (X cm/s)" |
| `gravity_g` | `0` "Microgravity"; `≥ 0.95` "Earth gravity"; else "Partial gravity (X g)" |
| `material` | "Material (`label`)" |

Contributions with |value| < 0.5 are grouped as "Other factors". Max 5 rows.

## 9. Flame component (`<Flame gravity intensity />`)

Props: `gravity_g` (0–1), `intensity` (0–1, from risk/100 or sim state), `size`. Pure SVG + Framer Motion.
Morph: at g=0 a dim blue-ish sphere (`#4AA8FF`→`#2D6BFF` radial, soft glow, slow pulse); toward g=1 a bright orange teardrop elongated upward
(`#FFD27A` core → `#FF9A1F` → `#FF4B1A` edge, flicker). Interpolate shape parameters continuously, not by switching images.
Must run at 60 fps while dragging the slider (animate transforms/path-morph with `useMotionValue`; no React re-render per frame).
Reduced-motion: static render. Used by the gravity panel and Command Mode (intensity grows).

## 10. About-the-Data modal (content spec; Track C writes copy)

Sections: (1) Why microgravity flames differ — no buoyancy, diffusion-driven, spherical/dimmer/cooler, soot and extinction behave differently;
(2) The experiments — BASS/BASS-II (solid fuel burning), FLEX/FLEX-2 (droplet combustion), Saffire (large-scale spacecraft fire in Cygnus),
ACME (gas-jet flames), "Ground" = 1g reference; (3) The data — source badge state, number of runs, link to PSI, retrieval date;
(4) The model — what it is, `meta.model.metrics`, the risk formula; (5) **Limitations** — small and uneven data, mixing fuel types (R-05), sparse partial-gravity coverage,
mock-trained model when MOCK, risk index is a relative score not a probability of loss, not for operational use (I-27). Keep it to one scroll.

## 11. Frontend test checklist (manual is fine; automated where cheap)

- Kill backend mid-session → every panel shows error + last data; page still interactive; restart backend → Retry works.
- Set `STUB_MODE=1`, run, set `STUB_MODE=0`: no UI change needed.
- Drag gravity slider rapidly 5 s → network tab shows ≤ ~3 predict calls per second, no out-of-order updates (I-19).
- `meta.data_source` mock/nasa flips the badge.
- Empty `shap`, `matching_runs: 0`, `time_to_critical_s: null`, `ci_widened: true`: each renders sensibly (use fixtures).
- Browser offline (devtools) → app loads from local assets, shows error states only for API calls.

## Changelog
- 2026-11-14 initial.
