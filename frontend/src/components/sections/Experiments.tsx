// Section 6: experiment scatter (runs) + insight feed + Ask the Fire Lab. Run chips open the run drawer.
import { useMemo, useState } from "react";
import { useStore, scenarioOf } from "../../store/useStore";
import { api, ApiFailure } from "../../api/client";
import { PanelShell, ErrorChip } from "../common/PanelShell";
import type { AskResponse, Meta, Prediction, Run, RunsResponse } from "../../types";

// Colors for experiments are assigned by position in meta.experiments — no experiment names hard-coded.
const PALETTE = ["#3DD9FF", "#FFB873", "#B48CFF", "#7CE38B", "#FF6A8A", "#FFE066", "#8AB4FF", "#FF9A1F"];
export const expColor = (meta: Meta | null, exp: string) =>
  PALETTE[Math.max(0, meta?.experiments.indexOf(exp) ?? 0) % PALETTE.length];

function Marker({ x, y, g, color }: { x: number; y: number; g: number; color: string }) {
  if (g <= 0.05) return <circle cx={x} cy={y} r="3.2" fill={color} opacity="0.85" />;
  if (g >= 0.95) return <path d={`M${x},${y - 4} L${x + 4},${y + 3} L${x - 4},${y + 3}Z`} fill={color} opacity="0.85" />;
  return <path d={`M${x},${y - 4} L${x + 4},${y} L${x},${y + 4} L${x - 4},${y}Z`} fill={color} opacity="0.85" />;
}

function Scatter({ data, meta, pred, onPick }: { data: RunsResponse; meta: Meta; pred: Prediction | null; onPick: (id: string) => void }) {
  const W = 560, H = 320, P = 36;
  const shown = useMemo(() => data.runs.filter((r) => r.spread_rate_mm_s !== null), [data]);
  const hidden = data.runs.length - shown.length;
  const xr = meta.ranges.o2_percent;
  const ymax = Math.max(0.5, ...shown.map((r) => r.spread_rate_mm_s!), pred?.spread_rate_mm_s ?? 0) * 1.08;
  const X = (v: number) => P + ((v - xr.min) / (xr.max - xr.min)) * (W - 2 * P);
  const Y = (v: number) => H - P - (v / ymax) * (H - 2 * P);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * ymax);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P} x2={W - P} y1={Y(t)} y2={Y(t)} stroke="rgba(255,255,255,0.08)" />
            <text x={P - 6} y={Y(t) + 3} textAnchor="end" fontSize="10" fill="#A9B4C9" className="num">{t.toFixed(1)}</text>
          </g>
        ))}
        {[xr.min, (xr.min + xr.max) / 2, xr.max].map((t) => (
          <text key={t} x={X(t)} y={H - P + 16} textAnchor="middle" fontSize="10" fill="#A9B4C9" className="num">{t}%</text>
        ))}
        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="#A9B4C9" className="num" letterSpacing="2">OXYGEN (%)</text>
        <text x={10} y={H / 2} textAnchor="middle" fontSize="10" fill="#A9B4C9" className="num" letterSpacing="2" transform={`rotate(-90 10 ${H / 2})`}>SPREAD (mm/s)</text>
        {shown.map((r) => (
          <g key={r.run_id} onClick={() => onPick(r.run_id)} className="cursor-pointer">
            <title>{`${r.run_id} · ${r.material} · ${r.gravity_g} g · ${r.o2_percent}% O₂ · ${r.spread_rate_mm_s} mm/s`}</title>
            <Marker x={X(r.o2_percent)} y={Y(r.spread_rate_mm_s!)} g={r.gravity_g} color={expColor(meta, r.experiment)} />
          </g>
        ))}
        {pred && (
          <g>
            <circle cx={X(pred.scenario.o2_percent)} cy={Y(pred.spread_rate_mm_s)} r="9" fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 2" />
            <circle cx={X(pred.scenario.o2_percent)} cy={Y(pred.spread_rate_mm_s)} r="3" fill="#fff" />
          </g>
        )}
      </svg>
      <div className="num mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-dim">
        {meta.experiments.map((e) => (
          <span key={e} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: expColor(meta, e) }} />{e}</span>
        ))}
        <span>● 0 g ◆ partial g ▲ 1 g · ◌ your scenario</span>
        {hidden > 0 && <span className="text-[#FFB873]">{hidden} runs hidden: missing values</span>}
      </div>
    </div>
  );
}

function RunChip({ id }: { id: string }) {
  const selectRun = useStore((s) => s.selectRun);
  return (
    <button onClick={() => selectRun(id)}
      className="num rounded border border-cool/40 bg-cool/10 px-2 py-0.5 text-[11px] font-semibold text-cool hover:bg-cool/20">{id}</button>
  );
}

