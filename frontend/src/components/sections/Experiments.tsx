// Section 6: "What the experiments say" — what happened in real runs like yours, at a glance.
//   1. three headline numbers (how many comparable runs, how often flames went out, closest match)
//   2. chart: outcome-coloured runs, your 5 closest highlighted, your scenario as a glowing marker, hover cards
//   3. the 5 closest runs as cards (same runs the insights cite), then AI insights and Ask Nova
// Only summary counts are computed here; predictions and risk always come from the API (I-06).
import { useMemo, useState } from "react";
import { useStore } from "../../store/useStore";
import { PanelShell } from "../common/PanelShell";
import { RunChip, SourceTags } from "../common/RunChip";
import { rateLabel, type RateLabel } from "../../lib/units";
import type { Meta, Prediction, Run, RunsResponse } from "../../types";
import fabricPhoto from "../../assets/nasa/saffire-fabric.jpg";
import plexiPhoto from "../../assets/nasa/saffire-plexiglass.jpg";

// Real spacecraft fires from NASA's Saffire-IV (assets/nasa/CREDITS.md). Materials match ones in the app.
const SAFFIRE_PHOTOS = [
  { src: fabricPhoto, title: "Cotton-fiberglass fabric (SIBAL)", text: "A 40 cm sheet burning inside an empty Cygnus cargo ship. The orange flame front eats across the fabric; green is the test lighting." },
  { src: plexiPhoto, title: "Plexiglass (PMMA)", text: "The plastic melts and vaporises; the bright balls are vapour burning as it bursts from the surface." },
];

const OUT = "#3DD9FF";   // went out
const BURN = "#FF9A1F";  // kept burning (burned to completion)
const INT = "#B48CFF";   // test interrupted (NASA "Disruption")
const UNK = "#8A97B1";   // nothing recorded

type Outcome = "out" | "burned" | "interrupted" | "unknown";
/** NASA FLEX "test end: Disruption" rows have no extinguished value (data/SOURCES.md): the test was cut short,
 *  so neither outcome happened. The pipeline keeps that in source_note, which is where we read it. */
const outcomeOf = (r: Run): Outcome =>
  r.extinguished === true ? "out" : r.extinguished === false ? "burned"
    : /test end:\s*disruption/i.test(r.source_note) ? "interrupted" : "unknown";
const OUTCOME: Record<Outcome, { color: string; icon: string; legend: string }> = {
  out: { color: OUT, icon: "💨", legend: "went out" },
  burned: { color: BURN, icon: "🔥", legend: "burned to the end" },
  interrupted: { color: INT, icon: "⏸", legend: "test interrupted" },
  unknown: { color: UNK, icon: "•", legend: "not recorded" },
};
const colorOf = (r: Run) => OUTCOME[outcomeOf(r)].color;
const fmtSec = (s: number | null) => (s === null ? null : s < 60 ? `${s.toFixed(s < 10 ? 1 : 0)} s` : `${Math.round(s / 60)} min`);

export function outcomeText(r: Run) {
  const d = fmtSec(r.burn_duration_s);
  switch (outcomeOf(r)) {
    case "out": return d ? `Went out after ${d}` : "Went out on its own";
    case "burned": return d ? `Burned to the end (${d})` : "Burned to the end";
    case "interrupted": return d ? `Test interrupted after ${d}` : "Test interrupted";
    default: return "Outcome not recorded";
  }
}
const OUTCOME_HELP: Record<Outcome, string> = {
  out: "The flame self-extinguished.",
  burned: "The fuel burned completely.",
  interrupted: "NASA logged this test as “Disruption”: it was cut short (e.g. the droplet broke up or drifted) before the flame went out or the fuel ran out.",
  unknown: "No outcome in the source table.",
};

/** Runs comparable to the selected material: same fuel type (spread means different things per fuel, R-05). */
function useComparable(runs: RunsResponse | null, meta: Meta | null, material: string | undefined) {
  return useMemo(() => {
    const fuel = meta?.materials.find((m) => m.id === material)?.fuel_type;
    const all = runs?.runs ?? [];
    const same = fuel ? all.filter((r) => r.fuel_type === fuel) : all;
    return { fuel, same, otherFuel: all.length - same.length };
  }, [runs, meta, material]);
}

