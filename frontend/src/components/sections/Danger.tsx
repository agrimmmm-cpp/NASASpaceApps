// Section 4: "How dangerous is my fire, and what would make it safer?" — written for non-experts.
//   1. a one-line verdict in plain words (zone name + score)
//   2. a "what would make it safer" suggestion read off the model's own 20×20 map, with a Try-it button
//   3. the map (I-07, axes from the response) labelled with plain zone names, a YOU marker and plain axes
//   4. what pushes the risk up or down, in words (05 §8), plus the "average scenario" baseline
// Risk values are never recomputed here (I-06): the verdict and suggestion read the API's numbers.
import { useMemo, useState } from "react";
import { useStore } from "../../store/useStore";
import { BAND_COLOR, BAND_RANK, PLAIN_BAND, bandFor } from "../../lib/bands";
import { shapRows } from "../../lib/shapText";
import { PanelShell } from "../common/PanelShell";
import { Reveal, SectionGlow } from "../common/Reveal";
import type { Heatmap, Meta, RiskBand } from "../../types";

/** Fractional index of v within an ascending axis array (crosshair uses the response's own axes, 05 §5). */
function fracIndex(axis: number[], v: number) {
  if (v <= axis[0]) return 0;
  for (let i = 1; i < axis.length; i++) {
    if (v <= axis[i]) return i - 1 + (v - axis[i - 1]) / (axis[i] - axis[i - 1]);
  }
  return axis.length - 1;
}
const nearestIdx = (axis: number[], v: number) => Math.min(axis.length - 1, Math.max(0, Math.round(fracIndex(axis, v))));

/** Does airflow change anything on this map? (On the NASA FLEX data every test was in still air.) */
const airflowFlat = (h: Heatmap) => h.risk[0].every((_, j) => Math.max(...h.risk.map((r) => r[j])) - Math.min(...h.risk.map((r) => r[j])) < 0.5);

interface Suggestion { o2: number; air: number; risk: number; band: RiskBand; text: string }

/** The closest point on the map that is in a safer zone than you; otherwise the lowest-risk point. */
function saferOption(h: Heatmap, meta: Meta, o2: number, air: number, flat: boolean): Suggestion | null {
  const i0 = nearestIdx(h.airflow_values, air), j0 = nearestIdx(h.o2_values, o2);
  const here = bandFor(h.risk[i0][j0], meta.risk_bands);
  let best: { i: number; j: number; d: number } | null = null;
  h.risk.forEach((row, i) => row.forEach((v, j) => {
    if (BAND_RANK[bandFor(v, meta.risk_bands)] >= BAND_RANK[here]) return;
    if (flat && i !== i0) return; // airflow doesn't matter: only suggest an oxygen change
    const d = Math.hypot((j - j0) / row.length, (i - i0) / h.risk.length);
    if (!best || d < best.d) best = { i, j, d };
  }));
  if (!best) {
    // no safer zone on this map: fall back to the lowest-risk point, if it's meaningfully lower than where you are
    let lo: { i: number; j: number; v: number } | null = null;
    h.risk.forEach((row, i) => row.forEach((v, j) => {
      if (flat && i !== i0) return;
      if (!lo || v < lo.v) lo = { i, j, v };
    }));
    if (!lo || (lo as { v: number }).v > h.risk[i0][j0] - 3) return null;
    best = { i: (lo as { i: number }).i, j: (lo as { j: number }).j, d: 0 };
  }
  const { i, j } = best as { i: number; j: number };
  const newO2 = Math.round(h.o2_values[j] * 2) / 2, newAir = Math.round(h.airflow_values[i]);
  const parts: string[] = [];
  if (j !== j0) parts.push(`${newO2 < o2 ? "lower" : "raise"} oxygen to ${newO2}%`);
  if (i !== i0) parts.push(`${newAir < air ? "reduce" : "increase"} airflow to ${newAir} cm/s`);
  const text = parts.join(" and ").replace(/^./, (c) => c.toUpperCase());
  return { o2: newO2, air: newAir, risk: h.risk[i][j], band: bandFor(h.risk[i][j], meta.risk_bands), text };
}

