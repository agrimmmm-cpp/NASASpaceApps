// Real-time Command Mode game (06_TIER4_SPEC §B, extended). Pure and deterministic given the same inputs:
// no React, no network, no Date/Math.random (seeded RNG). How fast a flame grows and how likely it is to go out on its
// own come from the model through `predict` (prefetched /api/predict results). Everything else — spreading to racks,
// extinguisher knock-down, charge, time limit, scoring — is a GAME RULE from GAME below, labelled as such in the UI.
import type { Scenario } from "../types";
import { keyOf, quantize, type Limits, type Pred, type Predict } from "./engine";

export type Difficulty = "easy" | "normal" | "hard";
export type GameStatus = "running" | "extinguished" | "evacuated" | "failed";

export const GAME = {
  DT: 0.1,                 // simulation step (s)
  DURATION_S: 120,         // fires still burning at 2:00 = module lost
  START_AREA: 0.6,         // cm² at ignition
  GROW_MM_PER_RATE: 5,     // flame-front radius growth per second = model rate × this (mm)
  KNOCK_CM2_S: 30,         // CO₂ on target removes this much burning area per second
  IGNITION_S: 15,           // a new fire can't go out by itself for this long
  TAU_S: 90,               // self-extinction hazard per second = model extinction probability / TAU
  O2_RAMP_PER_S: 0.6,      // O₂ supply valve: points per second
  O2_LOW: 16,              // valve target when lowering
  SPREAD_EVERY_S: 1,       // spread roll interval
  /** Score: fire out = 1000 − damage − 3×seconds (≥ 350); evacuated = 300 − damage/4 (150…300); lost = up to 100. */
  difficulty: {
    easy:   { charge: 18, grow: 0.8, spreadArea: 60, spreadChance: 0.05, failDamage: 900, hints: true,  label: "Cadet" },
    normal: { charge: 15, grow: 1.0, spreadArea: 45, spreadChance: 0.07, failDamage: 700, hints: false, label: "Commander" },
    hard:   { charge: 10, grow: 1.2, spreadArea: 35, spreadChance: 0.1,   failDamage: 550, hints: false, label: "Veteran" },
  } as const,
};

/** Where fires can burn: 0 = the first (floating) fire; 1… = racks the fire can spread to. Shared with the 3D view. */
export const ANCHORS: [number, number, number][] = [
  [0.45, -0.15, -1.3],  // floating first fire
  [-1.75, 0.1, -0.6],   // left rack
  [1.75, -0.4, -1.9],   // right rack
  [0.3, 1.65, -2.4],    // ceiling rack
  [-0.5, -1.65, -2.9],  // floor rack
  [-1.75, 0.6, -3.7],   // left rack, far
  [1.75, 0.7, -4.2],    // right rack, far
];

export interface Fire { id: number; anchor: number; area: number; peak: number; out: boolean; bornAt: number }
export interface GameEvent { t: number; text: string; tone?: "good" | "bad" | "info" }
export interface GameState {
  t: number; status: GameStatus; endedAt: number | null;
  base: Scenario; lim: Limits; diff: Difficulty;
  o2Set: number; lowering: boolean; fansOn: boolean;
  equipped: boolean; charge: number;
  fires: Fire[]; damage: number; nextSpread: number; rng: number;
  pred: Pred; missing: boolean; sprayedS: number;
  events: GameEvent[];
}
export interface GameInput { spraying: boolean; target: number | null }

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rand(state: number): [number, number] {
  const t = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}
const round = (x: number) => Math.round(x * 1000) / 1000;

export function effectiveScenario(s: Pick<GameState, "base" | "lim" | "o2Set" | "fansOn">): Scenario {
  return quantize({ ...s.base, o2_percent: s.o2Set, airflow_cm_s: s.fansOn ? s.base.airflow_cm_s : 0 }, s.lim);
}

/** Scenarios the game can reach (for prefetching): O₂ from the base down to the valve target, fans on/off. */
export function gameReachable(base: Scenario, lim: Limits): Scenario[] {
  const out = new Map<string, Scenario>();
  const lo = Math.min(base.o2_percent, GAME.O2_LOW);
  for (let o = base.o2_percent; o >= lo - 1e-9; o -= lim.o2Step)
    for (const a of [base.airflow_cm_s, 0]) { const q = quantize({ ...base, o2_percent: o, airflow_cm_s: a }, lim); out.set(keyOf(q), q); }
  return [...out.values()];
}

export function newGame(base: Scenario, pred0: Pred, lim: Limits, diff: Difficulty): GameState {
  return {
    t: 0, status: "running", endedAt: null, base, lim, diff,
    o2Set: base.o2_percent, lowering: false, fansOn: true, equipped: false, charge: GAME.difficulty[diff].charge,
    fires: [{ id: 0, anchor: 0, area: GAME.START_AREA, peak: GAME.START_AREA, out: false, bornAt: 0 }],
    damage: GAME.START_AREA, nextSpread: GAME.SPREAD_EVERY_S, rng: hash(keyOf(quantize(base, lim)) + diff),
    pred: pred0, missing: false, sprayedS: 0, events: [{ t: 0, text: "Fire alarm! Fire in the module.", tone: "bad" }],
  };
}

