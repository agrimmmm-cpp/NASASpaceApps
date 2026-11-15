// Sticky HUD bar: the live scenario, always visible while scrolling — and every value is a control.
// Click a value to open a small panel (dropdown or slider bound to /api/meta), so you can change O₂ while looking
// at the Danger zone or the risk dial and watch it react. Esc / outside click closes the panel.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store/useStore";
import { dpForStep, fmtGravity } from "../lib/format";
import type { RangeInfo, ScenarioNumberKey } from "../types";

type Key = "vehicle" | "material" | ScenarioNumberKey;

function Popover({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (!ref.current?.parentElement?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div ref={ref} className="glass absolute left-0 top-full z-50 mt-2 w-72 rounded-xl p-4 shadow-2xl [animation:fadein_150ms_ease]">
      {children}
    </div>
  );
}

function RangeControl({ range, value, unit, onChange, marks }: {
  range: RangeInfo; value: number; unit: string; onChange: (v: number) => void; marks?: { value: number; label: string }[];
}) {
  const dp = dpForStep(range.step);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="num text-[22px] font-bold text-white">{value.toFixed(dp)}<span className="ml-1 text-[13px] text-dim">{unit}</span></span>
        <span className="num text-[11px] text-dim">{range.min}–{range.max}</span>
      </div>
      <input type="range" autoFocus className="mt-3 w-full" min={range.min} max={range.max} step={range.step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      {marks && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {marks.map((m) => (
            <button key={m.value} onClick={() => onChange(m.value)}
              className={`num rounded-full border px-2.5 py-1 text-[11px] ${Math.abs(m.value - value) < 0.005 ? "border-cool bg-cool/15 text-cool" : "border-white/15 text-dim hover:text-white"}`}>
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Item({ k, label, value, color = "text-white", open, setOpen, children }: {
  k: Key; label: string; value: string; color?: string; open: Key | null; setOpen: (k: Key | null) => void; children: ReactNode;
}) {
  return (
    <span className="relative">
      <button onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k} aria-haspopup="dialog"
        className={`group whitespace-nowrap rounded-md px-1.5 py-0.5 transition hover:bg-white/10 ${open === k ? "bg-white/10" : ""}`}>
        <span className="text-dim">{label}: </span>
        <span className={`font-semibold ${color} underline decoration-dotted decoration-white/25 underline-offset-4 group-hover:decoration-white/60`}>{value}</span>
        <span className="ml-1 text-[10px] text-dim" aria-hidden>▾</span>
      </button>
      {open === k && <Popover onClose={() => setOpen(null)}>{children}</Popover>}
    </span>
  );
}

export function TelemetryBar() {
  const s = useStore();
  const meta = s.meta.data;
  const [open, setOpen] = useState<Key | null>(null);
  if (!meta || s.material === undefined) return null;
  const vehicle = meta.vehicles.find((v) => v.id === s.vehicle_id)?.label ?? "Custom";
  const material = meta.materials.find((m) => m.id === s.material)?.label ?? s.material;
  const r = meta.ranges;
  const close = () => setOpen(null);

  const Dot = () => <span className="text-white/30">·</span>;

  return (
    <div className="sticky top-20 z-40 border-b border-cool/20 bg-[#070B14]/95 px-6 py-2 md:px-10">
      <div className="num mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px]">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <Item open={open} setOpen={setOpen} k="vehicle" label="Spacecraft" value={vehicle}>
            <p className="label mb-2">Spacecraft preset</p>
            <div className="grid gap-1.5">
              {meta.vehicles.map((v) => (
                <button key={v.id} onClick={() => { s.applyVehicle(v.id); close(); }} title={v.note}
                  className={`rounded-lg border px-3 py-2 text-left text-[13px] ${v.id === s.vehicle_id ? "border-cool bg-cool/10 text-white" : "border-white/10 text-dim hover:text-white"}`}>
                  <span className="font-semibold">{v.label}</span>
                  <span className="block text-[11px] text-dim">{v.o2_percent}% O₂ · {v.pressure_kpa} kPa · {fmtGravity(v.gravity_g)}</span>
                </button>
              ))}
            </div>
          </Item>
          <Dot />
          <Item open={open} setOpen={setOpen} k="material" label="Material" value={material}>
            <p className="label mb-2">Material</p>
            <div className="grid gap-1.5">
              {meta.materials.map((m) => (
                <button key={m.id} onClick={() => { s.setScenario({ material: m.id }); close(); }}
                  className={`rounded-lg border px-3 py-2 text-left text-[13px] ${m.id === s.material ? "border-cool bg-cool/10 text-white" : "border-white/10 text-dim hover:text-white"}`}>
                  {m.label} <span className="text-[11px] text-dim">· {m.fuel_type}</span>
                </button>
              ))}
            </div>
          </Item>
          <Dot />
          <Item open={open} setOpen={setOpen} k="o2_percent" label="O₂" value={`${s.o2_percent}%`} color="text-cool">
            <p className="label mb-2">Oxygen</p>
            <RangeControl range={r.o2_percent} unit="%" value={s.o2_percent!} onChange={(v) => s.setScenario({ o2_percent: v })} />
          </Item>
          <Dot />
          <Item open={open} setOpen={setOpen} k="pressure_kpa" label="Pressure" value={`${s.pressure_kpa} kPa`}>
            <p className="label mb-2">Cabin pressure</p>
            <RangeControl range={r.pressure_kpa} unit="kPa" value={s.pressure_kpa!} onChange={(v) => s.setScenario({ pressure_kpa: v })} />
          </Item>
          <Dot />
          <Item open={open} setOpen={setOpen} k="airflow_cm_s" label="Airflow" value={`${s.airflow_cm_s} cm/s`} color="text-[#FFB873]">
            <p className="label mb-2">Ventilation airflow</p>
            <RangeControl range={r.airflow_cm_s} unit="cm/s" value={s.airflow_cm_s!} onChange={(v) => s.setScenario({ airflow_cm_s: v })} />
          </Item>
          <Dot />
          <Item open={open} setOpen={setOpen} k="gravity_g" label="Gravity" value={fmtGravity(s.gravity_g)} color="text-[#B7EDFF]">
            <p className="label mb-2">Gravity</p>
            <RangeControl range={r.gravity_g} unit="g" value={s.gravity_g!} onChange={(v) => s.setScenario({ gravity_g: v })}
              marks={meta.gravity_marks.map((m) => ({ value: m.value, label: `${m.value} g ${m.label}` }))} />
          </Item>
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