/** One plain-language takeaway computed from the runs: how often flames went out below vs above your O₂. */
function takeaway(runs: Run[], o2: number): string | null {
  const known = runs.filter((r) => r.extinguished !== null);
  const lo = known.filter((r) => r.o2_percent < o2), hi = known.filter((r) => r.o2_percent >= o2);
  if (lo.length < 5 || hi.length < 5) return null;
  const pct = (xs: Run[]) => Math.round((100 * xs.filter((r) => r.extinguished).length) / xs.length);
  const a = pct(lo), b = pct(hi);
  if (Math.abs(a - b) < 8) return `Flames went out about as often above and below ${o2}% oxygen (${a}% vs ${b}%).`;
  return a > b
    ? `Flames went out more often in thinner oxygen: ${a}% of runs below ${o2}% O₂, vs ${b}% at or above it.`
    : `Flames went out more often in richer oxygen: ${b}% of runs at or above ${o2}% O₂, vs ${a}% below it.`;
}

function Stat({ value, label, sub, color = "#fff", onClick }: { value: string; label: string; sub?: string; color?: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`glass flex flex-col rounded-2xl p-6 text-left ${onClick ? "transition hover:border-cool/50" : ""}`}>
      <span className="num text-4xl font-bold tracking-tight md:text-5xl" style={{ color }}>{value}</span>
      <span className="mt-2 text-[15px] text-white">{label}</span>
      {sub && <span className="mt-1 text-[13px] text-dim">{sub}</span>}
    </Tag>
  );
}

function Chart({ runs, nearest, pred, rate, onPick }: { runs: Run[]; nearest: Set<string>; pred: Prediction | null; rate: RateLabel; onPick: (id: string) => void }) {
  const W = 640, H = 360, L = 52, R = 18, T = 18, B = 46;
  const [hover, setHover] = useState<Run | null>(null);
  const shown = runs.filter((r) => r.spread_rate_mm_s !== null);
  const xs = shown.map((r) => r.o2_percent).concat(pred ? [pred.scenario.o2_percent] : []);
  const ys = shown.map((r) => r.spread_rate_mm_s!).concat(pred ? [pred.spread_rate_mm_s] : []);
  if (!xs.length) return <p className="text-sm text-dim">No runs with a measured {rate.short} for this fuel.</p>;
  const pad = (a: number, b: number) => { const d = (b - a) || 1; return [a - d * 0.08, b + d * 0.08]; };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [, y1] = pad(0, Math.max(...ys));
  const X = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v: number) => H - B - (v / y1) * (H - T - B);
  const yt = [0, 0.25, 0.5, 0.75, 1].map((f) => f * y1);
  const xt = [0, 0.25, 0.5, 0.75, 1].map((f) => x0 + f * (x1 - x0));
  // draw faded runs first, highlighted (closest) on top
  const ordered = [...shown].sort((a, b) => Number(nearest.has(a.run_id)) - Number(nearest.has(b.run_id)));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
        <defs>
          <radialGradient id="you-glow"><stop offset="0%" stopColor="#fff" stopOpacity="0.9" /><stop offset="100%" stopColor="#fff" stopOpacity="0" /></radialGradient>
        </defs>
        {yt.map((t) => (
          <g key={`y${t}`}>
            <line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="rgba(255,255,255,0.06)" />
            <text x={L - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#A9B4C9" className="num">{t.toFixed(t < 1 ? 2 : 1)}</text>
          </g>
        ))}
        {xt.map((t) => <text key={`x${t}`} x={X(t)} y={H - B + 18} textAnchor="middle" fontSize="11" fill="#A9B4C9" className="num">{t.toFixed(0)}%</text>)}
        <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="#C9D3E3">Oxygen in the air (%)</text>
        <text x={14} y={(T + H - B) / 2} textAnchor="middle" fontSize="12" fill="#C9D3E3" transform={`rotate(-90 14 ${(T + H - B) / 2})`}>
          {rate.name} ({rate.unit})
        </text>
        {ordered.map((r) => {
          const near = nearest.has(r.run_id);
          return (
            <circle key={r.run_id} cx={X(r.o2_percent)} cy={Y(r.spread_rate_mm_s!)} r={near ? 6.5 : 4}
              fill={colorOf(r)} fillOpacity={near ? 1 : 0.32} stroke={near ? "#fff" : "none"} strokeWidth={near ? 2 : 0}
              className="cursor-pointer" onMouseEnter={() => setHover(r)} onClick={() => onPick(r.run_id)} />
          );
        })}
        {pred && (
          <g pointerEvents="none">
            <circle cx={X(pred.scenario.o2_percent)} cy={Y(pred.spread_rate_mm_s)} r="22" fill="url(#you-glow)" opacity="0.35" />
            <circle cx={X(pred.scenario.o2_percent)} cy={Y(pred.spread_rate_mm_s)} r="9" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="3 2" />
            <circle cx={X(pred.scenario.o2_percent)} cy={Y(pred.spread_rate_mm_s)} r="3.5" fill="#fff" />
            <text x={X(pred.scenario.o2_percent) + 14} y={Y(pred.spread_rate_mm_s) - 12} fontSize="12" fontWeight="700" fill="#fff">Your fire</text>
          </g>
        )}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-full rounded-xl border border-white/15 bg-[#070B14]/95 px-3 py-2 text-[12px] shadow-xl"
          style={{ left: `${(X(hover.o2_percent) / W) * 100}%`, top: `${(Y(hover.spread_rate_mm_s!) / H) * 100 - 3}%` }}>
          <div className="num font-semibold text-white">{hover.run_id} <span className="text-dim">· {hover.experiment}</span></div>
          <div className="mt-0.5" style={{ color: colorOf(hover) }}>{outcomeText(hover)}</div>
          <div className="num mt-0.5 text-dim">{hover.o2_percent}% O₂ · {hover.pressure_kpa} kPa · {rate.short} {hover.spread_rate_mm_s}</div>
        </div>
      )}
    </div>
  );
}

