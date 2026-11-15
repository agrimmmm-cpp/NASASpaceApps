// Section 5: Earth vs space split. Three separate numbers per side — never one shared axis for K and mm/s (05 §4).
import { useStore } from "../../store/useStore";
import { fmtPct, fmtSpread, fmtTemp } from "../../lib/format";
import { PanelShell } from "../common/PanelShell";
import { Flame } from "../space/Flame";
import type { CompareSide } from "../../types";

function Side({ s, title, tone }: { s: CompareSide; title: string; tone: "cool" | "warm" }) {
  const c = tone === "cool" ? "var(--cool)" : "#FFB873";
  return (
    <div className={`flex flex-col items-center rounded-2xl border p-8 ${tone === "cool" ? "border-cool/30 bg-cool/[0.04]" : "border-[#FFB873]/30 bg-[#FFB873]/[0.04]"}`}>
      <span className="num rounded border px-3 py-1 text-[12px] font-semibold uppercase tracking-widest" style={{ color: c, borderColor: c }}>{title}</span>
      <Flame gravity={s.gravity_g} intensity={s.risk_index / 100} size={180} />
      <dl className="grid w-full gap-4">
        {[["Spread rate", fmtSpread(s.spread_rate_mm_s)], ["Flame temperature", fmtTemp(s.flame_temp_k)],
          ["Chance it goes out", fmtPct(s.extinction_probability)]].map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between border-t border-white/10 pt-3">
            <dt className="label">{k}</dt><dd className="num text-3xl font-bold text-white">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Compare() {
  const state = useStore((s) => s.compare);
  const retry = useStore((s) => s.retry);
  return (
    <section id="earth-vs-space" className="relative z-10 flex min-h-screen flex-col justify-center px-6 py-24 md:px-12">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-12 text-center">
          <span className="eyebrow text-[#FFB873]">Earth vs space</span>
          <h2 className="mt-3 font-space text-4xl font-bold tracking-tight text-white md:text-5xl">The same fire, two worlds</h2>
          <p className="mx-auto mt-3 max-w-xl text-[17px] text-dim">Same material and atmosphere — only gravity changes.</p>
        </div>
        <PanelShell title="Microgravity vs Earth" state={state} onRetry={() => retry("compare")}
          skeleton={<div className="grid gap-6 md:grid-cols-2"><div className="skeleton h-96" /><div className="skeleton h-96" /></div>}>
          {(c) => (
            <div className="grid gap-6 md:grid-cols-2">
              <Side s={c.microgravity} title={`In orbit · ${c.microgravity.gravity_g} g`} tone="cool" />
              <Side s={c.earth} title={`On Earth · ${c.earth.gravity_g} g`} tone="warm" />
            </div>
          )}
        </PanelShell>
      </div>
    </section>
  );
}
