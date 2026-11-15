// Section 1: question + the glass control card over Earth's limb. Options and ranges all from /api/meta.
import { lazy, Suspense, useEffect, useState } from "react";
import { useStore } from "../../store/useStore";
import { EarthLimb } from "../space/EarthLimb";
import { ErrorBoundary } from "../common/ErrorBoundary";

// three.js is ~600 kB, so the globe is its own chunk, loaded after the page shows.
const Globe = lazy(() => import("../space/Globe"));

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
import { Slider } from "../common/Slider";

const selectCls = "h-12 w-full cursor-pointer rounded-lg border border-white/20 bg-[#0A0E1A]/95 px-4 text-[15px] text-text focus:outline-none focus:ring-1 focus:ring-cool";

export function Hero() {
  const s = useStore();
  const meta = s.meta.data;
  const r = meta?.ranges;
  const [webgl] = useState(hasWebGL);
  // hide the "drag / scroll" hint after the first drag on the globe or the first real scroll
  const [hintSeen, setHintSeen] = useState(false);
  useEffect(() => {
    if (hintSeen) return;
    const done = () => setHintSeen(true);
    const onScroll = () => { if (window.scrollY > 120) done(); };
    const onDown = (e: PointerEvent) => { if ((e.target as Element | null)?.closest?.("[aria-label^='3D Earth']")) done(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("pointerdown", onDown); };
  }, [hintSeen]);
  return (
    <section id="overview" className="relative flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden pb-10 pt-16">
      {webgl ? (
        <ErrorBoundary name="globe" fallback={<EarthLimb />}>
          <Suspense fallback={<EarthLimb />}><Globe vehicleId={s.vehicle_id} /></Suspense>
        </ErrorBoundary>
      ) : <EarthLimb />}
      {/* fade the globe into the next section — no hard edge */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-40 bg-gradient-to-b from-transparent to-[var(--space)]" />
      <div className="pointer-events-none relative z-10 mx-auto max-w-4xl px-6 text-center">
        <h1 className="font-space text-5xl font-bold tracking-tight text-white md:text-6xl">What does fire do in space?</h1>
        <p className="mt-3 text-lg text-dim md:text-xl">Pick a spacecraft, a material, and an atmosphere.</p>
      </div>
      <div className="pointer-events-none relative z-10 mx-auto mt-12 w-full max-w-4xl px-4">
        <div className="pointer-events-auto rounded-2xl border border-white/15 bg-[rgba(10,15,28,0.30)] p-6 shadow-2xl backdrop-blur-[6px] md:p-8">
          {!meta || s.material === undefined || !r ? (
            <div className="space-y-4"><div className="skeleton h-12" /><div className="skeleton h-24" /></div>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="label">Spacecraft</span>
                  <select className={selectCls} value={s.vehicle_id ?? ""} title={meta.vehicles.find((v) => v.id === s.vehicle_id)?.note}
                    onChange={(e) => e.target.value && s.applyVehicle(e.target.value)}>
                    {s.vehicle_id === null && <option value="">Custom</option>}
                    {meta.vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="label">Material</span>
                  <select className={selectCls} value={s.material} onChange={(e) => s.setScenario({ material: e.target.value })}>
                    {meta.materials.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-5 border-t border-white/10 pt-5 md:grid-cols-3">
                <Slider label="Oxygen (O₂)" unit="%" range={r.o2_percent} value={s.o2_percent!} onChange={(v) => s.setScenario({ o2_percent: v })} />
                <Slider label="Pressure" unit="kPa" range={r.pressure_kpa} value={s.pressure_kpa!} accent="#EAF0FA" onChange={(v) => s.setScenario({ pressure_kpa: v })} />
                <Slider label="Airflow" unit="cm/s" range={r.airflow_cm_s} value={s.airflow_cm_s!} accent="#FFB873" onChange={(v) => s.setScenario({ airflow_cm_s: v })} />
              </div>
            </>
          )}
        </div>
        {/* Light hint, no box: a dark glow behind the letters keeps it readable over the orbit ring without
            covering the Earth. Fades out once the visitor has dragged the globe or scrolled. */}
        <p className={`num mt-6 text-center text-[11px] uppercase tracking-[0.22em] text-white/70 transition-opacity duration-700 ${hintSeen ? "opacity-0" : "opacity-100"}`}
          style={{ textShadow: "0 0 6px rgba(3,5,11,0.95), 0 0 14px rgba(3,5,11,0.9)" }} aria-hidden={hintSeen}>
          Drag the Earth to spin it <span className="mx-2 text-white/30">·</span>
          <a href="#gravity" className={`${hintSeen ? "" : "pointer-events-auto"} hover:text-white`}>Scroll to change gravity ↓</a>
        </p>
      </div>
    </section>
  );
}
