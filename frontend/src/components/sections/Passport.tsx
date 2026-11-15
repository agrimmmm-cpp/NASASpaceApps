// Section: Material Passport (06_TIER4_SPEC §A) — "which materials are safe to fly in this cabin?"
// Every material graded A–F for the current conditions in one /api/passport call (one predict_batch, I-16).
// Grades come from the server (I-08); we only sort and present. Honesty rules from the spec:
//   matching_runs == 0 → hatched border + "extrapolated" tag; droplet/gas next to solids → "different fuel class" (R-05).
import { useMemo, useState } from "react";
import { useStore } from "../../store/useStore";
import { SectionGlow } from "../common/Reveal";
import { PanelShell } from "../common/PanelShell";
import { fmtGravity, fmtPct, fmtTemp } from "../../lib/format";
import { survivalProbability } from "../../lib/survival";
import { rateLabel } from "../../lib/units";
import { outcomeText } from "./Experiments";
import type { Grade, Meta, PassportEntry, Run } from "../../types";

/** Show the passport only when it can actually compare: >= 3 materials and not all the same grade.
 *  (On the NASA FLEX data there are 2 droplet fuels with the same grade — a ranking would say nothing.) */
export function passportUseful(p: { entries: PassportEntry[] } | null | undefined): boolean {
  return !!p && p.entries.length >= 3 && new Set(p.entries.map((e) => e.grade)).size > 1;
}

export const GRADE_COLOR: Record<Grade, string> = {
  A: "#34E0A1", B: "#3DD9FF", C: "#FFC83D", D: "#FF9A1F", E: "#FF6A1A", F: "#FF3B3B",
};
const GRADE_WORD: Record<Grade, string> = {
  A: "Excellent", B: "Good", C: "Fair", D: "Poor", E: "Bad", F: "Fail",
};

/** 3 closest runs for this material to the cabin conditions (client-side over /api/runs, as the spec asks). */
function nearestRuns(runs: Run[], material: string, c: { o2_percent: number; pressure_kpa: number; airflow_cm_s: number; gravity_g: number }, meta: Meta) {
  const R = meta.ranges;
  const n = (k: keyof typeof R, v: number) => (v - R[k].min) / (R[k].max - R[k].min);
  return runs.filter((r) => r.material === material)
    .map((r) => ({ r, d: Math.hypot(n("o2_percent", r.o2_percent) - n("o2_percent", c.o2_percent), 0.7 * (n("pressure_kpa", r.pressure_kpa) - n("pressure_kpa", c.pressure_kpa)),
      n("airflow_cm_s", r.airflow_cm_s) - n("airflow_cm_s", c.airflow_cm_s), 1.4 * (n("gravity_g", r.gravity_g) - n("gravity_g", c.gravity_g))) }))
    .sort((a, b) => a.d - b.d || a.r.run_id.localeCompare(b.r.run_id)).slice(0, 3).map((x) => x.r);
}

