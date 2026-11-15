// "How sure are we?" — a plain-language reading of uncertainty the API already returns. It never changes a prediction
// or the risk (I-06); it only grades three things that are reported anyway:
//   evidence  = matching_runs (real runs near these conditions, 04_MODEL_SPEC §6)
//   precision = width of spread_rate_ci relative to the value (widened for partial gravity, I-21)
//   model     = held-out spread R² and extinction AUC from /api/meta
// The point thresholds below are a presentation rule, kept in one place so they are easy to review.
import type { Meta, Prediction, Run, RangeInfo } from "../types";

export type Level = "low" | "medium" | "high";
export interface Factor { key: "evidence" | "precision" | "model"; points: number; max: number }
export interface Confidence { level: Level; points: number; max: number; factors: Factor[]; relWidth: number }

export function confidence(p: Prediction, meta: Meta | null): Confidence {
  const n = p.matching_runs;
  const evidence = n >= 15 ? 3 : n >= 5 ? 2 : n >= 1 ? 1 : 0;
  const [lo, hi] = p.spread_rate_ci;
  const relWidth = (hi - lo) / Math.max(p.spread_rate_mm_s, 1e-6);
  const precision = Math.max(0, (relWidth < 0.25 ? 2 : relWidth < 0.6 ? 1 : 0) - (p.ci_widened ? 1 : 0));
  const m = meta?.model.metrics;
  const r2 = m?.spread_r2 ?? null, auc = m?.extinction_auc ?? null;
  const model = r2 !== null && auc !== null && r2 >= 0.6 && auc >= 0.8 ? 2 : (r2 ?? 0) >= 0.3 || (auc ?? 0) >= 0.7 ? 1 : 0;
  const points = evidence + precision + model;
  const max = 7;
  return {
    level: points >= 5 ? "high" : points >= 3 ? "medium" : "low", points, max, relWidth,
    factors: [{ key: "evidence", points: evidence, max: 3 }, { key: "precision", points: precision, max: 2 }, { key: "model", points: model, max: 2 }],
  };
}

/** The real experiment closest to the current conditions (same material), using the slider ranges to normalise. */
export function nearestRun(runs: Run[], sc: { material: string; o2_percent: number; pressure_kpa: number; airflow_cm_s: number; gravity_g: number },
  ranges: Record<"o2_percent" | "pressure_kpa" | "airflow_cm_s" | "gravity_g", RangeInfo>): Run | null {
  const span = (k: keyof typeof ranges) => Math.max(1e-9, ranges[k].max - ranges[k].min);
  let best: Run | null = null, bestD = Infinity;
  for (const r of runs) {
    if (r.material !== sc.material) continue;
    const d = ((r.o2_percent - sc.o2_percent) / span("o2_percent")) ** 2 + ((r.pressure_kpa - sc.pressure_kpa) / span("pressure_kpa")) ** 2
      + ((r.airflow_cm_s - sc.airflow_cm_s) / span("airflow_cm_s")) ** 2 + 2 * ((r.gravity_g - sc.gravity_g) / span("gravity_g")) ** 2;
    if (d < bestD || (d === bestD && best && r.run_id < best.run_id)) { best = r; bestD = d; }
  }
  return best;
}