const EXAMPLES = ["Why is the flame cooler in space?", "Does more airflow put the flame out?"];

function Ask() {
  const s = useStore();
  const meta = s.meta.data;
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);
  const [res, setRes] = useState<AskResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function submit(question = q) {
    const sc = scenarioOf(s);
    if (!sc || !question.trim() || pending) return;
    setPending(true); setErr(null);
    try { setRes(await api.ask({ question: question.trim(), scenario: sc })); }
    catch (e) { setErr(e instanceof ApiFailure ? e.body.message : "Request failed"); }
    finally { setPending(false); }
  }
  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="num text-[13px] font-semibold uppercase tracking-wider">Ask the Fire Lab</h3>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <input value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder="Ask about fire in this scenario…"
          className="h-11 flex-1 rounded-lg border border-white/15 bg-[#0A0E1A] px-3 text-[14px] focus:outline-none focus:ring-1 focus:ring-cool" />
        <button disabled={pending || !q.trim()} className="num rounded-lg border border-cool px-4 text-[12px] font-semibold uppercase tracking-wider text-cool hover:bg-cool/10 disabled:opacity-40">
          {pending ? "…" : "Ask"}
        </button>
      </form>
      <div className="num mt-1 text-right text-[11px] text-dim">{q.length}/500</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((x) => (
          <button key={x} onClick={() => { setQ(x); void submit(x); }} className="rounded-full border border-white/15 px-3 py-1 text-[12px] text-dim hover:text-white">{x}</button>
        ))}
      </div>
      {err && <div className="mt-4"><ErrorChip message={err} onRetry={() => void submit()} /></div>}
      {res && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[14px] leading-relaxed">{res.answer}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {res.cited_run_ids.map((id) => <RunChip key={id} id={id} />)}
            <Tag gen={res.generated_by} mock={meta?.data_source === "mock"} />
          </div>
        </div>
      )}
    </div>
  );
}

function Tag({ gen, mock }: { gen: "llm" | "template"; mock: boolean }) {
  return (
    <span className="ml-auto flex gap-1.5">
      <span className="num rounded border border-white/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-dim">{gen === "llm" ? "AI" : "Template"}</span>
      {mock && <span className="num rounded border border-dashed border-mock px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-mock">Mock</span>}
    </span>
  );
}

export function Experiments() {
  const s = useStore();
  const meta = s.meta.data;
  return (
    <section id="experiments" className="relative z-10 flex min-h-screen flex-col justify-center px-6 py-24 md:px-12">
      <div className="mx-auto w-full max-w-6xl">
        <span className="eyebrow text-cool">Experiments</span>
        <h2 className="mt-3 font-space text-4xl font-bold tracking-tight text-white md:text-5xl">What the experiments say</h2>
        <p className="mt-3 max-w-2xl text-[17px] text-dim">
          Every prediction is grounded in experiment runs{meta ? ` (${meta.n_runs} ${meta.data_source === "nasa" ? "NASA" : "mock"} runs)` : ""}. Click any dot or run chip to see the run.
        </p>
        <div className="mt-12 grid items-start gap-8 lg:grid-cols-12">
          <PanelShell title="Experiment runs" subtitle="Oxygen vs spread rate" state={s.runs} onRetry={() => s.retry("runs")} className="lg:col-span-7"
            isEmpty={(r) => r.runs.length === 0} empty={<p className="text-sm text-dim">No runs loaded.</p>}>
            {(r) => meta && <Scatter data={r} meta={meta} pred={s.prediction.data} onPick={s.selectRun} />}
          </PanelShell>
          <div className="flex flex-col gap-6 lg:col-span-5">
            <PanelShell title="Insights" state={s.insights} onRetry={() => s.retry("insights")}
              isEmpty={(i) => i.insights.length === 0} empty={<p className="text-sm text-dim">No insights for this scenario.</p>}>
              {(i) => (
                <div className="space-y-3">
                  {i.insights.map((x) => (
                    <div key={x.text} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[14px] leading-relaxed">{x.text}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {x.cited_run_ids.map((id) => <RunChip key={id} id={id} />)}
                        <Tag gen={i.generated_by} mock={i.data_source === "mock"} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PanelShell>
            <Ask />
          </div>
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
  const rows: [string, unknown][] = run ? [
    ["Experiment", run.experiment], ["Fuel type", run.fuel_type], ["Material", run.material], ["Gravity (g)", run.gravity_g],
    ["O₂ (%)", run.o2_percent], ["Pressure (kPa)", run.pressure_kpa], ["Airflow (cm/s)", run.airflow_cm_s],
    ["Spread (mm/s)", run.spread_rate_mm_s], ["Flame temp (K)", run.flame_temp_k], ["Outcome", run.extinguished],
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
