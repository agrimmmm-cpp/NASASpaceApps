// A slider bound to a meta.ranges entry — min/max/step and end labels are never hard-coded.
import type { RangeInfo } from "../../types";
import { dpForStep } from "../../lib/format";

export function Slider({ label, unit, range, value, onChange, accent = "var(--cool)" }: {
  label: string; unit: string; range: RangeInfo; value: number; onChange: (v: number) => void; accent?: string;
}) {
  const dp = dpForStep(range.step);
  return (
    <label className="glass-subtle flex flex-col gap-2 rounded-xl p-4">
      <span className="flex items-center justify-between">
        <span className="label">{label}</span>
        <span className="num text-[16px] font-semibold" style={{ color: accent }}>{value.toFixed(dp)} {unit}</span>
      </span>
      <input type="range" min={range.min} max={range.max} step={range.step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} style={{ accentColor: accent }} />
      <span className="num flex justify-between text-[11px] text-dim">
        <span>{range.min} {unit}</span><span>{range.max} {unit}</span>
      </span>
    </label>
  );
}
