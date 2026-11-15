// Band → color (05 §7). Colors map by band NAME; band thresholds always come from meta.risk_bands (I-08).
import type { RiskBand } from "../types";

export const BAND_COLOR: Record<RiskBand, string> = {
  low: "var(--cool)",
  elevated: "var(--fire)",
  high: "var(--fire-hot)",
  critical: "var(--danger)",
};
export const BAND_LABEL: Record<RiskBand, string> = {
  low: "Low", elevated: "Elevated", high: "High", critical: "Critical",
};

/** Band for a risk value using meta.risk_bands ([min, max), last max inclusive). Used only to color heatmap cells. */
export function bandFor(risk: number, bands: { band: RiskBand; min: number; max: number }[]): RiskBand {
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (risk >= b.min && (risk < b.max || (i === bands.length - 1 && risk <= b.max))) return b.band;
  }
  return bands[bands.length - 1].band;
}

/** Plain-language zone names for non-experts (shown alongside the band, never instead of the number). */
export const PLAIN_BAND: Record<RiskBand, string> = { low: "Safe", elevated: "Caution", high: "Danger", critical: "Extreme" };
export const BAND_RANK: Record<RiskBand, number> = { low: 0, elevated: 1, high: 2, critical: 3 };
