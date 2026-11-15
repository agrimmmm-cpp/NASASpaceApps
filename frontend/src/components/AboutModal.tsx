// About-the-Data modal (05 §10). Copy lives in content/about.ts (Track C); every number and data-dependent
// limitation comes from /api/meta, so switching mock ↔ NASA data updates this text automatically.
import { useEffect, useRef } from "react";
import { useStore } from "../store/useStore";
import type { Meta } from "../types";
import {
  ABOUT_TITLE, ALWAYS_LIMITS, EXPERIMENTS, MODEL_TEXT, RISK_HELP, SCORE_HELP, SOURCES, SOURCES_NOTE, WHY_MICROGRAVITY,
} from "../content/about";

export function verdict(v: number | null, weak: number, strong: number) {
  if (v === null) return { word: "not available", color: "var(--text-dim)" };
  if (v < weak) return { word: "weak", color: "var(--fire-hot)" };
  if (v < strong) return { word: "moderate", color: "var(--fire)" };
  return { word: "strong", color: "var(--cool)" };
}

export function dataLimits(meta: Meta): string[] {
  const caps = meta.model.capabilities;
  const out: string[] = [];
  if (meta.data_source === "mock") out.push("This is MOCK data generated to look plausible — not real measurements. Switch to NASA data for real runs.");
  if (!caps.gravity_effect) out.push("Every run is in microgravity (0 g). The data can't show how gravity changes a flame, so predictions don't change with gravity, and the Earth-vs-Space comparison (where shown) is SIMULATED from mock data and labelled that way.");
  if (!caps.flame_temp) out.push("No flame temperatures were recorded, so temperature is shown as “—”.");
  if (meta.data_source === "nasa" && meta.materials.some((m) => m.fuel_type === "droplet"))
    out.push("For FLEX droplets the rate is a burning-rate constant in mm²/s (how fast the droplet shrinks), not a flame-spread speed in mm/s.");
  if (meta.data_source === "nasa")
    out.push("Some values are documented assumptions: FLEX airflow is recorded as 0 cm/s (still chamber) and the Saffire-II cabin pressure as 100.6 kPa.");
  out.push(`Predictions are only offered for materials with enough runs: ${meta.materials.map((m) => m.label).join(", ")}.`);
  return out;
}

