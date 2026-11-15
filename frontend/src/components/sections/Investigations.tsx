// Investigation Explorer: the PSI combustion investigations, ranked by relevance to a habitat, with fire-safety pillars,
// side-by-side comparison, AI summaries (Ask Nova) and a CSV download of the run data behind the model.
import { useMemo, useState } from "react";
import { useStore } from "../../store/useStore";
import { INVESTIGATIONS, PARTIAL_G_NOTE, EARTH_SPINOFFS, MOON_O2_NOTE, psiSearch, psiPage, type Investigation, type Pillar } from "../../content/investigations";
import { rankInvestigations, type HabitatConditions } from "../../lib/rankInvestigations";
import { downloadCsv } from "../../lib/csv";
import { Reveal, SectionGlow } from "../common/Reveal";

const PILLAR: Record<Pillar, { label: string; icon: string; color: string }> = {
  prevention: { label: "Prevention", icon: "🛡", color: "#5FE6FF" },
  detection: { label: "Detection", icon: "🚨", color: "#FFC83D" },
  suppression: { label: "Suppression", icon: "🧯", color: "#FF8A5B" },
};

const PILLAR_HELP: Record<Pillar, string> = {
  prevention: "stop fires starting",
  detection: "spot them early",
  suppression: "put them out",
};

function PillarChip({ p }: { p: Pillar }) {
  const c = PILLAR[p];
  return <span className="num rounded-full border px-2 py-0.5 text-[10.5px] uppercase tracking-wider" style={{ borderColor: `${c.color}66`, color: c.color, background: `${c.color}14` }}>{c.icon} {c.label}</span>;
}

type RunLite = { experiment: string; material: string; o2_percent: number; pressure_kpa: number; airflow_cm_s: number; gravity_g: number;
  spread_rate_mm_s: number | null; flame_temp_k: number | null; extinguished: boolean | null; burn_duration_s: number | null };
const span = (xs: number[], unit: string) => { const lo = Math.min(...xs), hi = Math.max(...xs); return lo === hi ? `${lo}${unit}` : `${lo}–${hi}${unit}`; };
/** "What varied" and "what was measured", computed from the real runs of one experiment (nothing typed by hand). */
function fromRuns(runs: RunLite[], exp: string, matLabel: (id: string) => string, rateName: string) {
  const rs = runs.filter((r) => r.experiment === exp);
  if (!rs.length) return null;
  const mats = [...new Set(rs.map((r) => matLabel(r.material)))];
  const varied = [`${mats.length} fuel${mats.length > 1 ? "s" : ""} (${mats.join(", ")})`, `O₂ ${span(rs.map((r) => r.o2_percent), "%")}`,
    `pressure ${span(rs.map((r) => r.pressure_kpa), " kPa")}`, `airflow ${span(rs.map((r) => r.airflow_cm_s), " cm/s")}`, `gravity ${span(rs.map((r) => r.gravity_g), " g")}`];
  const has = (f: (r: RunLite) => unknown) => rs.some((r) => f(r) !== null && f(r) !== undefined);
  const measured = [has((r) => r.spread_rate_mm_s) && rateName.toLowerCase(), has((r) => r.extinguished) && "whether the flame went out",
    has((r) => r.burn_duration_s) && "burn duration", has((r) => r.flame_temp_k) && "flame temperature"].filter(Boolean) as string[];
  return { n: rs.length, varied: varied.join(" · "), measured: measured.join(", ") };
}

