// One-page fire-safety mission report. Rendered off-screen and shown only when printing (index.css @media print),
// so "Download report" = the browser's print dialog → Save as PDF. Every value is what the API returned (I-06);
// limitations and outcome wording are shared with the About modal and the Experiments section.
import { useStore } from "../store/useStore";
import { dataLimits, verdict } from "./AboutModal";
import { outcomeText } from "./sections/Experiments";
import { passportUseful } from "./sections/Passport";
import { shapRows } from "../lib/shapText";
import { fmtCi, fmtGravity, fmtPct, fmtTemp, fmtTtc } from "../lib/format";
import { survivalProbability } from "../lib/survival";
import { rateLabel } from "../lib/units";
import { BAND_LABEL } from "../lib/bands";
import { ALWAYS_LIMITS } from "../content/about";
import type { Run } from "../types";

/** Opens the print dialog with a helpful default PDF filename. */
export function printReport() {
  const prev = document.title;
  const d = new Date().toISOString().slice(0, 10);
  document.title = `Fire-safety report – Fire Command Zero-G – ${d}`;
  const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
  window.addEventListener("afterprint", restore);
  window.print();
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <tr><td className="py-1 pr-4 text-[#555]">{k}</td><td className="py-1 font-semibold">{v}</td></tr>
);