// ---- player actions (instant) ----
const log = (s: GameState, text: string, tone?: GameEvent["tone"]) => ({ ...s, events: [{ t: s.t, text, tone }, ...s.events].slice(0, 6) });
export function grabExtinguisher(s: GameState): GameState {
  return s.equipped || s.status !== "running" ? s : log({ ...s, equipped: true }, "Extinguisher in hand — hold the mouse on the flames to spray.", "info");
}
export function toggleFans(s: GameState): GameState {
  if (s.status !== "running") return s;
  return log({ ...s, fansOn: !s.fansOn }, s.fansOn ? "Cabin fans OFF." : "Cabin fans ON.", "info");
}
export function toggleO2(s: GameState): GameState {
  if (s.status !== "running") return s;
  return log({ ...s, lowering: !s.lowering }, s.lowering ? "O₂ supply restored." : `Lowering O₂ supply towards ${GAME.O2_LOW} %.`, "info");
}
export function evacuate(s: GameState): GameState {
  if (s.status !== "running") return s;
  return log({ ...s, status: "evacuated", endedAt: s.t }, "Crew evacuated. Module sealed.", "bad");
}

export const alive = (s: GameState) => s.fires.filter((f) => !f.out);

/** One DT step. Pure. */
export function step(s0: GameState, input: GameInput, predict: Predict): GameState {
  if (s0.status !== "running") return s0;
  const D = GAME.difficulty[s0.diff];
  const dt = GAME.DT;
  let s: GameState = { ...s0, t: round(s0.t + dt), fires: s0.fires.map((f) => ({ ...f })) };
  // valve
  const top = s.base.o2_percent, low = Math.min(top, GAME.O2_LOW);
  s.o2Set = s.lowering ? Math.max(low, s.o2Set - GAME.O2_RAMP_PER_S * dt) : Math.min(top, s.o2Set + GAME.O2_RAMP_PER_S * dt);
  // model values for the cabin right now
  const p = predict(effectiveScenario(s));
  s.missing = !p;
  s.pred = p ?? s.pred;
  // spray
  const spraying = input.spraying && s.equipped && s.charge > 0;
  if (spraying) { s.charge = Math.max(0, round(s.charge - dt)); s.sprayedS = round(s.sprayedS + dt); if (s.charge === 0) s = log(s, "Extinguisher empty!", "bad"); }
  let rng = s.rng;
  for (const f of s.fires) {
    if (f.out) continue;
    // growth: flame-front radius grows with the model's rate
    const r = Math.sqrt(f.area / Math.PI) + (s.pred.spread * GAME.GROW_MM_PER_RATE * D.grow * dt) / 10;
    f.area = Math.PI * r * r;
    if (spraying && input.target === f.id) f.area = Math.max(0, f.area - GAME.KNOCK_CM2_S * dt);
    f.peak = Math.max(f.peak, f.area);
    let u: number; [u, rng] = rand(rng);
    const selfOut = s.t - f.bornAt > GAME.IGNITION_S && u < (s.pred.extP * dt) / GAME.TAU_S;
    if (f.area < 0.3 || selfOut) { f.out = true; s = log(s, selfOut ? "A fire went out on its own." : "Fire knocked down!", "good"); }
  }
  // spreading to racks (game rule)
  if (s.t + 1e-9 >= s.nextSpread) {
    s.nextSpread = round(s.nextSpread + GAME.SPREAD_EVERY_S);
    const used = new Set(s.fires.map((f) => f.anchor));
    for (let n = s.fires.filter((x) => !x.out && x.area >= D.spreadArea).length; n > 0; n--) {
      let u: number; [u, rng] = rand(rng);
      const free = ANCHORS.map((_, i) => i).filter((i) => !used.has(i));
      if (free.length && u < D.spreadChance) {
        const [k, r2] = rand(rng); rng = r2;
        const anchor = free[Math.floor(k * Math.min(free.length, 2))]; // usually the nearest free rack
        used.add(anchor);
        s.fires.push({ id: s.fires.length, anchor, area: GAME.START_AREA * 3, peak: GAME.START_AREA * 3, out: false, bornAt: s.t });
        s = log(s, "The fire spread to a rack!", "bad");
      }
    }
  }
  s.rng = rng;
  s.damage = s.fires.reduce((a, f) => a + f.peak, 0);
  // outcomes
  if (alive(s).length === 0) return { ...s, status: "extinguished", endedAt: s.t };
  if (s.damage >= D.failDamage || s.t >= GAME.DURATION_S) return log({ ...s, status: "failed", endedAt: s.t }, "Module lost.", "bad");
  return s;
}

export function gameScore(s: GameState): number {
  const t = s.endedAt ?? s.t;
  if (s.status === "extinguished") return Math.round(Math.max(350, 1000 - s.damage - 3 * t));
  if (s.status === "evacuated") return Math.round(Math.min(300, Math.max(150, 300 - s.damage / 4)));
  if (s.status === "failed") return Math.round(Math.min(100, (t / GAME.DURATION_S) * 100));
  return 0;
}

export const STATUS_LABEL: Record<GameStatus, string> = {
  running: "Fire in progress", extinguished: "Fire out", evacuated: "Crew evacuated", failed: "Module lost",
};
/** 0 contained … 3 critical, from damage vs. the loss limit (drives smoke, lights, HUD). */
export function stage(s: GameState): 0 | 1 | 2 | 3 {
  const f = s.damage / GAME.difficulty[s.diff].failDamage;
  return f < 0.15 ? 0 : f < 0.4 ? 1 : f < 0.7 ? 2 : 3;
}
