// 05 §8 — plain-language SHAP rows, built from {feature, contribution} and the current scenario.
import type { MaterialInfo, Scenario, ShapItem } from "../types";

export interface ShapRow { text: string; label: string; contribution: number }

function phrase(f: ShapItem["feature"], s: Scenario, materials: MaterialInfo[]): string {
  switch (f) {
    case "o2_percent":
      return s.o2_percent >= 28 ? `High oxygen (${s.o2_percent}%)` : s.o2_percent <= 19 ? `Low oxygen (${s.o2_percent}%)` : `Oxygen (${s.o2_percent}%)`;
    case "pressure_kpa":
      return s.pressure_kpa >= 90 ? "Near-sea-level pressure" : s.pressure_kpa <= 65 ? "Reduced pressure" : `Cabin pressure (${s.pressure_kpa} kPa)`;
    case "airflow_cm_s":
      return s.airflow_cm_s <= 3 ? "Very low airflow" : s.airflow_cm_s >= 30 ? "Strong airflow" : `Moderate airflow (${s.airflow_cm_s} cm/s)`;
    case "gravity_g":
      return s.gravity_g === 0 ? "Microgravity" : s.gravity_g >= 0.95 ? "Earth gravity" : `Partial gravity (${s.gravity_g} g)`;
    case "material":
      return `Material (${materials.find((m) => m.id === s.material)?.label ?? s.material})`;
  }
}

export function shapRows(shap: ShapItem[], s: Scenario, materials: MaterialInfo[]): ShapRow[] {
  const big = shap.filter((x) => Math.abs(x.contribution) >= 0.5);
  const small = shap.filter((x) => Math.abs(x.contribution) < 0.5);
  const rows: ShapRow[] = big.slice(0, small.length ? 4 : 5).map((x) => ({
    contribution: x.contribution,
    label: phrase(x.feature, s, materials),
    text: `${phrase(x.feature, s, materials)} is ${x.contribution > 0 ? "increasing" : "decreasing"} risk by ${x.contribution > 0 ? "+" : "−"}${Math.round(Math.abs(x.contribution))}`,
  }));
  const rest = [...big.slice(rows.length), ...small].reduce((a, x) => a + x.contribution, 0);
  if (big.length > rows.length || small.length) {
    rows.push({ contribution: rest, label: "Everything else", text: `Other factors ${rest >= 0 ? "+" : "−"}${Math.abs(rest).toFixed(1)}` });
  }
  return rows;
}
