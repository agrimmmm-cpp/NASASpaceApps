// Command Mode simulation engine (06_TIER4_SPEC §B). Pure and deterministic: no React, no network, no Date/Math.random.
// Flame behaviour (spread, extinction probability) comes from the model through an injected, synchronous `predict`
// lookup (the UI fills a cache from /api/predict). Same scenario + same choices => same outcome (seeded RNG, I-13).
import type { Scenario } from "../types";
import * as C from "./config";

export type ActionId = "vent_off" | "co2_extinguisher" | "isolate_evacuate" | "lower_o2" | "vent_max" | "wait";
export type Status = "running" | "extinguished" | "contained" | "failed" | "evacuated";
export interface Pred { spread: number; extP: number; risk?: number }
export type Predict = (sc: Scenario) => Pred | undefined;

export const ACTIONS: Record<ActionId, { label: string; icon: string; effect: string }> = {
  vent_off: { label: "Shut off ventilation", icon: "🌀", effect: "Airflow to 0. In microgravity this can starve the flame of fresh oxygen." },
  co2_extinguisher: { label: "Deploy CO₂ extinguisher", icon: "🧯", effect: "O₂ −6 points for 20 s and a higher chance it goes out. One charge only." },
  isolate_evacuate: { label: "Isolate module & evacuate", icon: "🚪", effect: "Seal the module and get the crew out. Ends the drill: safest for crew, the module is lost." },
  lower_o2: { label: "Lower O₂ supply", icon: "🫁", effect: "O₂ −3 points every 5 s down to 16 %. Slow, works best if started early." },
  vent_max: { label: "Max ventilation", icon: "💨", effect: "Airflow to the maximum. Might blow the flame out — or feed it. The model decides." },
  wait: { label: "Monitor", icon: "👁", effect: "Do nothing and keep watching." },
};

/** Slider limits from /api/meta ranges (nothing hardcoded). */
export interface Limits { o2Min: number; o2Max: number; o2Step: number; airMax: number; airStep: number }

export interface SimState {
  lim: Limits;
  t: number;
  base: Scenario;          // scenario at ignition (locked)
  scen: Scenario;          // effective scenario after actions
  o2Set: number;           // O₂ supply setpoint (lower_o2 ramps it)
  co2Deficit: number;      // temporary O₂ drop from the extinguisher
  co2Until: number | null; // end of the CO₂ window
  co2Used: boolean;
  lowering: boolean;
  pred: Pred;              // last known model values
  radiusMm: number;
  area: number;            // burned area, cm²
  lowFor: number;          // seconds spent below CONTAIN_SPREAD
  status: Status;
  endedAt: number | null;
  rng: number;
  choices: { t: number; id: ActionId }[];
  missing: boolean;        // true when this step had to reuse old model values
}

const snap = (v: number, st: number) => Math.round(Math.round(v / st) * st * 1000) / 1000;
/** Snap to the slider steps from meta, so the prediction cache stays small and every value is one a user could pick. */
export function quantize(sc: Scenario, lim: Limits): Scenario {
  return { ...sc, o2_percent: snap(sc.o2_percent, lim.o2Step), airflow_cm_s: snap(sc.airflow_cm_s, lim.airStep) };
}
export const keyOf = (q: Scenario) => `${q.material}|${q.o2_percent}|${q.pressure_kpa}|${q.airflow_cm_s}|${q.gravity_g}`;

