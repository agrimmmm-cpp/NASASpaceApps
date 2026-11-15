// Sticky HUD bar: the live scenario, always visible while scrolling, with compact controls.
import { useStore } from "../store/useStore";
import { fmtGravity } from "../lib/format";

export function TelemetryBar() {
  const s = useStore();
  const meta = s.meta.data;
  if (!meta || s.material === undefined) return null;
  const vehicle = meta.vehicles.find((v) => v.id === s.vehicle_id)?.label ?? "Custom";
  const material = meta.materials.find((m) => m.id === s.material)?.label ?? s.material;
  const Item = ({ k, v, c = "text-white" }: { k: string; v: string; c?: string }) => (
    <span className="whitespace-nowrap"><span className="text-dim">{k}: </span><span className={`font-semibold ${c}`}>{v}</span></span>
  );
  return (
    <div className="sticky top-20 z-40 border-b border-cool/20 bg-[#070B14]/90 px-6 py-2.5 backdrop-blur-md md:px-10">
      <div className="num mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-1 text-[13px]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Item k="Spacecraft" v={vehicle} />
          <span className="text-white/30">·</span><Item k="Material" v={material} />
          <span className="text-white/30">·</span><Item k="O₂" v={`${s.o2_percent}%`} c="text-cool" />
          <span className="text-white/30">·</span><Item k="Pressure" v={`${s.pressure_kpa} kPa`} />
          <span className="text-white/30">·</span><Item k="Airflow" v={`${s.airflow_cm_s} cm/s`} c="text-[#FFB873]" />
          <span className="text-white/30">·</span><Item k="Gravity" v={fmtGravity(s.gravity_g)} c="text-[#B7EDFF]" />
        </div>
        {s.prediction.data && (
          <a href="#status" className="whitespace-nowrap text-dim hover:text-white">
            Risk <span className="font-semibold text-white">{Math.round(s.prediction.data.risk_index)}</span>/100
          </a>
        )}
      </div>
    </div>
  );
}