export function Investigations() {
  const meta = useStore((s) => s.meta.data);
  const runs = useStore((s) => s.runs.data?.runs);
  const askNova = useStore((s) => s.askNova);
  const cur = {
    o2: useStore((s) => s.o2_percent), p: useStore((s) => s.pressure_kpa),
    a: useStore((s) => s.airflow_cm_s), g: useStore((s) => s.gravity_g),
  };
  const [habitatId, setHabitatId] = useState<string>("current");
  const [focus, setFocus] = useState<Pillar | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const habitats: (HabitatConditions & { id: string })[] = useMemo(() => [
    { id: "current", label: "Your settings", o2_percent: cur.o2 ?? 21, pressure_kpa: cur.p ?? 101.3, airflow_cm_s: cur.a ?? 0, gravity_g: cur.g ?? 0 },
    ...(meta?.vehicles ?? []).map((v) => ({ id: v.id, label: v.label, o2_percent: v.o2_percent, pressure_kpa: v.pressure_kpa, airflow_cm_s: v.airflow_cm_s, gravity_g: v.gravity_g })),
  ], [meta, cur.o2, cur.p, cur.a, cur.g]);
  const h = habitats.find((x) => x.id === habitatId) ?? habitats[0];
  const runsIn = (exp: string) => runs?.filter((r) => r.experiment === exp).length ?? 0;
  const ranked = rankInvestigations(INVESTIGATIONS, h, focus, runsIn);
  const top = ranked[0]?.score ?? 1;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));
  const compared = picked.map((id) => INVESTIGATIONS.find((i) => i.id === id)).filter(Boolean) as Investigation[];
  const source = meta?.data_source === "nasa" ? "NASA" : "mock";
  const matLabel = (id: string) => meta?.materials.find((m) => m.id === id)?.label ?? id;
  const facts = useMemo(() => {
    const out: Record<string, ReturnType<typeof fromRuns>> = {};
    for (const inv of INVESTIGATIONS) if (inv.inApp && runs) {
      const ft = runs.find((r) => r.experiment === inv.inApp)?.fuel_type;
      out[inv.id] = fromRuns(runs as unknown as RunLite[], inv.inApp, matLabel, ft === "droplet" && meta?.data_source === "nasa" ? "Burning rate" : "Flame spread rate");
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, meta]);

  const best = ranked[0];
  const shown = showAll || focus ? ranked : ranked.slice(0, 6);
  const ask = (inv: Investigation) => askNova(`Context from NASA: ${inv.name} (${inv.full}) — ${inv.studied} Hardware: ${inv.hardware}. Using this context and the runs you have, explain in 3 short sentences why it matters for fire safety in ${h.id === "current" ? "my current settings" : `the ${h.label}`} (${h.o2_percent}% oxygen, ${h.pressure_kpa} kPa).`);

  return (
    <section id="investigations" className="relative z-10 px-6 py-24 md:px-12">
      <SectionGlow colors={["#5FE6FF", "#FFC83D"]} />
      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="mb-8 text-center">
          <span className="eyebrow text-cool">Research</span>
          <h2 className="mt-3 font-space text-4xl font-bold tracking-tight text-white md:text-5xl">Which NASA research matters for your habitat?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-[17px] text-dim">
            NASA has run dozens of fire experiments in space. Pick where people will live, and we'll show which experiments matter most there — and why.
          </p>
        </Reveal>

        {/* how it works */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[["1", "Pick a habitat", "Each has its own air: oxygen, pressure, airflow and gravity."],
            ["2", "See what matters most", "Experiments are ranked for that habitat, with the reason."],
            ["3", "Dig in", "Open a card for details, compare two, or ask Nova."]].map(([n, t, d]) => (
            <div key={n} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cool/15 text-[13px] font-bold text-cool">{n}</span>
              <span><span className="block text-[14px] font-semibold text-white">{t}</span><span className="text-[12.5px] text-dim">{d}</span></span>
            </div>
          ))}
        </div>

        {/* step 1: habitat */}
        <div className="glass mb-4 rounded-2xl p-4">
          <div className="label mb-2">1 · Habitat</div>
          <div className="flex flex-wrap gap-2">
            {habitats.map((x) => (
              <button key={x.id} onClick={() => setHabitatId(x.id)} aria-pressed={habitatId === x.id}
                className={`num rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors ${habitatId === x.id ? "border-cool/70 bg-cool/15 text-white" : "border-white/15 text-dim hover:border-white/35 hover:text-white"}`}>
                {x.label}
              </button>
            ))}
          </div>
          <div className="num mt-2 text-[11px] text-dim">{h.o2_percent}% O₂ · {h.pressure_kpa} kPa · airflow {h.airflow_cm_s} cm/s · {h.gravity_g} g</div>
        </div>

        {h.o2_percent >= 30 && h.pressure_kpa <= 71 && (
          <div className="mb-3 rounded-xl border border-cool/30 bg-cool/5 px-4 py-2.5 text-[13px] text-white/85">🧑‍🚀 {MOON_O2_NOTE}</div>
        )}
        {h.gravity_g > 0.01 && h.gravity_g < 0.95 && (
          <div className="mb-4 rounded-xl border border-fire/40 bg-fire/10 px-4 py-2.5 text-[13px] text-white/85">🌙 {PARTIAL_G_NOTE}</div>
        )}

        {/* step 2: top pick */}
        {best && (
          <div className="mb-5 rounded-2xl border border-cool/40 bg-gradient-to-r from-cool/10 to-transparent p-5">
            <div className="label mb-1 text-cool">2 · Most relevant for {h.id === "current" ? "your settings" : h.label}</div>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-space text-2xl font-bold text-white">{best.inv.name}</span>
              <span className="text-[14px] text-dim">{best.inv.full}</span>
            </div>
            <p className="mt-1 text-[14px] text-white/85">{best.inv.studied}</p>
            {best.reasons[0] && <p className="mt-1 text-[13px] text-[#FFB873]">Why: {best.reasons[0]}</p>}
          </div>
        )}

        {/* legend + focus filter */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="label mr-1">3 · Fire safety has three parts:</span>
          <button onClick={() => setFocus(null)} aria-pressed={!focus}
            className={`num rounded-full border px-3 py-1 ${!focus ? "border-white/50 bg-white/10 text-white" : "border-white/15 text-dim hover:text-white"}`}>All</button>
          {(Object.keys(PILLAR) as Pillar[]).map((p) => (
            <button key={p} onClick={() => setFocus(focus === p ? null : p)} aria-pressed={focus === p} title={PILLAR_HELP[p]}
              className={`num rounded-full border px-3 py-1 ${focus === p ? "bg-white/10 text-white" : "text-dim hover:text-white"}`}
              style={{ borderColor: focus === p ? PILLAR[p].color : "rgba(255,255,255,0.15)" }}>
              {PILLAR[p].icon} {PILLAR[p].label} <span className="text-white/45">— {PILLAR_HELP[p]}</span>
            </button>
          ))}
        </div>

        {/* comparison */}
        {compared.length > 0 && (
          <div className="glass mb-5 overflow-x-auto rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="label">Compare {compared.length === 1 ? "· pick one more card" : ""}</span>
              <button onClick={() => setPicked([])} className="num text-[11px] text-dim hover:text-white">Clear</button>
            </div>
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <tbody>
                {([
                  ["Investigation", (i: Investigation) => <span className="font-semibold text-white">{i.name}<span className="ml-1 font-normal text-dim">· {i.full}</span></span>],
                  ["Fire-safety role", (i: Investigation) => i.pillars.length ? <span className="flex flex-wrap gap-1">{i.pillars.map((p) => <PillarChip key={p} p={p} />)}</span> : <span className="text-dim">Foundational combustion science</span>],
                  ["What it studied", (i: Investigation) => i.studied],
                  ["Informs", (i: Investigation) => i.informs ?? <span className="text-dim">Foundational combustion science</span>],
                  ["Fuel", (i: Investigation) => i.fuels.length ? i.fuels.join(", ") : "— (measures smoke/aerosols)"],
                  ["Hardware", (i: Investigation) => i.hardware],
                  ["Fuel sample", (i: Investigation) => i.sample ?? <a className="text-cool hover:underline" href={psiSearch(i.name.split(" ")[0])} target="_blank" rel="noopener noreferrer">Search NASA PSI ↗</a>],
                  ["Measurements", (i: Investigation) => i.sensors ?? <a className="text-cool hover:underline" href={psiSearch(i.name.split(" ")[0])} target="_blank" rel="noopener noreferrer">Search NASA PSI ↗</a>],
                  ["Tests varied", (i: Investigation) => facts[i.id]?.varied ?? <span className="text-dim">Not in this app's data yet</span>],
                  ["Measured", (i: Investigation) => facts[i.id]?.measured ?? <span className="text-dim">—</span>],
                ] as const).map(([label, f]) => (
                  <tr key={label} className="border-t border-white/10 align-top">
                    <th className="num w-36 py-2 pr-3 text-[11px] font-normal uppercase tracking-wider text-dim">{label}</th>
                    {compared.map((i) => <td key={i.id} className="py-2 pr-4 text-white/85">{f(i)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* compact ranked cards; details on demand */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shown.map(({ inv, score, reasons }, k) => {
            const sel = picked.includes(inv.id);
            const isOpen = open === inv.id;
            const n = inv.inApp ? runsIn(inv.inApp) : 0;
            const f = facts[inv.id];
            return (
              <article key={inv.id} className={`glass flex flex-col rounded-2xl p-5 transition-[border-color] duration-200 ${sel ? "border-cool/60" : "hover:border-white/25"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="num text-[11px] text-dim">#{k + 1}{inv.project && ` · ${inv.project}`}</div>
                    <h3 className="font-space text-lg font-bold text-white">{inv.name}</h3>
                    <div className="text-[12px] text-dim">{inv.full}</div>
                  </div>
                  {n > 0 && <span className="num shrink-0 rounded-full border border-[#5BE49B]/50 bg-[#5BE49B]/10 px-2 py-0.5 text-[10px] text-[#5BE49B]" title="Its runs train this app's model">uses its data</span>}
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded bg-white/10" title="Relevance to this habitat">
                  <div className="h-full rounded bg-gradient-to-r from-cool to-[#5BE49B] transition-[width] duration-500" style={{ width: `${Math.max(8, (score / top) * 100)}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {inv.pillars.length ? inv.pillars.map((p) => <PillarChip key={p} p={p} />) : <span className="num rounded-full border border-white/15 px-2 py-0.5 text-[10.5px] uppercase tracking-wider text-dim">Foundational</span>}
                </div>
                <p className="mt-3 text-[13.5px] leading-snug text-white/85">{inv.studied}</p>

                {isOpen && (
                  <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-[12.5px] leading-snug">
                    {reasons.length > 0 && <div className="text-[#FFB873]">{reasons.slice(0, 2).map((r) => <div key={r}>→ {r}</div>)}</div>}
                    {inv.informs && <div className="text-white/80"><span className="text-cool">⚙ Informs:</span> {inv.informs}</div>}
                    <div className="text-dim">🔧 {inv.hardware}{inv.fuels.length > 0 && ` · fuel: ${inv.fuels.join(", ")}`}</div>
                    {inv.sample && <div className="text-white/80"><span className="text-dim">🧪 Sample:</span> {inv.sample}</div>}
                    {inv.sensors && <div className="text-white/80"><span className="text-dim">📈 Measured:</span> {inv.sensors}</div>}
                    {inv.notModeled && <div className="text-[11.5px] text-dim"><span className="text-white/70">ⓘ</span> {inv.notModeled}</div>}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
                      {inv.psi ? inv.psi.map((x) => <a key={x.id} className="num text-cool hover:underline" href={psiPage(x.id)} target="_blank" rel="noopener noreferrer">{x.label} on NASA PSI ({x.id}) ↗</a>)
                        : <a className="num text-cool hover:underline" href={psiSearch(inv.name.split(" ")[0])} target="_blank" rel="noopener noreferrer">Sample size &amp; sensors: search NASA PSI ↗</a>}
                    </div>
                    {f && (
                      <div className="rounded-lg bg-white/[0.04] px-3 py-2 text-[11.5px] text-dim">
                        <div><b className="text-white/80">Tests varied</b> ({f.n} {inv.inApp === "Saffire" ? "Saffire-II" : inv.inApp} runs here): {f.varied}</div>
                        <div className="mt-1"><b className="text-white/80">Recorded in this app's runs:</b> {f.measured}</div>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <button onClick={() => setOpen(isOpen ? null : inv.id)} aria-expanded={isOpen}
                    className="num rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white/85 hover:border-white/40">{isOpen ? "Less ▴" : "Details ▾"}</button>
                  <button onClick={() => ask(inv)} className="num rounded-full border border-cool/40 bg-cool/10 px-3 py-1.5 text-[11px] font-semibold text-cool hover:bg-cool/20">👩‍🚀 Ask Nova</button>
                  <button onClick={() => toggle(inv.id)} aria-pressed={sel}
                    className={`num rounded-full border px-3 py-1.5 text-[11px] font-semibold ${sel ? "border-cool bg-cool/20 text-white" : "border-white/20 text-dim hover:text-white"}`}>{sel ? "✓ Comparing" : "Compare"}</button>
                  {isOpen && inv.dataset && <a href={inv.dataset} target="_blank" rel="noopener noreferrer" className="num rounded-full border border-white/20 px-3 py-1.5 text-[11px] text-dim hover:text-white">Dataset ↗</a>}
                </div>
              </article>
            );
          })}
        </div>
        {!focus && ranked.length > 6 && (
          <div className="mt-5 text-center">
            <button onClick={() => setShowAll((v) => !v)} className="num rounded-full border border-white/20 px-4 py-2 text-[12px] text-white/85 hover:border-white/40">
              {showAll ? "Show top 6" : `Show all ${ranked.length} investigations`}
            </button>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 text-[12.5px] text-dim md:flex-row md:items-start md:justify-between">
          <div><span className="text-white/80">🌍 Also protects people on Earth:</span> {EARTH_SPINOFFS.join(" · ")}.</div>
          <button onClick={() => runs && downloadCsv(`fire-command-${source.toLowerCase()}-runs.csv`, runs as unknown as Record<string, unknown>[])} disabled={!runs?.length}
            className="num shrink-0 text-left text-cool underline-offset-2 hover:underline disabled:opacity-40">
            ⬇ Download the {runs?.length ?? ""} runs behind the model (CSV)
          </button>
        </div>
        <p className="num mt-3 text-[10.5px] text-dim">
          Descriptions: NASA's 2026 Space Apps "Flame in Freefall" challenge statement. Ranking: a transparent rule using the habitat's oxygen,
          pressure, airflow and gravity. Rocket and propellant fires are outside PSI's scope.
        </p>
      </div>
    </section>
  );
}