/** Every scenario the drill can reach from `base` (prefetched once, so play and the replay need no waiting). */
export function reachable(base: Scenario, lim: Limits): Scenario[] {
  const lo = Math.max(lim.o2Min, Math.min(base.o2_percent, C.LOWER_O2_MIN) - C.CO2_O2_DROP);
  const out: Scenario[] = [];
  const airs = [...new Set([base.airflow_cm_s, 0, lim.airMax])];
  for (let o = snap(lo, lim.o2Step); o <= base.o2_percent + 1e-9; o = snap(o + lim.o2Step, lim.o2Step))
    for (const a of airs) out.push(quantize({ ...base, o2_percent: o, airflow_cm_s: a }, lim));
  return out;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** mulberry32: returns [value in [0,1), next state]. */
function rand(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

export function init(base: Scenario, pred0: Pred, lim: Limits): SimState {
  return {
    lim, t: 0, base, scen: { ...base }, o2Set: base.o2_percent, co2Deficit: 0, co2Until: null, co2Used: false, lowering: false,
    pred: pred0, radiusMm: 2, area: Math.PI * 0.2 * 0.2, lowFor: 0, status: "running", endedAt: null,
    rng: hash(keyOf(quantize(base, lim))), choices: [], missing: false,
  };
}

/** The three actions offered at a decision point (depends on what's already been used). */
export function optionsAt(s: SimState): ActionId[] {
  const airflowMove: ActionId = s.scen.airflow_cm_s > 0 ? "vent_off" : "vent_max";
  if (s.t < 20) return ["co2_extinguisher", airflowMove, "wait"];
  if (s.t < 45) return [s.co2Used ? (s.lowering ? airflowMove : "lower_o2") : "co2_extinguisher", s.lowering || s.co2Used ? airflowMove : "lower_o2", "isolate_evacuate"]
    .filter((v, i, a) => a.indexOf(v) === i).concat(["wait"]).slice(0, 3) as ActionId[];
  return ["isolate_evacuate", !s.co2Used ? "co2_extinguisher" : !s.lowering ? "lower_o2" : airflowMove, "wait"];
}

export const isDecisionTime = (t: number) => C.DECISION_TIMES.some((d) => Math.abs(d - t) < 1e-6);

export function applyAction(s: SimState, id: ActionId): SimState {
  const n: SimState = { ...s, scen: { ...s.scen }, choices: [...s.choices, { t: s.t, id }] };
  switch (id) {
    case "vent_off": n.scen.airflow_cm_s = 0; break;
    case "vent_max": n.scen.airflow_cm_s = n.lim.airMax; break;
    case "co2_extinguisher":
      if (!n.co2Used) { n.co2Used = true; n.co2Deficit = C.CO2_O2_DROP; n.co2Until = n.t + C.CO2_WINDOW_S; }
      break;
    case "lower_o2": n.lowering = true; break;
    case "isolate_evacuate": n.status = "evacuated"; n.endedAt = n.t; break;
    case "wait": break;
  }
  n.scen.o2_percent = Math.min(n.lim.o2Max, Math.max(n.lim.o2Min, n.o2Set - n.co2Deficit));
  return n;
}

/** One DT step. Pure: returns a new state. */
export function step(s: SimState, predict: Predict): SimState {
  if (s.status !== "running") return s;
  const n: SimState = { ...s, scen: { ...s.scen }, t: Math.round((s.t + C.DT) * 1000) / 1000 };
  // continuous action effects
  if (n.lowering) n.o2Set = Math.max(Math.min(C.LOWER_O2_MIN, n.o2Set), n.o2Set - C.LOWER_O2_PER_S * C.DT);
  const co2Active = n.co2Until !== null && n.t <= n.co2Until;
  if (!co2Active && n.co2Deficit > 0) n.co2Deficit = Math.max(0, n.co2Deficit - C.CO2_RECOVER_PER_S * C.DT);
  n.scen.o2_percent = Math.min(n.lim.o2Max, Math.max(n.lim.o2Min, n.o2Set - n.co2Deficit));
  // model values for the effective scenario (falls back to the last known while a re-predict is in flight)
  const p = predict(quantize(n.scen, n.lim));
  n.missing = !p;
  n.pred = p ?? s.pred;
  const hazard = (n.pred.extP * C.DT) / C.TAU_S + (co2Active ? (C.CO2_EXTRA_EXTINCTION * C.DT) / C.CO2_TAU_S : 0);
  // flame front growth and burned area
  n.radiusMm = s.radiusMm + n.pred.spread * C.DT * C.K_GROW;
  n.area = Math.PI * (n.radiusMm / 10) ** 2;
  // outcomes
  const [u, rng] = rand(s.rng);
  n.rng = rng;
  if (n.t > C.IGNITION_S && u < hazard) { n.status = "extinguished"; n.endedAt = n.t; return n; }
  n.lowFor = n.pred.spread < C.CONTAIN_SPREAD ? s.lowFor + C.DT : 0;
  if (n.lowFor >= C.CONTAIN_HOLD_S) { n.status = "contained"; n.endedAt = n.t; return n; }
  if (n.area >= C.FAIL_AREA_CM2) { n.status = "failed"; n.endedAt = n.t; return n; }
  if (n.t >= C.DURATION_S) { n.status = "failed"; n.endedAt = n.t; }
  return n;
}

export function score(s: Pick<SimState, "area" | "endedAt" | "status">): number {
  const secs = s.endedAt ?? C.DURATION_S;
  const raw = 1000 - C.SCORE_A * Math.min(s.area, C.FAIL_AREA_CM2) - C.SCORE_B * secs
    - (s.status === "evacuated" ? C.SCORE_C : 0) - (s.status === "failed" ? C.SCORE_D : 0);
  return Math.max(0, Math.round(raw));
}

/** Run to the end without UI: at decision k use picks[k] (default "wait"). */
export function runHeadless(base: Scenario, pred0: Pred, lim: Limits, picks: ActionId[], predict: Predict): SimState {
  let s = init(base, pred0, lim);
  let k = 0;
  while (s.status === "running") {
    s = step(s, predict);
    if (s.status === "running" && isDecisionTime(s.t)) s = applyAction(s, picks[k++] ?? "wait");
  }
  return s;
}

/** Every possible choice path (≤ 27) replayed with the same seed; returns the best one and its picks. */
export function bestPath(base: Scenario, pred0: Pred, lim: Limits, predict: Predict): { picks: ActionId[]; state: SimState } {
  let best: { picks: ActionId[]; state: SimState } | null = null;
  const explore = (s: SimState, picks: ActionId[]) => {
    let cur = s;
    while (cur.status === "running") {
      cur = step(cur, predict);
      if (cur.status === "running" && isDecisionTime(cur.t)) {
        for (const id of optionsAt(cur)) explore(applyAction(cur, id), [...picks, id]);
        return;
      }
    }
    if (!best || score(cur) > score(best.state)) best = { picks, state: cur };
  };
  explore(init(base, pred0, lim), []);
  return best!;
}

export const outcomeLabel: Record<Status, string> = {
  running: "Fire in progress", extinguished: "Fire went out", contained: "Fire contained",
  failed: "Module lost", evacuated: "Crew evacuated",
};
