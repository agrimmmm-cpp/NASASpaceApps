// Section 3: risk dial + four stat cards. Every number is what /api/predict returned (I-06).
import { ConfidenceMeter } from "./ConfidenceMeter";
import type { ReactNode } from "react";
import { useStore } from "../../store/useStore";
import { BAND_COLOR, PLAIN_BAND } from "../../lib/bands";
import { Flame } from "../space/Flame";
import { Reveal, SectionGlow } from "../common/Reveal";
import { fmtCi, fmtNum, fmtPctNum, fmtRisk, fmtTtc } from "../../lib/format";
import { survivalProbability } from "../../lib/survival";
import { PanelShell } from "../common/PanelShell";
import { NumberTicker } from "../common/NumberTicker";
import { rateLabel } from "../../lib/units";
import { printReport } from "../MissionReport";
import type { Meta, Prediction } from "../../types";

function Dial({ p, meta }: { p: Prediction; meta: Meta | null }) {
  const R = 130, C = 2 * Math.PI * R;
  const color = BAND_COLOR[p.risk_band];
  const w = meta?.model.weights;
  const hot = p.risk_band === "high" || p.risk_band === "critical";
  return (
    <div className="relative mx-auto flex h-80 w-80 items-center justify-center"
      title={w ? `risk = 100 × (${w.spread} × rate ÷ ${meta?.model.spread_ref_mm_s} + ${w.survival} × chance the flame survives)` : undefined}>
      {/* soft glow in the band colour; pulses when the fire is High/Extreme */}
      <div aria-hidden className={`absolute inset-6 rounded-full blur-3xl ${hot ? "animate-pulse" : ""}`} style={{ background: color, opacity: 0.18 + 0.25 * (p.risk_index / 100) }} />
      {/* the live flame at the core: grows and warms with the risk (illustrative, uses the current gravity) */}
      <div aria-hidden className="absolute inset-0 flex items-center justify-center opacity-50">
        <Flame gravity={p.scenario.gravity_g} intensity={p.risk_index / 100} size={150 + 90 * (p.risk_index / 100)} />
      </div>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 320 320" aria-hidden>
        <defs>
          <filter id="arc-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <circle cx="160" cy="160" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="14" />
        {Array.from({ length: 20 }, (_, k) => {
          const a = (k / 20) * 2 * Math.PI, major = k % 5 === 0;
          return <line key={k} x1={160 + (major ? 104 : 109) * Math.cos(a)} y1={160 + (major ? 104 : 109) * Math.sin(a)} x2={160 + 116 * Math.cos(a)} y2={160 + 116 * Math.sin(a)}
            stroke="rgba(255,255,255,0.25)" strokeWidth={major ? 2 : 1} />;
        })}
        <circle cx="160" cy="160" r={R} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" filter="url(#arc-glow)"
          strokeDasharray={C} strokeDashoffset={C * (1 - p.risk_index / 100)} style={{ transition: "stroke-dashoffset 500ms ease, stroke 400ms" }} />
      </svg>
      <div className="relative flex flex-col items-center">
        <span className="label">Risk index</span>
        <span className="num text-8xl font-bold leading-none drop-shadow-[0_0_24px_rgba(0,0,0,0.9)]" style={{ color }}><NumberTicker value={p.risk_index} format={fmtRisk} /></span>
        <span className="num mt-4 rounded-full border px-4 py-1.5 text-[13px] font-semibold uppercase tracking-wider"
          style={{ color, borderColor: color, background: "rgba(3,5,11,0.6)" }}>
          / 100 · {PLAIN_BAND[p.risk_band]}
        </span>
      </div>
    </div>
  );
}

function Card({ icon, label, value, unit, foot, color = "#fff", tint, compact, delay = 0 }: {
  icon: string; label: string; value: ReactNode; unit?: string; foot: ReactNode; color?: string; tint?: boolean; compact?: boolean; delay?: number;
}) {
  return (
    // Reveal (slow scroll-in) wraps the card; the card has its own quick hover so the two animations never mix.
    <Reveal delay={delay} className="h-full">
    <div className={`glass group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl p-6 transition-[transform,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-white/25 ${tint ? "border-fire/50" : ""}`}>
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl transition-opacity duration-200 group-hover:opacity-35" style={{ background: color }} />
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.08] text-[16px]" aria-hidden>{icon}</span>
        <span className="label">{label}</span>
      </div>
      <div className={`num my-3 whitespace-nowrap font-bold tracking-tight ${compact ? "text-4xl md:text-5xl" : "text-6xl"}`} style={{ color }}>
        {value}{unit && <span className="ml-2 text-xl font-normal text-dim">{unit}</span>}
      </div>
      <div className="text-[13px] text-dim">{foot}</div>
    </div>
    </Reveal>
  );
}

