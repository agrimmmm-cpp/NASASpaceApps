// Section 4: 20×20 danger-zone heatmap (I-07, axes from the response) + "Why this risk?" (05 §8).
import { useMemo, useState } from "react";
import { useStore } from "../../store/useStore";
import { BAND_COLOR, BAND_LABEL, bandFor } from "../../lib/bands";
import { shapRows } from "../../lib/shapText";
import { PanelShell } from "../common/PanelShell";
import type { Heatmap, Meta } from "../../types";

/** Fractional index of v within an ascending axis array (crosshair uses the response's own axes, 05 §5). */
function fracIndex(axis: number[], v: number) {
  if (v <= axis[0]) return 0;
  for (let i = 1; i < axis.length; i++) {
    if (v <= axis[i]) return i - 1 + (v - axis[i - 1]) / (axis[i] - axis[i - 1]);
  }
  return axis.length - 1;
}

function HeatmapSvg({ h, meta, o2, air, onPick }: { h: Heatmap; meta: Meta; o2: number; air: number; onPick: (o2: number, air: number) => void }) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const nx = h.o2_values.length, ny = h.airflow_values.length;
  const W = 400, H = 300, cw = W / nx, ch = H / ny;
  const bands = useMemo(() => h.risk.map((row) => row.map((v) => bandFor(v, meta.risk_bands))), [h, meta]);
  const safe = useMemo(() => {
    let sx = 0, sy = 0, n = 0;
    bands.forEach((row, i) => row.forEach((b, j) => { if (b === "low") { sx += j; sy += i; n++; } }));
    return n ? { x: (sx / n + 0.5) * cw, y: H - (sy / n + 0.5) * ch } : null;
  }, [bands, cw, ch]);
  const cx = (fracIndex(h.o2_values, o2) + 0.5) * cw;
  const cy = H - (fracIndex(h.airflow_values, air) + 0.5) * ch;
  const hv = hover && { risk: h.risk[hover.i][hover.j], o2: h.o2_values[hover.j], air: h.airflow_values[hover.i] };
  return (
    <div>
      <div className="flex gap-3">
        <span className="label self-center [writing-mode:vertical-rl] rotate-180">Airflow (cm/s)</span>
        <div className="relative flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-white/10 bg-black/40" onMouseLeave={() => setHover(null)}>
            {h.risk.map((row, i) => row.map((v, j) => (
              <rect key={`${i}-${j}`} x={j * cw} y={H - (i + 1) * ch} width={cw + 0.3} height={ch + 0.3}
                fill={BAND_COLOR[bands[i][j]]} opacity={0.28 + 0.6 * (v / 100)}
                onMouseEnter={() => setHover({ i, j })} onClick={() => onPick(h.o2_values[j], h.airflow_values[i])}
                className="cursor-crosshair" />
            )))}
            {safe && <text x={safe.x} y={safe.y} textAnchor="middle" className="num" fontSize="11" fontWeight="700" letterSpacing="2" fill="#E6FBFF">SAFE ZONE</text>}
            <line x1={cx} x2={cx} y1={0} y2={H} stroke="#fff" strokeOpacity="0.75" strokeWidth="1" />
            <line x1={0} x2={W} y1={cy} y2={cy} stroke="#fff" strokeOpacity="0.75" strokeWidth="1" />
            <circle cx={cx} cy={cy} r="11" fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="4 2" />
            <circle cx={cx} cy={cy} r="3.5" fill="#fff" />
          </svg>
          {hv && (
            <div className="num pointer-events-none absolute right-2 top-2 rounded border border-white/15 bg-[#070B14]/90 px-2 py-1 text-[12px]">
              Risk {Math.round(hv.risk)} · {hv.o2.toFixed(1)}% O₂ · {hv.air.toFixed(1)} cm/s
            </div>
          )}
        </div>
      </div>
      <div className="num mt-2 flex justify-between pl-8 text-[11px] text-dim">
        <span>{h.o2_values[0]}%</span><span className="uppercase tracking-widest">Oxygen (%)</span><span>{h.o2_values[nx - 1]}%</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 pl-8">
        {meta.risk_bands.map((b) => (
          <span key={b.band} className="num flex items-center gap-2 text-[12px]" style={{ color: BAND_COLOR[b.band] }}>
            <span className="h-3 w-3 rounded-sm" style={{ background: BAND_COLOR[b.band] }} />
            {BAND_LABEL[b.band]} {b.min}–{b.max}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Danger() {
  const s = useStore();
  const meta = s.meta.data;
  return (
    <section id="danger" className="relative z-10 flex min-h-screen flex-col justify-center px-6 py-24 md:px-12">
      <div className="mx-auto w-full max-w-6xl">
        <span className="eyebrow text-cool">Danger zone</span>
        <h2 className="mt-3 font-space text-4xl font-bold tracking-tight text-white md:text-5xl">Where does fire become dangerous?</h2>
        <p className="mt-3 max-w-2xl text-[17px] text-dim">Risk for every mix of oxygen and airflow at the current pressure and gravity. Click a cell to jump there.</p>
        <div className="mt-12 grid items-start gap-8 lg:grid-cols-12">
          <PanelShell title="Danger zone" subtitle={s.heatmap.data ? `${s.heatmap.data.material} · ${s.heatmap.data.pressure_kpa} kPa · ${s.heatmap.data.gravity_g} g` : undefined}
            state={s.heatmap} onRetry={() => s.retry("heatmap")} className="lg:col-span-7"
            skeleton={<div className="skeleton aspect-[4/3] w-full" />}>
            {(h) => meta && <HeatmapSvg h={h} meta={meta} o2={s.o2_percent!} air={s.airflow_cm_s!}
              onPick={(o2, air) => s.setScenario({ o2_percent: Math.round(o2 * 2) / 2, airflow_cm_s: Math.round(air) })} />}
          </PanelShell>
          <PanelShell title="Why this risk?" state={s.prediction} onRetry={() => s.retry("prediction")} className="lg:col-span-5"
            isEmpty={(p) => p.shap.length === 0}
            empty={<p className="text-sm text-dim">Explanation unavailable for this scenario.</p>}>
            {(p) => {
              const rows = shapRows(p.shap, p.scenario, meta?.materials ?? []);
              const max = Math.max(1, ...rows.map((r) => Math.abs(r.contribution)));
              return (
                <div className="space-y-5">
                  {rows.map((r) => (
                    <div key={r.text}>
                      <p className="text-[14px] text-text">{r.text}</p>
                      <div className="relative mt-2 h-2 rounded bg-white/5">
                        <div className="absolute inset-y-0 left-1/2 w-px bg-white/25" />
                        <div className="absolute inset-y-0 rounded"
                          style={{
                            background: r.contribution > 0 ? "var(--danger)" : "var(--cool)",
                            width: `${(Math.abs(r.contribution) / max) * 50}%`,
                            left: r.contribution > 0 ? "50%" : `${50 - (Math.abs(r.contribution) / max) * 50}%`,
                          }} />
                      </div>
                    </div>
                  ))}
                  <p className="num border-t border-white/10 pt-3 text-[12px] text-dim">
                    Starting point {Math.round(p.shap_base)} → this scenario {Math.round(p.risk_index)}/100 · red raises risk, cyan lowers it
                  </p>
                </div>
              );
            }}
          </PanelShell>
        </div>
      </div>
    </section>
  );
}