/** A closest-run card: outcome badge, burn timeline, condition chips and the measured rate. */
function ClosestRun({ r, rank, rate, maxBurn }: { r: Run; rank: number; rate: RateLabel; maxBurn: number }) {
  const selectRun = useStore((s) => s.selectRun);
  const o = outcomeOf(r);
  const { color, icon } = OUTCOME[o];
  const dur = r.burn_duration_s;
  const pct = dur !== null && maxBurn > 0 ? Math.max(6, (dur / maxBurn) * 100) : 0;
  const chips = [`${r.o2_percent}% O₂`, `${Math.round(r.pressure_kpa)} kPa`, `${r.airflow_cm_s} cm/s`, `${r.gravity_g} g`];
  return (
    <button onClick={() => selectRun(r.run_id)} title={OUTCOME_HELP[o]}
      className="group relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.06]">
      {/* outcome colour wash on the left edge */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[20px]"
          style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}55`, color }} aria-hidden>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="num text-[15px] font-semibold text-white">{r.run_id}</span>
            <span className="num rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-dim">#{rank + 1} closest</span>
          </div>
          <p className="mt-0.5 text-[13px] font-medium" style={{ color }}>{outcomeText(r)}</p>
        </div>
        {r.spread_rate_mm_s !== null && (
          <div className="text-right">
            <p className="num text-[20px] font-bold leading-none text-white">{r.spread_rate_mm_s}</p>
            <p className="num mt-1 text-[10px] text-dim">{rate.unit}</p>
          </div>
        )}
      </div>
      {/* burn timeline: how long the flame lasted, relative to the longest of these runs */}
      <div className="mt-3 flex items-center gap-2">
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
          {dur !== null && <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}55, ${color})` }} />}
        </div>
        <span className="num w-12 text-right text-[11px] text-dim">{dur !== null ? fmtSec(dur) : "—"}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {chips.map((c) => <span key={c} className="num rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-dim">{c}</span>)}
      </div>
    </button>
  );
}