export function Status() {
  const state = useStore((s) => s.prediction);
  const meta = useStore((s) => s.meta.data);
  const retry = useStore((s) => s.retry);
  const material = useStore((s) => s.material);
  const rate = rateLabel(meta?.data_source, meta?.materials.find((m) => m.id === material)?.fuel_type);
  return (
    <section id="status" className="relative z-10 flex min-h-screen flex-col justify-center px-6 py-24 md:px-12">
      <SectionGlow colors={["#FF9A1F", "#FF3B3B"]} />
      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="mb-10 text-center">
          <span className="eyebrow text-[#FFB873]">Risk</span>
          <h2 className="mt-3 font-space text-4xl font-bold tracking-tight text-white md:text-5xl">Current fire status</h2>
          <p className="mx-auto mt-3 max-w-xl text-[17px] text-dim">
            Predicted from {meta ? `${meta.n_runs} ` : ""}{meta?.data_source === "nasa" ? "NASA experiment runs" : "mock experiment runs"}.
          </p>
          <button onClick={printReport}
            className="num mt-5 inline-flex items-center gap-2 rounded-full border border-cool/50 bg-cool/10 px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-cool hover:bg-cool/20">
            ⬇ Download fire-safety report
          </button>
        </Reveal>
        <PanelShell title="Fire status" state={state} onRetry={() => retry("prediction")} bare
          skeleton={<div className="grid gap-6 lg:grid-cols-12"><div className="skeleton h-80 lg:col-span-5" /><div className="skeleton h-80 lg:col-span-7" /></div>}>
          {(p) => (
            <div className="grid items-center gap-8 lg:grid-cols-12">
              <Reveal className="lg:col-span-5"><Dial p={p} meta={meta} /></Reveal>
              <div className="grid gap-5 sm:grid-cols-2 lg:col-span-7">
                <Card icon="⚡" label={rate.name} value={<NumberTicker value={p.spread_rate_mm_s} format={(n) => fmtNum(n, 2)} />} unit={rate.unit}
                  foot={<>Likely {fmtCi(p.spread_rate_ci)} {rate.unit}{p.ci_widened && <span className="ml-1 text-fire">· sparse data</span>}</>} />
                <Card icon="🔥" delay={80} label="Flame survives?" value={<NumberTicker value={survivalProbability(p.extinction_probability)} format={fmtPctNum} />} unit="%"
                  color="#FFB873" foot="chance it keeps burning on its own" />
                <Card icon="⏱" delay={160} label="Time to critical" compact
                  value={p.time_to_critical_s === null ? fmtTtc(null) : <NumberTicker value={p.time_to_critical_s} format={fmtTtc} />}
                  foot={meta ? `to spread ${meta.model.critical_length_mm} mm (illustrative)` : ""} />
                <Card icon="🧪" delay={240} label="Matching runs" value={<NumberTicker value={p.matching_runs} format={(n) => fmtNum(n, 0)} />} unit={p.matching_runs === 1 ? "run" : "runs"}
                  color={p.matching_runs === 0 ? "var(--fire)" : "var(--cool)"} tint={p.matching_runs === 0}
                  foot={p.matching_runs === 0 ? "no similar experiments: extrapolating" : "similar real experiments"} />
              </div>
              <Reveal className="lg:col-span-12"><ConfidenceMeter p={p} /></Reveal>
            </div>
          )}
        </PanelShell>
      </div>
    </section>
  );
}
