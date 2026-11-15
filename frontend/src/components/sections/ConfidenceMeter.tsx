// "How sure are we?" — turns the uncertainty the API already reports (matching runs, CI width, held-out model scores)
// into a plain verdict, and offers a jump to the closest real experiment when the model is extrapolating.
import { useMemo } from "react";
import { useStore } from "../../store/useStore";
import type { Prediction } from "../../types";
import { confidence, nearestRun, type Level } from "../../lib/confidence";
import { fmtCi } from "../../lib/format";
import { rateLabel } from "../../lib/units";

const LEVEL: Record<Level, { word: string; color: string; verdict: string }> = {
  low: { word: "Low", color: "#FF8A5B", verdict: "Treat these numbers as a rough guide: good for comparing options, not as exact values." },
  medium: { word: "Medium", color: "#FFC83D", verdict: "Reasonably grounded in real experiments, but expect real fires to vary." },
  high: { word: "High", color: "#5BE49B", verdict: "Well supported by nearby experiments and a model that tests well." },
};

function Dots({ n, max, color }: { n: number; max: number; color: string }) {
  return (
    <span className="flex gap-1" aria-label={`${n} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="h-2 w-2 rounded-full" style={{ background: i < n ? color : "rgba(255,255,255,0.15)" }} />
      ))}
    </span>
  );
}

/** Half-circle gauge with Low / Medium / High zones and a needle at points/max. */
function Gauge({ frac, color }: { frac: number; color: string }) {
  const R = 70, cx = 90, cy = 84;
  const pt = (f: number, r = R) => [cx - r * Math.cos(Math.PI * f), cy - r * Math.sin(Math.PI * f)];
  const arc = (f0: number, f1: number) => { const [x0, y0] = pt(f0), [x1, y1] = pt(f1); return `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}`; };
  const [nx, ny] = pt(frac, R - 14);
  return (
    <svg viewBox="0 0 180 96" className="w-44" aria-hidden>
      {[[0, 3 / 7, "#FF8A5B"], [3 / 7, 5 / 7, "#FFC83D"], [5 / 7, 1, "#5BE49B"]].map(([a, b, c]) => (
        <path key={String(c)} d={arc(+a + 0.01, +b - 0.01)} stroke={String(c)} strokeOpacity="0.85" strokeWidth="12" fill="none" strokeLinecap="round" />
      ))}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="4" strokeLinecap="round" style={{ transition: "all 0.6s ease" }} />
      <circle cx={cx} cy={cy} r="7" fill="#0b1020" stroke={color} strokeWidth="3" />
    </svg>
  );
}

export function ConfidenceMeter({ p }: { p: Prediction }) {
  const meta = useStore((s) => s.meta.data);
  const runs = useStore((s) => s.runs.data?.runs);
  const setScenario = useStore((s) => s.setScenario);
  const selectRun = useStore((s) => s.selectRun);
  const c = confidence(p, meta);
  const L = LEVEL[c.level];
  const material = meta?.materials.find((m) => m.id === p.scenario.material);
  const rate = rateLabel(meta?.data_source, material?.fuel_type);
  const near = useMemo(() => (runs && meta ? nearestRun(runs, p.scenario, meta.ranges) : null), [runs, meta, p.scenario]);
  const m = meta?.model.metrics;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const [lo, hi] = p.spread_rate_ci;
  const scale = Math.max(hi * 1.15, 1e-6);
  const source = meta?.data_source === "nasa" ? "NASA" : "mock";

  const rows = [
    {
      icon: "📚", title: "Real experiments nearby", f: c.factors[0],
      text: p.matching_runs === 0
        ? <>No {source} runs close to these exact conditions, so the model is <b className="text-[#FF8A5B]">extrapolating</b>.</>
        : <><b className="text-white">{p.matching_runs}</b> real {source} run{p.matching_runs === 1 ? "" : "s"} close to these conditions.</>,
    },
    {
      icon: "📏", title: "How wide the likely range is", f: c.factors[1],
      text: (
        <>
          {rate.name} likely <b className="text-white">{fmtCi(p.spread_rate_ci)} {rate.unit}</b> (about ±{Math.round((c.relWidth / 2) * 100)}%).
          {p.ci_widened && <span className="ml-1 text-fire">Interpolated — sparse data at this gravity, so the range is widened.</span>}
          <span className="relative mt-2 block h-1.5 rounded bg-white/10">
            <span className="absolute inset-y-0 rounded" style={{ left: `${(lo / scale) * 100}%`, width: `${((hi - lo) / scale) * 100}%`, background: L.color, opacity: 0.6 }} />
            <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-white" style={{ left: `${(p.spread_rate_mm_s / scale) * 100}%` }} />
          </span>
        </>
      ),
    },
    {
      icon: "🧠", title: "How well the model tests", f: c.factors[2],
      text: m && (m.spread_r2 !== null || m.extinction_auc !== null) ? (
        <>
          On runs it never saw{m.spread_r2 !== null && <>, it explains about <b className="text-white">{pct(Math.max(0, m.spread_r2))}</b> of the differences in {rate.short}</>}
          {m.extinction_auc !== null && <>, and tells flames that go out from ones that keep burning <b className="text-white">{pct(m.extinction_auc)}</b> of the time (50% = coin flip)</>}.
        </>
      ) : <>Model scores aren't available yet.</>,
    },
  ];

  const nearIsDifferent = near && (Math.abs(near.o2_percent - p.scenario.o2_percent) > 0.01 || Math.abs(near.pressure_kpa - p.scenario.pressure_kpa) > 0.01
    || Math.abs(near.airflow_cm_s - p.scenario.airflow_cm_s) > 0.01 || Math.abs(near.gravity_g - p.scenario.gravity_g) > 0.001);

  return (
    <div className="glass relative overflow-hidden rounded-2xl p-6">
      <span aria-hidden className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full opacity-20 blur-3xl" style={{ background: L.color }} />
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <div className="flex flex-col items-center text-center">
          <span className="label">How sure are we?</span>
          <Gauge frac={c.points / c.max} color={L.color} />
          <div className="font-space text-3xl font-bold" style={{ color: L.color }}>{L.word}</div>
          <div className="num text-[11px] text-dim">confidence · {c.points}/{c.max}</div>
          <p className="mt-2 text-[13px] leading-snug text-white/80">{L.verdict}</p>
        </div>
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.title} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-white"><span aria-hidden>{r.icon}</span>{r.title}</span>
                <Dots n={r.f.points} max={r.f.max} color={L.color} />
              </div>
              <div className="text-[13px] leading-snug text-dim">{r.text}</div>
            </div>
          ))}
          {near && nearIsDifferent && c.factors[0].points < 2 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cool/30 bg-cool/5 px-4 py-3 text-[13px]">
              <span className="text-white/85">
                🛰 Closest real test: <b className="text-white">O₂ {near.o2_percent}%</b>, {near.pressure_kpa} kPa, airflow {near.airflow_cm_s} cm/s, {near.gravity_g} g
                <button onClick={() => selectRun(near.run_id)} className="num ml-2 text-[11px] text-cool underline-offset-2 hover:underline">{near.run_id}</button>
              </span>
              <button onClick={() => setScenario({ o2_percent: near.o2_percent, pressure_kpa: near.pressure_kpa, airflow_cm_s: near.airflow_cm_s, gravity_g: near.gravity_g })}
                className="num rounded-full border border-cool/50 bg-cool/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-cool hover:bg-cool/20">
                Jump to real data →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