export function Experiments() {
  const s = useStore();
  const meta = s.meta.data;
  const { fuel, same, otherFuel } = useComparable(s.runs.data, meta, s.material);
  const rate = rateLabel(meta?.data_source, fuel);
  const ids = s.insights.data?.retrieved_run_ids ?? [];
  const byId = useMemo(() => new Map((s.runs.data?.runs ?? []).map((r) => [r.run_id, r])), [s.runs.data]);
  const closest = ids.map((id) => byId.get(id)).filter((r): r is Run => !!r);
  // list: clear outcomes first, then interrupted, then unrecorded — distance order kept inside each group
  const rankOf = new Map(closest.map((r, i) => [r.run_id, i]));
  const order: Record<Outcome, number> = { out: 0, burned: 0, interrupted: 1, unknown: 2 };
  const listed = [...closest].sort((a, b) => order[outcomeOf(a)] - order[outcomeOf(b)] || rankOf.get(a.run_id)! - rankOf.get(b.run_id)!);
  const maxBurn = Math.max(0, ...closest.map((r) => r.burn_duration_s ?? 0));
  // headline tile: the closest run whose outcome is actually known (more telling than "not recorded")
  const headline = closest.find((r) => r.extinguished !== null) ?? closest[0];
  const nearest = useMemo(() => new Set(ids), [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const known = same.filter((r) => r.extinguished !== null);
  const interrupted = same.filter((r) => outcomeOf(r) === "interrupted").length;
  const outPct = known.length ? Math.round((100 * known.filter((r) => r.extinguished).length) / known.length) : null;
  const exps = [...new Set(same.map((r) => r.experiment))];
  const line = s.o2_percent !== undefined ? takeaway(same, s.o2_percent) : null;
  const src = meta?.data_source === "nasa" ? "NASA" : "mock";

  return (
    <section id="experiments" className="relative z-10 flex min-h-screen flex-col justify-center px-6 py-24 md:px-12">
      <div className="mx-auto w-full max-w-6xl">
        <span className="eyebrow text-cool">Experiments</span>
        <h2 className="mt-3 font-space text-4xl font-bold tracking-tight text-white md:text-5xl">What happened in real experiments like yours</h2>
        <p className="mt-3 max-w-2xl text-[17px] text-dim">
          Every prediction is grounded in {src} experiment runs. Here's what the closest ones did.
        </p>

        {/* 1. headline numbers */}
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {s.runs.data ? (
            <>
              <Stat value={`${same.length}`} label={`${fuel ? `${fuel} ` : ""}experiment runs`} sub={exps.length ? `from ${exps.join(", ")}` : undefined} />
              <Stat value={outPct === null ? "—" : `${outPct}%`} color={OUT} label="of these flames went out on their own"
                sub={outPct === null ? "outcomes not recorded" : `of ${known.length} runs with a clear outcome${interrupted ? ` · ${interrupted} tests interrupted` : ""}`} />
              {headline ? (
                <Stat value={headline.run_id} color={colorOf(headline)}
                  label={headline === closest[0] ? "closest match to your fire" : "closest run with a known outcome"}
                  sub={outcomeText(headline)} onClick={() => s.selectRun(headline.run_id)} />
              ) : <div className="skeleton h-full min-h-[120px] rounded-2xl" />}
            </>
          ) : [0, 1, 2].map((i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}
        </div>

        {/* 2. chart + closest runs */}
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-12">
          <PanelShell title="Every comparable run" subtitle={`Oxygen vs ${rate.name.toLowerCase()} · hover or click a dot`} state={s.runs} onRetry={() => s.retry("runs")}
            className="lg:col-span-7" isEmpty={() => same.length === 0} empty={<p className="text-sm text-dim">No runs for this fuel type.</p>}>
            {() => (
              <>
                {line && (
                  <p className="mb-3 flex items-start gap-2 rounded-lg border border-cool/25 bg-cool/[0.06] px-3 py-2 text-[14px] text-white">
                    <span aria-hidden>💡</span><span>{line}</span>
                  </p>
                )}
                <Chart runs={same} nearest={nearest} pred={s.prediction.data} rate={rate} onPick={s.selectRun} />
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
                  {(["out", "burned", "interrupted", "unknown"] as Outcome[])
                    .filter((k) => k !== "unknown" || same.some((r) => outcomeOf(r) === "unknown"))
                    .filter((k) => k !== "interrupted" || same.some((r) => outcomeOf(r) === "interrupted"))
                    .map((k) => (
                      <span key={k} className="flex items-center gap-1.5" title={OUTCOME_HELP[k]}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: OUTCOME[k].color }} />{OUTCOME[k].legend}
                      </span>
                    ))}
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-white" />your 5 closest runs</span>
                  {otherFuel > 0 && <span className="text-dim">{otherFuel} runs of other fuel types not shown (not comparable)</span>}
                </div>
              </>
            )}
          </PanelShell>
          <PanelShell title="Experiments closest to your fire" subtitle="Click one for the full record" state={s.insights} onRetry={() => s.retry("insights")}
            className="lg:col-span-5" isEmpty={() => closest.length === 0} empty={<p className="text-sm text-dim">No close runs found.</p>}
            skeleton={<div className="space-y-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-16" />)}</div>}>
            {() => <div className="space-y-3">{listed.map((r) => <ClosestRun key={r.run_id} r={r} rank={rankOf.get(r.run_id)!} rate={rate} maxBurn={maxBurn} />)}</div>}
          </PanelShell>
        </div>

        {/* real fires: NASA Saffire photos */}
        <div className="mt-8">
          <p className="label mb-3">Real fires in space · NASA Saffire-IV</p>
          <div className="grid gap-5 md:grid-cols-2">
            {SAFFIRE_PHOTOS.map((p) => (
              <figure key={p.title} className="glass group overflow-hidden rounded-2xl">
                <div className="relative h-52 overflow-hidden">
                  <img src={p.src} alt={`${p.title} burning in NASA's Saffire-IV experiment`} loading="lazy"
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  <span className="num absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/80">Photo: NASA</span>
                </div>
                <figcaption className="p-4">
                  <p className="font-semibold text-white">{p.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-dim">{p.text}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        {/* 3. insights + Ask Nova */}
        <div className="mt-8">
          <PanelShell title="What the runs suggest" subtitle="Written from the closest runs, each claim cites its source" state={s.insights} onRetry={() => s.retry("insights")}
            isEmpty={(i) => i.insights.length === 0} empty={<p className="text-sm text-dim">No insights for this scenario.</p>}>
            {(i) => (
              <div className="grid gap-4 md:grid-cols-3">
                {i.insights.map((x) => (
                  <div key={x.text} className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="flex-1 text-[14px] leading-relaxed">{x.text}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {x.cited_run_ids.map((id) => <RunChip key={id} id={id} />)}
                      <SourceTags gen={i.generated_by} mock={i.data_source === "mock"} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PanelShell>
          <button onClick={() => s.setChatOpen(true)}
            className="glass group mt-5 flex w-full items-center gap-4 rounded-2xl p-5 text-left transition hover:border-cool/50">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-cool/40 bg-cool/10 text-2xl" aria-hidden>🧑‍🚀</span>
            <span>
              <span className="block font-space text-lg font-semibold text-white">Still curious? Ask Commander Nova</span>
              <span className="block text-[13px] text-dim">Ask anything about this scenario — answers cite the experiment runs.</span>
            </span>
            <span className="num ml-auto text-cool transition group-hover:translate-x-1" aria-hidden>→</span>
          </button>
        </div>
      </div>
    </section>
  );
}

export function RunDrawer() {
  const id = useStore((s) => s.selectedRunId);
  const runs = useStore((s) => s.runs.data);
  const selectRun = useStore((s) => s.selectRun);
  if (!id) return null;
  const run: Run | undefined = runs?.runs.find((r) => r.run_id === id);
  const show = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "boolean" ? (v ? "Self-extinguished" : "Kept burning") : String(v));
  const source = useStore.getState().meta.data?.data_source;
  const rate = rateLabel(source, run?.fuel_type);
  const rows: [string, unknown][] = run ? [
    ["Experiment", run.experiment], ["Fuel type", run.fuel_type], ["Material", run.material], ["Gravity (g)", run.gravity_g],
    ["O₂ (%)", run.o2_percent], ["Pressure (kPa)", run.pressure_kpa], ["Airflow (cm/s)", run.airflow_cm_s],
    [`${rate.name} (${rate.unit})`, run.spread_rate_mm_s], ["Flame temp (K)", run.flame_temp_k], ["Outcome", run.extinguished],
    ["Burn duration (s)", run.burn_duration_s],
  ] : [];
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/50" onClick={() => selectRun(null)}>
      <aside className="h-full w-full max-w-[420px] overflow-y-auto border-l border-white/10 bg-[#0D1424] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="num text-lg font-semibold text-cool">{id}</h3>
          <button onClick={() => selectRun(null)} className="num rounded border border-white/15 px-2 py-1 text-[12px] text-dim hover:text-white">Close</button>
        </div>
        {!run ? <p className="mt-6 text-sm text-dim">This run isn't in the loaded list.</p> : (
          <>
            <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3">
              {rows.map(([k, v]) => (<div key={k}><dt className="label">{k}</dt><dd className="num text-[14px]">{show(v)}</dd></div>))}
            </dl>
            <div className="mt-6"><span className="label">Source note</span>
              <p className="mt-2 rounded-lg border border-white/10 bg-black/30 p-3 text-[13px] text-dim">{run.source_note}</p></div>
          </>
        )}
      </aside>
    </div>
  );
}
