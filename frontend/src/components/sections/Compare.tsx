// Section 5: Earth vs space split. Three separate numbers per side — never one shared axis for K and mm/s (05 §4).
import { useStore } from "../../store/useStore";
import { SectionGlow } from "../common/Reveal";
import { fmtPct, fmtSpread, fmtTemp } from "../../lib/format";
import { PanelShell } from "../common/PanelShell";
import { Flame } from "../space/Flame";
import type { CompareSide } from "../../types";

function Side({ s, title, tone, showTemp }: { s: CompareSide; title: string; tone: "cool" | "warm"; showTemp: boolean }) {
  const c = tone === "cool" ? "var(--cool)" : "#FFB873";
  return (
    <div className={`flex flex-col items-center rounded-2xl border p-8 ${tone === "cool" ? "border-cool/30 bg-cool/[0.04]" : "border-[#FFB873]/30 bg-[#FFB873]/[0.04]"}`}>
      <span className="num rounded border px-3 py-1 text-[12px] font-semibold uppercase tracking-widest" style={{ color: c, borderColor: c }}>{title}</span>
      <Flame gravity={s.gravity_g} intensity={s.risk_index / 100} size={180} />
      <dl className="grid w-full gap-4">
        {([["Spread rate", fmtSpread(s.spread_rate_mm_s)], showTemp ? ["Flame temperature", fmtTemp(s.flame_temp_k)] : null,
          ["Chance it goes out", fmtPct(s.extinction_probability)]].filter(Boolean) as string[][]).map(([k, v]) => (
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
  const meta = useStore((s) => s.meta.data);
  const material = useStore((s) => s.material);
  const caps = meta?.model.capabilities;
  // On data without 1 g runs the backend may answer from its mock reference model; it says so via data_source (I-09).
  const simulated = state.data?.data_source === "mock" && meta?.data_source !== "mock";
  const unavailable = caps?.gravity_effect === false && state.data !== null && !simulated;
  const label = meta?.materials.find((m) => m.id === material)?.label ?? material;
  return (
    <section id="earth-vs-space" className="relative z-10 flex min-h-screen flex-col justify-center px-6 py-24 md:px-12">
      <SectionGlow colors={["#3DD9FF", "#FF9A1F"]} />
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-12 text-center">
          <span className="eyebrow text-[#FFB873]">Earth vs space</span>
          <h2 className="mt-3 font-space text-4xl font-bold tracking-tight text-white md:text-5xl">The same fire, two worlds</h2>
          <p className="mx-auto mt-3 max-w-xl text-[17px] text-dim">Same material and atmosphere — only gravity changes.</p>
        </div>
        {unavailable ? (
          // 04 §3b / R-38: without runs at both 0 g and 1 g there's no gravity effect, and no simulated reference for this material
          <div className="glass mx-auto max-w-3xl rounded-2xl p-8 text-center">
            <p className="text-[17px] text-text">Not available for {label}.</p>
            <p className="mt-2 text-[15px] text-dim">
              Every run in the loaded {meta?.data_source === "nasa" ? "NASA " : ""}data is in microgravity, and there's no simulated comparison for this material.
            </p>
          </div>
        ) : (
        <>
        {simulated && (
          <div className="mx-auto mb-6 flex max-w-3xl items-start gap-3 rounded-xl border border-dashed border-mock/70 bg-mock/10 px-5 py-3 text-[14px] text-mock">
            <span className="num shrink-0 rounded border border-dashed border-mock px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">Simulated</span>
            <span>These numbers come from <b>mock data</b>, not NASA measurements. The NASA runs are all in microgravity, so they can't show an Earth comparison.</span>
          </div>
        )}
        <PanelShell title="Microgravity vs Earth" state={state} onRetry={() => retry("compare")}
          right={simulated ? <span className="num rounded border border-dashed border-mock px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-mock">Mock</span> : undefined}
          skeleton={<div className="grid gap-6 md:grid-cols-2"><div className="skeleton h-96" /><div className="skeleton h-96" /></div>}>
          {(c) => (
            <div className="grid gap-6 md:grid-cols-2">
              <Side s={c.microgravity} title={`In orbit · ${c.microgravity.gravity_g} g`} tone="cool" showTemp={simulated || caps?.flame_temp !== false} />
              <Side s={c.earth} title={`On Earth · ${c.earth.gravity_g} g`} tone="warm" showTemp={simulated || caps?.flame_temp !== false} />
            </div>
          )}
        </PanelShell>
        </>
        )}
      </div>
    </section>
  );
}