export function AboutModal() {
  const open = useStore((s) => s.aboutOpen);
  const setOpen = useStore((s) => s.setAboutOpen);
  const meta = useStore((s) => s.meta.data);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, setOpen]);
  if (!open) return null;

  const m = meta?.model;
  const r2 = m?.metrics.spread_r2 ?? null, auc = m?.metrics.extinction_auc ?? null, tr2 = m?.metrics.temp_r2 ?? null;
  const vR2 = verdict(r2, 0.3, 0.6), vAuc = verdict(auc, 0.65, 0.8);
  const exps = (meta?.experiments ?? []).map((e) => ({ id: e, ...(EXPERIMENTS[e] ?? { name: e, where: "", what: "" }) }));
  const nasa = meta?.data_source === "nasa";

  const H = ({ n, children }: { n: number; children: string }) => (
    <h3 className="flex items-center gap-3 font-space text-xl font-bold text-white">
      <span className="num flex h-7 w-7 items-center justify-center rounded-full border border-cool/50 text-[12px] text-cool">{n}</span>{children}
    </h3>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.stopPropagation()}
        className="glass relative w-full max-w-3xl rounded-3xl p-6 shadow-2xl md:p-10 [animation:fadein_250ms_ease]">
        <button ref={close} onClick={() => setOpen(false)} aria-label="Close"
          className="num absolute right-5 top-5 rounded-full border border-white/15 px-3 py-1 text-[12px] text-dim hover:text-white">✕ Close</button>
        <span className="eyebrow text-cool">Fire Command: Zero-G</span>
        <h2 id="about-title" className="mt-2 font-space text-3xl font-bold text-white md:text-4xl">{ABOUT_TITLE}</h2>
        {meta && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[14px] text-dim">
            <span className={`num rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${nasa ? "border-cool text-cool" : "border-dashed border-mock text-mock"}`}>
              {nasa ? "NASA data" : "Mock data"}
            </span>
            {meta.n_runs} runs loaded · {meta.materials.length} predictable material{meta.materials.length === 1 ? "" : "s"} · model {m?.stub ? "stub" : "trained"}
          </p>
        )}

        <div className="mt-8 space-y-9">
          <section>
            <H n={1}>{WHY_MICROGRAVITY.heading}</H>
            <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-text/90">{WHY_MICROGRAVITY.paras.map((p) => <p key={p}>{p}</p>)}</div>
          </section>

          <section>
            <H n={2}>The experiments</H>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {exps.map((e) => (
                <div key={e.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-semibold text-white">{e.name}</p>
                  {e.where && <p className="num mt-0.5 text-[11px] uppercase tracking-wider text-cool">{e.where}</p>}
                  {e.what && <p className="mt-2 text-[14px] leading-relaxed text-dim">{e.what}</p>}
                </div>
              ))}
            </div>
          </section>

          <section>
            <H n={3}>The data</H>
            {nasa ? (
              <>
                <ul className="mt-3 space-y-1.5 text-[14px]">
                  {SOURCES.map((s) => (
                    <li key={s.doi}>
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-cool underline-offset-2 hover:underline">{s.label}</a>
                      <span className="num text-dim"> · doi:{s.doi}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[13px] text-dim">{SOURCES_NOTE}</p>
              </>
            ) : (
              <p className="mt-3 text-[14px] text-dim">
                Running on generated mock data shaped like the real experiments, so every feature can be shown. Drop the real NASA table in
                {" "}<code className="num text-text">data/combustion_runs.csv</code> and the badge flips to NASA DATA.
              </p>
            )}
          </section>

          <section>
            <H n={4}>The model</H>
            <p className="mt-3 text-[15px] leading-relaxed text-text/90">{MODEL_TEXT}</p>
            {m && (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[["Rate R²", r2, vR2, SCORE_HELP.r2], ["Extinction AUC", auc, vAuc, SCORE_HELP.auc]].map(([label, v, vd, help]) => (
                    <div key={label as string} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="label">{label as string}</p>
                      {/* +1e-9: the API sends 3-dp values like 0.215, which binary floats store as 0.21499…; round half-up like the docs */}
                      <p className="num mt-1 text-3xl font-bold text-white">{v === null ? "—" : ((v as number) + 1e-9).toFixed(2)}</p>
                      <p className="text-[13px] font-semibold" style={{ color: (vd as { color: string }).color }}>{(vd as { word: string }).word}</p>
                      <p className="mt-1 text-[12px] text-dim">{help as string}</p>
                    </div>
                  ))}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="label">Trained on</p>
                    <p className="num mt-1 text-3xl font-bold text-white">{m.metrics.n_train ?? "—"}</p>
                    <p className="text-[13px] text-dim">runs{tr2 === null ? " · no temperature model" : ` · temp R² ${tr2.toFixed(2)}`}</p>
                    <p className="mt-1 text-[12px] text-dim">Scores from 5-fold cross-validation.</p>
                  </div>
                </div>
                {(vR2.word === "weak" || vAuc.word === "weak") && (
                  <p className="mt-3 rounded-lg border border-fire/40 bg-fire/10 px-3 py-2 text-[13px] text-fire">
                    These scores are weak: treat predictions as rough trends from a small dataset, not precise numbers.
                  </p>
                )}
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="label">Risk index</p>
                  <p className="num mt-1 text-[13px] text-text">
                    risk = 100 × ( {m.weights.spread} × rate ÷ {m.spread_ref_mm_s} + {m.weights.survival} × chance the flame keeps burning )
                  </p>
                  <p className="mt-1 text-[12px] text-dim">{RISK_HELP}</p>
                </div>
              </>
            )}
          </section>

          <section>
            <H n={5}>Limitations</H>
            <ul className="mt-3 space-y-2 text-[14px] leading-relaxed">
              {[...(meta ? dataLimits(meta) : []), ...ALWAYS_LIMITS].map((l) => (
                <li key={l} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fire" /><span className="text-text/90">{l}</span></li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