export function MissionReport() {
  const s = useStore();
  const meta = s.meta.data, p = s.prediction.data, ins = s.insights.data, cmp = s.compare.data, pass = s.passport.data;
  if (!meta || !p) return null;
  const vehicle = meta.vehicles.find((v) => v.id === s.vehicle_id)?.label ?? "Custom";
  const mat = meta.materials.find((m) => m.id === p.scenario.material);
  const rate = rateLabel(meta.data_source, mat?.fuel_type);
  const byId = new Map((s.runs.data?.runs ?? []).map((r) => [r.run_id, r]));
  const closest = (ins?.retrieved_run_ids ?? []).map((id) => byId.get(id)).filter((r): r is Run => !!r);
  const m = meta.model;
  const showCompare = cmp && (m.capabilities.gravity_effect || cmp.data_source === "mock");
  const H = ({ children }: { children: string }) => <h2 className="mb-2 mt-6 border-b border-[#ccc] pb-1 text-[15px] font-bold">{children}</h2>;

  return (
    <div id="mission-report" className="mx-auto max-w-[780px] bg-white p-8 font-sans text-[12px] leading-snug text-black">
      <div className="flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <h1 className="text-[22px] font-bold">Fire-Safety Mission Report</h1>
          <p className="text-[#444]">Fire Command: Zero-G · NASA Space Apps · {new Date().toLocaleString()}</p>
        </div>
        <div className="text-right text-[11px]">
          <p className="font-bold">{meta.data_source === "nasa" ? "NASA DATA" : "MOCK DATA"}</p>
          <p className="text-[#444]">{meta.n_runs} runs · model {m.version}</p>
        </div>
      </div>

      <H>Scenario</H>
      <table><tbody>
        <Row k="Spacecraft" v={vehicle} />
        <Row k="Material" v={`${mat?.label ?? p.scenario.material} (${mat?.fuel_type ?? "?"})`} />
        <Row k="Oxygen" v={`${p.scenario.o2_percent}%`} />
        <Row k="Pressure" v={`${p.scenario.pressure_kpa} kPa`} />
        <Row k="Airflow" v={`${p.scenario.airflow_cm_s} cm/s`} />
        <Row k="Gravity" v={fmtGravity(p.scenario.gravity_g)} />
      </tbody></table>

      <H>Prediction</H>
      <table><tbody>
        <Row k="Risk index" v={`${Math.round(p.risk_index)} / 100 (${BAND_LABEL[p.risk_band]})`} />
        <Row k={rate.name} v={`${p.spread_rate_mm_s} ${rate.unit} (likely ${fmtCi(p.spread_rate_ci)}${p.ci_widened ? ", widened: sparse data" : ""})`} />
        <Row k="Chance the flame keeps burning" v={fmtPct(survivalProbability(p.extinction_probability))} />
        <Row k="Time to critical" v={`${fmtTtc(p.time_to_critical_s)} (to travel ${m.critical_length_mm} mm, illustrative)`} />
        {p.flame_temp_k !== null && <Row k="Flame temperature" v={fmtTemp(p.flame_temp_k)} />}
        <Row k="Matching experiment runs" v={p.matching_runs === 0 ? "0 — the model is extrapolating" : `${p.matching_runs}`} />
      </tbody></table>
      <p className="mt-1 text-[10px] text-[#555]">risk = 100 × ({m.weights.spread} × rate ÷ {m.spread_ref_mm_s} + {m.weights.survival} × chance the flame keeps burning) — a relative score, not a probability of loss.</p>

      {p.shap.length > 0 && (<>
        <H>Why this risk</H>
        <ul className="list-disc pl-5">{shapRows(p.shap, p.scenario, meta.materials).map((r) => <li key={r.text}>{r.text}</li>)}</ul>
      </>)}

      {showCompare && cmp && (<>
        <H>{cmp.data_source === "mock" ? "Microgravity vs Earth (SIMULATED — mock data)" : "Microgravity vs Earth"}</H>
        <table className="w-full"><thead><tr className="text-left text-[#555]"><th /><th>0 g</th><th>1 g</th></tr></thead><tbody>
          <tr><td className="py-0.5">{rate.name} ({rate.unit})</td><td>{cmp.microgravity.spread_rate_mm_s}</td><td>{cmp.earth.spread_rate_mm_s}</td></tr>
          <tr><td className="py-0.5">Flame temperature</td><td>{fmtTemp(cmp.microgravity.flame_temp_k)}</td><td>{fmtTemp(cmp.earth.flame_temp_k)}</td></tr>
          <tr><td className="py-0.5">Chance it goes out</td><td>{fmtPct(cmp.microgravity.extinction_probability)}</td><td>{fmtPct(cmp.earth.extinction_probability)}</td></tr>
        </tbody></table>
      </>)}

      {passportUseful(pass) && pass && (<>
        <H>Material passport (all materials, this cabin)</H>
        <table className="w-full text-[11px]">
          <thead><tr className="text-left text-[#555]"><th>Material</th><th>Grade</th><th>Risk</th><th>Keeps burning</th><th>Similar runs</th></tr></thead>
          <tbody>{[...pass.entries].sort((a, b) => a.risk_index - b.risk_index).map((e) => (
            <tr key={e.material} className="border-t border-[#eee]">
              <td className="py-0.5 font-semibold">{e.label}</td><td>{e.grade}</td><td>{Math.round(e.risk_index)}/100</td>
              <td>{fmtPct(survivalProbability(e.extinction_probability))}</td><td>{e.matching_runs === 0 ? "0 (extrapolated)" : e.matching_runs}</td>
            </tr>
          ))}</tbody>
        </table>
      </>)}

      {closest.length > 0 && (<>
        <H>Closest experiment runs</H>
        <table className="w-full text-[11px]">
          <thead><tr className="text-left text-[#555]"><th>Run</th><th>O₂</th><th>kPa</th><th>cm/s</th><th>g</th><th>{rate.short} ({rate.unit})</th><th>Outcome</th></tr></thead>
          <tbody>{closest.map((r) => (
            <tr key={r.run_id} className="border-t border-[#eee]">
              <td className="py-0.5 font-semibold">{r.run_id}</td><td>{r.o2_percent}%</td><td>{r.pressure_kpa}</td><td>{r.airflow_cm_s}</td><td>{r.gravity_g}</td>
              <td>{r.spread_rate_mm_s ?? "—"}</td><td>{outcomeText(r)}</td>
            </tr>
          ))}</tbody>
        </table>
      </>)}

      {ins && ins.insights.length > 0 && (<>
        <H>{`What the runs suggest (${ins.generated_by === "llm" ? "AI-written, citations checked" : "template"})`}</H>
        <ul className="list-disc pl-5">{ins.insights.map((x) => <li key={x.text}>{x.text} <span className="text-[#555]">[{x.cited_run_ids.join(", ")}]</span></li>)}</ul>
      </>)}

      <H>Model and limitations</H>
      <p>Rate R² {m.metrics.spread_r2 === null ? "—" : (m.metrics.spread_r2 + 1e-9).toFixed(2)} ({verdict(m.metrics.spread_r2, 0.3, 0.6).word}) ·
        Extinction AUC {m.metrics.extinction_auc === null ? "—" : (m.metrics.extinction_auc + 1e-9).toFixed(2)} ({verdict(m.metrics.extinction_auc, 0.65, 0.8).word}) ·
        trained on {m.metrics.n_train ?? "—"} runs</p>
      <ul className="mt-1 list-disc pl-5">{[...dataLimits(meta), ...ALWAYS_LIMITS].map((l) => <li key={l}>{l}</li>)}</ul>

      <p className="mt-6 border-t border-[#ccc] pt-2 text-[10px] text-[#555]">
        Generated by Fire Command: Zero-G, a NASA Space Apps research and education demo. Not operational fire-safety guidance.
        {meta.data_source === "nasa" && " Data: NASA Physical Sciences Informatics PSI-69 (FLEX) and PSI-99 (Saffire-II), CC0."}
      </p>
    </div>
  );
}
