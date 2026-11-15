// Ranks PSI investigations by relevance to a habitat's conditions (O₂, pressure, airflow, gravity from /api/meta
// vehicles or the current sliders). Transparent points with a reason for each, so the ranking can be explained.
import type { Investigation, Pillar } from "../content/investigations";

export interface HabitatConditions { label: string; o2_percent: number; pressure_kpa: number; airflow_cm_s: number; gravity_g: number }
export interface Ranked { inv: Investigation; score: number; reasons: string[] }

export function rankInvestigations(list: Investigation[], h: HabitatConditions, focus: Pillar | null, runsIn: (exp: string) => number): Ranked[] {
  const out = list
    .filter((inv) => !focus || inv.pillars.includes(focus))
    .map((inv, order) => {
      let score = 1;
      const reasons: string[] = [];
      const t = inv.tags;
      if (h.o2_percent > 21.5 && t.highO2) { score += 3; reasons.push(`${h.label} runs at ${h.o2_percent}% O₂; this tested the highest-oxygen flames`); }
      if (h.o2_percent > 21.5 && t.flammability) { score += 2; reasons.push(`More O₂ than Earth air (${h.o2_percent}%) makes materials more flammable`); }
      if (h.pressure_kpa < 95 && t.flammability) { score += 1; reasons.push(`Reduced pressure (${h.pressure_kpa} kPa) with raised O₂ changes flammability limits`); }
      if (h.gravity_g > 0.01 && h.gravity_g < 0.95 && t.partialG) { score += 3; reasons.push(`Partial gravity (${h.gravity_g} g): this mimics it with an electric field`); }
      if (h.airflow_cm_s > 0 && t.airflow) { score += 1.5; reasons.push(`Cabin airflow (${h.airflow_cm_s} cm/s) matters in microgravity; this tested flames in moving air`); }
      if (t.detection) { score += 1.5; reasons.push("Every crewed habitat needs early smoke detection"); }
      if (t.suppression) { score += 1.5; reasons.push("Shows how a fire can be put out"); }
      if (t.flammability && h.o2_percent <= 21.5) { score += 1; reasons.push("Material flammability is the first line of prevention"); }
      const n = inv.inApp ? runsIn(inv.inApp) : 0;
      if (n > 0) { score += 1; reasons.push(`${n} of its runs train this app's model`); }
      return { inv, score: score - order * 1e-3, reasons };
    });
  return out.sort((a, b) => b.score - a.score);
}
