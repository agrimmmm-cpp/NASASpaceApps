// Section 3: risk dial + four stat cards. Every number is what /api/predict returned (I-06).
import type { ReactNode } from "react";
import { useStore } from "../../store/useStore";
import { BAND_COLOR, BAND_LABEL } from "../../lib/bands";
import { fmtCi, fmtNum, fmtPctNum, fmtRisk, fmtTtc } from "../../lib/format";
import { survivalProbability } from "../../lib/survival";
import { PanelShell } from "../common/PanelShell";
import { NumberTicker } from "../common/NumberTicker";
import type { Meta, Prediction } from "../../types";

function Dial({ p, meta }: { p: Prediction; meta: Meta | null }) {
  const R = 130, C = 2 * Math.PI * R;
  const color = BAND_COLOR[p.risk_band];
  const w = meta?.model.weights;
  return (
    <div className="relative mx-auto flex h-80 w-80 items-center justify-center"
      title={w ? `risk = 100 × (${w.spread} × spread ÷ ${meta?.model.spread_ref_mm_s} mm/s + ${w.survival} × chance the flame survives)` : undefined}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 320 320" aria-hidden>
        <circle cx="160" cy="160" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
        {meta?.risk_bands.slice(1).map((b) => {
          const a = (b.min / 100) * 2 * Math.PI;
          return <line key={b.band} x1={160 + 112 * Math.cos(a)} y1={160 + 112 * Math.sin(a)} x2={160 + 120 * Math.cos(a)} y2={160 + 120 * Math.sin(a)}
            stroke={BAND_COLOR[b.band]} strokeWidth="2" />;
        })}
        <circle cx="160" cy="160" r={R} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - p.risk_index / 100)} style={{ transition: "stroke-dashoffset 400ms ease, stroke 400ms" }} />
      </svg>
      <div className="flex flex-col items-center">
        <span className="label">Risk index</span>
        <span className="num text-8xl font-bold leading-none" style={{ color }}><NumberTicker value={p.risk_index} format={fmtRisk} /></span>
        <span className="num mt-4 rounded-full border px-4 py-1.5 text-[13px] font-semibold uppercase tracking-wider"
          style={{ color, borderColor: color, background: "rgba(255,255,255,0.03)" }}>
          / 100 · {BAND_LABEL[p.risk_band]}
        </span>
      </div>
    </div>
  );
}

function Card({ label, value, unit, foot, color = "#fff", tint, compact }: { label: string; value: ReactNode; unit?: string; foot: ReactNode; color?: string; tint?: boolean; compact?: boolean }) {
  return (
    <div className={`glass flex flex-col justify-between rounded-2xl p-6 md:p-7 ${tint ? "border-fire/50" : ""}`}>
      <span className="label">{label}</span>
      <div className={`num my-4 whitespace-nowrap font-bold tracking-tight ${compact ? "text-4xl md:text-5xl" : "text-6xl md:text-7xl"}`} style={{ color }}>
        {value}{unit && <span className="ml-2 text-xl font-normal text-dim md:text-2xl">{unit}</span>}
      </div>
      <div className="border-t border-white/10 pt-3 text-[13px] text-dim">{foot}</div>
    </div>
  );
}

export function Status() {
  const state = useStore((s) => s.prediction);
  const meta = useStore((s) => s.meta.data);
  const retry = useStore((s) => s.retry);
  return (
    <section id="status" className="relative z-10 flex min-h-screen flex-col justify-center px-6 py-24 md:px-12">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-12 text-center">
          <span className="eyebrow text-[#FFB873]">Risk</span>
          <h2 className="mt-3 font-space text-4xl font-bold tracking-tight text-white md:text-5xl">Current fire status</h2>
          <p className="mx-auto mt-3 max-w-xl text-[17px] text-dim">
            Predicted from {meta ? `${meta.n_runs} ` : ""}{meta?.data_source === "nasa" ? "NASA experiment runs" : "mock experiment runs"}.
          </p>
        </div>
        <PanelShell title="Fire status" state={state} onRetry={() => retry("prediction")} bare
          skeleton={<div className="grid gap-6 lg:grid-cols-12"><div className="skeleton h-80 lg:col-span-5" /><div className="skeleton h-80 lg:col-span-7" /></div>}>
          {(p) => (
            <div className="grid items-center gap-8 lg:grid-cols-12">
              <div className="glass rounded-2xl p-8 lg:col-span-5"><Dial p={p} meta={meta} /></div>
              <div className="grid gap-5 sm:grid-cols-2 lg:col-span-7">
                <Card label="Spread rate" value={<NumberTicker value={p.spread_rate_mm_s} format={(n) => fmtNum(n, 2)} />} unit="mm/s"
                  foot={<>Likely range {fmtCi(p.spread_rate_ci)} mm/s{p.ci_widened && <span className="ml-2 text-fire">· widened (sparse data)</span>}</>} />
                <Card label="Flame survives?" value={<NumberTicker value={survivalProbability(p.extinction_probability)} format={fmtPctNum} />} unit="%"
                  color="#FFB873" foot="Chance the flame keeps burning on its own" />
                <Card label="Time to critical" compact
                  value={p.time_to_critical_s === null ? fmtTtc(null) : <NumberTicker value={p.time_to_critical_s} format={fmtTtc} />}
                  foot={meta ? `Time for the flame to travel ${meta.model.critical_length_mm} mm (illustrative)` : ""} />
                <Card label="Matching runs" value={<NumberTicker value={p.matching_runs} format={(n) => fmtNum(n, 0)} />} unit={p.matching_runs === 1 ? "run" : "runs"}
                  color={p.matching_runs === 0 ? "var(--fire)" : "var(--cool)"} tint={p.matching_runs === 0}
                  foot={p.matching_runs === 0 ? "0 — no similar experiments, the model is extrapolating" : "Experiments with similar conditions"} />
              </div>
            </div>
          )}
        </PanelShell>
      </div>
    </section>
  );
}
