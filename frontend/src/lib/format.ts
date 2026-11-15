// 05 §6 — the only place numbers are formatted. No inline toFixed in components.
const dash = "—";
const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export const fmtSpread = (v: number | null | undefined) => (ok(v) ? `${v.toFixed(2)} mm/s` : dash);
export const fmtCi = ([lo, hi]: [number, number]) => `${lo.toFixed(2)}–${hi.toFixed(2)}`;
export const fmtTemp = (v: number | null | undefined) => (ok(v) ? `${Math.round(v)} K` : dash);
export const fmtPct = (p: number | null | undefined) => (ok(p) ? `${Math.round(p * 100)}%` : dash);
export const fmtRisk = (v: number | null | undefined) => (ok(v) ? `${Math.round(v)}` : dash);
export const fmtNum = (v: number | null | undefined, dp = 1) => (ok(v) ? v.toFixed(dp) : dash);

export function fmtTtc(s: number | null | undefined): string {
  if (s === null || s === undefined) return "No escalation";
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return r ? `${m} min ${r} s` : `${m} min`;
}

export function fmtGravity(g: number | null | undefined): string {
  if (!ok(g)) return dash;
  return g === 0 ? "0 g (microgravity)" : `${g.toFixed(2)} g`;
}

/** Decimal places implied by a range step (e.g. 0.5 → 1, 0.01 → 2), so slider labels follow meta.ranges. */
export const dpForStep = (step: number) => Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));

/** Percentage number without the % sign (for KPI tiles that show the unit separately). */
export const fmtPctNum = (p: number) => `${Math.round(p * 100)}`;