function Card({ e, best, selected, mixed, rateUnit, onClick, open }: {
  e: PassportEntry; best: boolean; selected: boolean; mixed: boolean; rateUnit: string; onClick: () => void; open: boolean;
}) {
  const color = GRADE_COLOR[e.grade];
  const extrap = e.matching_runs === 0;
  return (
    <button onClick={onClick} aria-expanded={open}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 ${open ? "border-white/40 bg-white/[0.07]" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}
      style={extrap ? { backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 6px, transparent 6px 14px)", borderStyle: "dashed" } : undefined}>
      {best && <span className="num absolute right-0 top-0 rounded-bl-xl bg-[#34E0A1] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#03140D]">Safest here</span>}
      <div className="flex items-center gap-4">
        <span className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl"
          style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 2px ${color}` }}>
          <span className="font-space text-3xl font-bold leading-none" style={{ color }}>{e.grade}</span>
          <span className="num mt-0.5 text-[9px] uppercase tracking-wider" style={{ color }}>{GRADE_WORD[e.grade]}</span>
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{e.label}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="num rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wider text-dim">{e.fuel_type}</span>
            {selected && <span className="num rounded-md bg-cool/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cool">Selected</span>}
            {mixed && e.fuel_type !== "solid" && <span className="num rounded-md bg-[#B48CFF]/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#B48CFF]" title="Droplet and gas fuels behave differently from solid materials; compare like with like (R-05).">Different fuel class</span>}
            {extrap && <span className="num rounded-md bg-fire/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-fire" title="No similar experiment runs: this grade is an extrapolation.">Extrapolated</span>}
          </div>
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div className="h-full rounded-full" style={{ width: `${Math.max(3, e.risk_index)}%`, background: color }} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <div><dt className="text-dim">Risk</dt><dd className="num text-[15px] font-semibold text-white">{Math.round(e.risk_index)}<span className="text-[11px] text-dim">/100</span></dd></div>
        <div><dt className="text-dim">Keeps burning</dt><dd className="num text-[15px] font-semibold text-white">{fmtPct(survivalProbability(e.extinction_probability))}</dd></div>
        <div><dt className="text-dim">Rate</dt><dd className="num text-[15px] font-semibold text-white">{e.spread_rate_mm_s}<span className="ml-0.5 text-[10px] text-dim">{rateUnit}</span></dd></div>
      </dl>
    </button>
  );
}

export function Passport() {
  const s = useStore();
  const meta = s.meta.data;
  const [openId, setOpenId] = useState<string | null>(null);
  const vehicle = meta?.vehicles.find((v) => v.id === s.vehicle_id)?.label ?? "Custom cabin";
  const entries = useMemo(() => [...(s.passport.data?.entries ?? [])].sort((a, b) => a.risk_index - b.risk_index), [s.passport.data]);
  const mixed = new Set(entries.map((e) => e.fuel_type)).size > 1;
  const open = entries.find((e) => e.material === openId) ?? null;
  const c = s.passport.data?.conditions;
  if (s.passport.data && !passportUseful(s.passport.data)) return null;
  const safest = entries[0], riskiest = entries[entries.length - 1];

  return (
    <section id="passport" className="relative z-10 flex min-h-screen flex-col justify-center px-6 py-20 md:px-12">
      <SectionGlow colors={["#34E0A1", "#3DD9FF"]} />
      <div className="mx-auto w-full max-w-6xl">
        <span className="eyebrow text-[#34E0A1]">Material passport</span>
        <h2 className="mt-3 font-space text-4xl font-bold tracking-tight text-white md:text-5xl">Which materials are safe to fly?</h2>
        <p className="mt-3 max-w-2xl text-[17px] text-dim">Every material, graded A to F for a fire in this cabin. Change the cabin in the bar above and the grades update.</p>
        {c && (
          <div className="mt-5 flex flex-wrap gap-2 text-[13px]">
            {[vehicle, `${c.o2_percent}% O₂`, `${c.pressure_kpa} kPa`, `${c.airflow_cm_s} cm/s airflow`, fmtGravity(c.gravity_g)].map((x) => (
              <span key={x} className="num rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-white">{x}</span>
            ))}
          </div>
        )}

        {safest && riskiest && safest !== riskiest && (
          <p className="mt-5 text-[18px] leading-snug text-white">
            Safest to fly in this cabin: <b style={{ color: GRADE_COLOR[safest.grade] }}>{safest.label} ({safest.grade})</b>.{" "}
            Riskiest: <b style={{ color: GRADE_COLOR[riskiest.grade] }}>{riskiest.label} ({riskiest.grade})</b>.
          </p>
        )}

        <div className="mt-8">
          <PanelShell title="Fire-safety grades" subtitle="Safest first · click a card for details" state={s.passport} onRetry={() => s.retry("passport")}
            isEmpty={(p) => p.entries.length === 0} empty={<p className="text-sm text-dim">No materials can be graded with the loaded data.</p>}
            skeleton={<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}</div>}>
            {() => (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {entries.map((e, i) => (
                    <Card key={e.material} e={e} best={i === 0 && entries.length > 1} selected={e.material === s.material} mixed={mixed}
                      rateUnit={rateLabel(meta?.data_source, e.fuel_type).unit} open={openId === e.material}
                      onClick={() => setOpenId(openId === e.material ? null : e.material)} />
                  ))}
                </div>

                {open && meta && c && (() => {
                  const rate = rateLabel(meta.data_source, open.fuel_type);
                  const runs = nearestRuns(s.runs.data?.runs ?? [], open.material, c, meta);
                  return (
                    <div className="mt-5 rounded-2xl border border-white/15 bg-black/30 p-5 [animation:fadein_200ms_ease]">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="font-space text-xl font-bold text-white">{open.label} <span className="text-dim">· grade</span> <span style={{ color: GRADE_COLOR[open.grade] }}>{open.grade}</span></p>
                          <p className="mt-1 text-[14px] text-dim">
                            Risk <b className="text-white">{open.risk_index}</b>/100 · {rate.name} <b className="text-white">{open.spread_rate_mm_s} {rate.unit}</b> ·
                            keeps burning <b className="text-white">{fmtPct(survivalProbability(open.extinction_probability))}</b>
                            {open.flame_temp_k !== null && <> · flame <b className="text-white">{fmtTemp(open.flame_temp_k)}</b></>} ·
                            {open.matching_runs === 0 ? <b className="text-fire"> no similar runs (extrapolated)</b> : <> <b className="text-white">{open.matching_runs}</b> similar runs</>}
                          </p>
                        </div>
                        {open.material !== s.material && (
                          <button onClick={() => { s.setScenario({ material: open.material }); }}
                            className="num shrink-0 rounded-full border border-cool/60 px-4 py-1.5 text-[12px] font-semibold uppercase tracking-wider text-cool hover:bg-cool/10">
                            Use this material
                          </button>
                        )}
                      </div>
                      <p className="label mt-4">Nearest real runs for {open.label}</p>
                      {runs.length ? (
                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                          {runs.map((r) => (
                            <button key={r.run_id} onClick={() => s.selectRun(r.run_id)}
                              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:border-cool/40">
                              <span className="num block text-[13px] font-semibold text-cool">{r.run_id}</span>
                              <span className="block text-[12px] text-white">{outcomeText(r)}</span>
                              <span className="num block text-[11px] text-dim">{r.o2_percent}% O₂ · {r.pressure_kpa} kPa · {r.airflow_cm_s} cm/s · {r.gravity_g} g</span>
                            </button>
                          ))}
                        </div>
                      ) : <p className="mt-2 text-[13px] text-dim">No runs for this material in the loaded data.</p>}
                    </div>
                  );
                })()}

                {meta && (
                  <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-dim">
                    <span className="label">Grade scale</span>
                    {meta.grade_bands.map((g, i) => (
                      <span key={g.grade} className="flex items-center gap-1.5">
                        <b style={{ color: GRADE_COLOR[g.grade] }}>{g.grade}</b>
                        <span className="num">{i === meta.grade_bands.length - 1 ? `≥ ${meta.grade_bands[i - 1]?.max_risk ?? 0}` : `< ${g.max_risk}`}</span>
                      </span>
                    ))}
                    <span>· risk out of 100 · dashed card = extrapolated</span>
                  </div>
                )}
              </>
            )}
          </PanelShell>
        </div>
      </div>
    </section>
  );
}