function HeatmapSvg({ h, meta, o2, air, flat, onPick }: { h: Heatmap; meta: Meta; o2: number; air: number; flat: boolean; onPick: (o2: number, air: number) => void }) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const nx = h.o2_values.length, ny = h.airflow_values.length;
  const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const W = 400, H = 280, cw = W / nx, ch = H / ny;
  const bands = useMemo(() => h.risk.map((row) => row.map((v) => bandFor(v, meta.risk_bands))), [h, meta]);
  // plain zone name at the centre of each zone that appears on the map
  const zones = useMemo(() => {
    const acc = new Map<RiskBand, { x: number; y: number; n: number }>();
    bands.forEach((row, i) => row.forEach((b, j) => {
      const a = acc.get(b) ?? { x: 0, y: 0, n: 0 };
      a.x += j; a.y += i; a.n++; acc.set(b, a);
    }));
    return [...acc.entries()].filter(([, a]) => a.n >= 6).map(([b, a]) => ({ b, x: (a.x / a.n + 0.5) * cw, y: H - (a.y / a.n + 0.5) * ch }));
  }, [bands, cw, ch]);
  const cx = (fracIndex(h.o2_values, o2) + 0.5) * cw;
  const cy = H - (fracIndex(h.airflow_values, air) + 0.5) * ch;
  const hv = hover && { risk: h.risk[hover.i][hover.j], o2: h.o2_values[hover.j], air: h.airflow_values[hover.i], band: bands[hover.i][hover.j] };
  return (
    <div>
      <div className="flex gap-2">
        <div className="flex w-6 flex-col items-center justify-between py-1 text-[11px] text-dim">
          <span className="whitespace-nowrap [writing-mode:vertical-rl] rotate-180">strong breeze ↑</span>
          <span className="label whitespace-nowrap [writing-mode:vertical-rl] rotate-180">Airflow</span>
          <span className="whitespace-nowrap [writing-mode:vertical-rl] rotate-180">still air</span>
        </div>
        <div className="relative flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-white/10 bg-black/60" onMouseLeave={() => setHover(null)}>
            <defs>
              {/* thermal-camera look: blur the 20×20 cells into smooth heat, clipped to the frame */}
              <filter id="heat-blur" x="0" y="0" width="100%" height="100%"><feGaussianBlur stdDeviation={cw * 0.7} /></filter>
              <clipPath id="heat-clip"><rect width={W} height={H} rx="10" /></clipPath>
            </defs>
            <g clipPath="url(#heat-clip)">
              <g filter="url(#heat-blur)">
                {h.risk.map((row, i) => row.map((v, j) => (
                  <rect key={`${i}-${j}`} x={j * cw - 1} y={H - (i + 1) * ch - 1} width={cw + 2} height={ch + 2}
                    fill={BAND_COLOR[bands[i][j]]} opacity={0.35 + 0.6 * (v / 100)} />
                )))}
              </g>
              {/* faint sensor grid + a slow scan line */}
              {Array.from({ length: nx - 1 }, (_, k) => <line key={`gx${k}`} x1={(k + 1) * cw} x2={(k + 1) * cw} y1={0} y2={H} stroke="rgba(0,0,0,0.18)" strokeWidth="0.5" />)}
              {Array.from({ length: ny - 1 }, (_, k) => <line key={`gy${k}`} x1={0} x2={W} y1={(k + 1) * ch} y2={(k + 1) * ch} stroke="rgba(0,0,0,0.18)" strokeWidth="0.5" />)}
            </g>
            {/* invisible cells on top keep hover + click-to-try exact */}
            {h.risk.map((row, i) => row.map((_, j) => (
              <rect key={`hit${i}-${j}`} x={j * cw} y={H - (i + 1) * ch} width={cw} height={ch} fill="transparent"
                onMouseEnter={() => setHover({ i, j })} onClick={() => onPick(h.o2_values[j], h.airflow_values[i])} className="cursor-pointer" />
            )))}
            {zones.map((z) => (
              <text key={z.b} x={z.x} y={z.y} textAnchor="middle" dominantBaseline="middle" fontSize="15" fontWeight="800" letterSpacing="3"
                fill="#fff" fillOpacity="0.9" style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.55)", strokeWidth: 4 }} pointerEvents="none">
                {PLAIN_BAND[z.b].toUpperCase()}
              </text>
            ))}
            <g pointerEvents="none">
              <circle cx={cx} cy={cy} r="13" fill="rgba(0,0,0,0.35)" stroke="#fff" strokeWidth="2" />
              <circle cx={cx} cy={cy} r="4" fill="#fff" />
              <g transform={`translate(${Math.min(cx + 16, W - 44)} ${Math.max(cy - 16, 14)})`}>
                <rect x="0" y="-11" width="40" height="20" rx="10" fill="#fff" />
                <text x="20" y="3" textAnchor="middle" fontSize="11" fontWeight="800" fill="#070B14">YOU</text>
              </g>
            </g>
          </svg>
          {/* animated overlays as plain HTML (transform/opacity only) so the blurred heat layer is never re-rendered */}
          {!reduced && (
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
              <div className="scan-line h-10 w-full bg-gradient-to-b from-transparent via-white/15 to-transparent" style={{ ["--scan-h" as string]: "32rem" }} />
              <span className="ping-ring absolute h-7 w-7 rounded-full border-2 border-white" style={{ left: `${(cx / W) * 100}%`, top: `${(cy / H) * 100}%` }} />
            </div>
          )}
          {hv && (
            <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-white/15 bg-[#070B14]/90 px-3 py-1.5 text-[12px]">
              <span className="font-semibold" style={{ color: BAND_COLOR[hv.band] }}>{PLAIN_BAND[hv.band]} · {Math.round(hv.risk)}/100</span>
              <span className="num ml-2 text-dim">{hv.o2.toFixed(1)}% O₂{!flat && ` · ${hv.air.toFixed(0)} cm/s`}</span>
              <span className="block text-[11px] text-dim">click to try this mix</span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex justify-between pl-8 text-[11px] text-dim">
        <span>← less oxygen ({h.o2_values[0]}%)</span><span className="label">Oxygen in the air</span><span>more oxygen ({h.o2_values[nx - 1]}%) →</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 pl-8">
        {meta.risk_bands.map((b) => (
          <span key={b.band} className="flex items-center gap-2 text-[12px]">
            <span className="h-3 w-3 rounded-sm" style={{ background: BAND_COLOR[b.band] }} />
            <span className="font-semibold" style={{ color: BAND_COLOR[b.band] }}>{PLAIN_BAND[b.band]}</span>
            <span className="num text-dim">{b.min}–{b.max}</span>
          </span>
        ))}
      </div>
      {flat && (
        <p className="mt-3 pl-8 text-[12px] text-[#FFB873]">
          Airflow doesn't change the risk here: in this data every test was done in still air, so only oxygen matters on this map.
        </p>
      )}
    </div>
  );
}

const amount = (v: number) => (Math.abs(v) < 4 ? "a little" : Math.abs(v) < 10 ? "noticeably" : "a lot");

export function Danger() {
  const s = useStore();
  const meta = s.meta.data;
  const p = s.prediction.data, h = s.heatmap.data;
  const flat = h ? airflowFlat(h) : false;
  const tip = h && meta && s.o2_percent !== undefined ? saferOption(h, meta, s.o2_percent, s.airflow_cm_s!, flat) : null;
  return (
    <section id="danger" className="relative z-10 flex min-h-screen flex-col justify-center px-6 py-20 md:px-12">
      <SectionGlow colors={["#FF3B3B", "#FF6A1A"]} />
      <div className="mx-auto w-full max-w-6xl">
        <span className="eyebrow text-cool">Danger zone</span>
        <h2 className="mt-3 font-space text-4xl font-bold tracking-tight text-white md:text-5xl">How dangerous is this fire?</h2>

        {/* 1. verdict + 2. safer option */}
        <Reveal>
        {p ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-12">
            <div className="glass flex items-center gap-5 rounded-2xl p-5 lg:col-span-7">
              <span className="num flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold"
                style={{ color: BAND_COLOR[p.risk_band], background: `${BAND_COLOR[p.risk_band]}1f`, boxShadow: `inset 0 0 0 1px ${BAND_COLOR[p.risk_band]}66` }}>
                {Math.round(p.risk_index)}
              </span>
              <p className="text-[17px] leading-snug text-text">
                At <b className="text-white">{p.scenario.o2_percent}% oxygen</b>{!flat && <> and <b className="text-white">{p.scenario.airflow_cm_s} cm/s airflow</b></>}, this fire is in the{" "}
                <b style={{ color: BAND_COLOR[p.risk_band] }}>{PLAIN_BAND[p.risk_band].toUpperCase()}</b> zone
                <span className="text-dim"> ({Math.round(p.risk_index)} out of 100).</span>
              </p>
            </div>
            <div className="glass flex items-center gap-4 rounded-2xl p-5 lg:col-span-5">
              <span className="text-2xl" aria-hidden>🛡️</span>
              <div className="min-w-0 flex-1">
                <p className="label">What would make it safer?</p>
                {p.risk_band === "low" ? (
                  <p className="mt-1 text-[15px] text-white">Already in the Safe zone.</p>
                ) : tip ? (
                  <p className="mt-1 text-[15px] text-white">
                    {tip.text} → <b style={{ color: BAND_COLOR[tip.band] }}>{Math.round(tip.risk)}/100</b>
                    <span className="text-dim"> ({tip.band === p.risk_band ? `still ${PLAIN_BAND[tip.band]}, the lowest on this map` : PLAIN_BAND[tip.band]})</span>
                  </p>
                ) : (
                  <p className="mt-1 text-[15px] text-dim">You're already near the lowest risk on this map.</p>
                )}
              </div>
              {tip && p.risk_band !== "low" && (
                <button onClick={() => s.setScenario({ o2_percent: tip.o2, airflow_cm_s: tip.air })}
                  className="num shrink-0 rounded-full border border-cool/60 px-4 py-1.5 text-[12px] font-semibold uppercase tracking-wider text-cool hover:bg-cool/10">
                  Try it
                </button>
              )}
            </div>
          </div>
        ) : <div className="skeleton mt-6 h-24 rounded-2xl" />}
        </Reveal>

        {/* 3. map + 4. drivers */}
        <Reveal delay={120} className="mt-6 grid items-start gap-6 lg:grid-cols-12">
          <PanelShell title="Risk map" subtitle={h ? `Every oxygen${flat ? "" : " and airflow"} mix at ${h.pressure_kpa} kPa and ${h.gravity_g} g · click anywhere to try it` : undefined}
            state={s.heatmap} onRetry={() => s.retry("heatmap")} className="lg:col-span-7"
            skeleton={<div className="skeleton aspect-[4/3] w-full" />}>
            {(hm) => meta && <HeatmapSvg h={hm} meta={meta} o2={s.o2_percent!} air={s.airflow_cm_s!} flat={flat}
              onPick={(o2, air) => s.setScenario({ o2_percent: Math.round(o2 * 2) / 2, airflow_cm_s: Math.round(air) })} />}
          </PanelShell>
          <PanelShell title="What's pushing the risk" subtitle="Compared with an average scenario" state={s.prediction} onRetry={() => s.retry("prediction")} className="lg:col-span-5"
            isEmpty={(pp) => pp.shap.length === 0}
            empty={<p className="text-sm text-dim">Explanation unavailable for this scenario.</p>}>
            {(pp) => {
              const rows = shapRows(pp.shap, pp.scenario, meta?.materials ?? []);
              const max = Math.max(1, ...rows.map((r) => Math.abs(r.contribution)));
              return (
                <div className="space-y-4">
                  {rows.map((r) => {
                    const up = r.contribution > 0;
                    return (
                      <div key={r.text}>
                        <p className="text-[14px] text-text">
                          <b className="text-white">{r.label}</b>{" "}
                          {Math.abs(r.contribution) < 0.5 ? <span className="text-dim">barely matters</span>
                            : <>pushes risk <b style={{ color: up ? "var(--danger)" : "var(--cool)" }}>{up ? "up" : "down"}</b> {amount(r.contribution)}</>}
                          <span className="num ml-1 text-[12px] text-dim">({up ? "+" : "−"}{Math.abs(r.contribution).toFixed(Math.abs(r.contribution) < 1 ? 1 : 0)})</span>
                        </p>
                        <div className="relative mt-1.5 h-2 rounded bg-white/5">
                          <div className="absolute inset-y-0 left-1/2 w-px bg-white/25" />
                          <div className="absolute inset-y-0 rounded"
                            style={{
                              background: up ? "var(--danger)" : "var(--cool)",
                              width: `${(Math.abs(r.contribution) / max) * 50}%`,
                              left: up ? "50%" : `${50 - (Math.abs(r.contribution) / max) * 50}%`,
                            }} />
                        </div>
                      </div>
                    );
                  })}
                  <p className="border-t border-white/10 pt-3 text-[13px] text-dim">
                    An average scenario scores <b className="text-white">{Math.round(pp.shap_base)}</b>; yours scores{" "}
                    <b style={{ color: BAND_COLOR[pp.risk_band] }}>{Math.round(pp.risk_index)}</b>. Red pushes risk up, blue pulls it down.
                  </p>
                </div>
              );
            }}
          </PanelShell>
        </Reveal>
      </div>
    </section>
  );
}
