// Section 1: question + the glass control card over Earth's limb. Options and ranges all from /api/meta.
import { useStore } from "../../store/useStore";
import { EarthLimb } from "../space/EarthLimb";
import { Slider } from "../common/Slider";

const selectCls = "h-12 w-full cursor-pointer rounded-lg border border-white/20 bg-[#0A0E1A]/95 px-4 text-[15px] text-text focus:outline-none focus:ring-1 focus:ring-cool";

export function Hero() {
  const s = useStore();
  const meta = s.meta.data;
  const r = meta?.ranges;
  return (
    <section id="overview" className="relative flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden pb-10 pt-16">
      <EarthLimb />
      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <h1 className="font-space text-5xl font-bold tracking-tight text-white md:text-6xl">What does fire do in space?</h1>
        <p className="mt-3 text-lg text-dim md:text-xl">Pick a spacecraft, a material, and an atmosphere.</p>
      </div>
      <div className="relative z-10 mx-auto mt-12 w-full max-w-4xl px-4">
        <div className="glass rounded-2xl p-6 shadow-2xl md:p-8">
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
        <a href="#gravity" className="num mt-6 block text-center text-[11px] uppercase tracking-[0.24em] text-dim hover:text-white">
          Scroll to change gravity ↓
        </a>
      </div>
    </section>
  );
}
