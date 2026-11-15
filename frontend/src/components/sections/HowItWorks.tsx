// "How it works": the pipeline from NASA PSI tables to a cited answer, with the real numbers.
// Static facts come from data/SOURCES.md (Track A); live numbers (runs used, model scores, risk weights) from /api/meta.
import { useStore } from "../../store/useStore";
import { Reveal, SectionGlow } from "../common/Reveal";

export function HowItWorks() {
  const meta = useStore((s) => s.meta.data);
  const runs = useStore((s) => s.runs.data?.runs);
  if (!meta) return null;
  const m = meta.model.metrics;
  const w = meta.model.weights;
  const by = (e: string) => runs?.filter((r) => r.experiment === e).length;
  const nasa = meta.data_source === "nasa";
  const pct = (v: number | null) => (v === null ? "n/a" : `${Math.round(Math.max(0, v) * 100)}%`);

  const steps = [
    {
      icon: "🛰", title: "Real NASA data",
      body: nasa
        ? <>Experiment tables from NASA's PSI repository: <b className="text-white">FLEX</b> (274 rows read, {by("FLEX") ?? "…"} used) and <b className="text-white">Saffire-II</b> (9 read, {by("Saffire") ?? "…"} used) — {meta.n_runs} runs in total.</>
        : <>Running on <b className="text-mock">mock data</b> ({meta.n_runs} runs). Real NASA tables plug in with no code change.</>,
      detail: "Rows outside the app's ranges are rejected, never adjusted: 76 FLEX tests above 1 atm, 15 below 15% O₂, 1 with no pressure, and one Saffire card that mixed two materials.",
    },
    {
      icon: "🔎", title: "Facts checked",
      body: <>Two things the tables don't say were confirmed in NASA papers: FLEX burning rate is in mm²/s, and Saffire-II's cabin was 22.1% O₂ at 100.6 kPa.</>,
      detail: "Sources: NASA NTRS 20120016855; Olson et al. 2019, Fire Technology.",
    },
    {
      icon: "🧠", title: "Machine-learning model",
      body: <>Gradient-boosting models predict the burning/spread rate (with a likely range) and the chance a flame goes out. Scored on runs they never saw:
        rate R² {m.spread_r2 ?? "n/a"}, extinction AUC {m.extinction_auc ?? "n/a"}.</>,
      detail: `Risk = 100 × (${w.spread} × rate vs. the fastest runs + ${w.survival} × chance the flame keeps burning). Weights are in /api/meta, not hidden.`,
    },
    {
      icon: "🧩", title: "Explained, not a black box",
      body: <>SHAP splits every prediction into how much oxygen, pressure, airflow and fuel each pushed the risk — shown in plain words, with a safer option to try.</>,
      detail: `The confidence meter adds how many real runs are nearby and how wide the range is (rate explained: ${pct(m.spread_r2)}).`,
    },
    {
      icon: "👩‍🚀", title: "AI answers that cite runs",
      body: <>For each question, the 5 most similar real runs are retrieved and an LLM (Gemini) answers from them, naming the run IDs. No key or no internet → built-in templates, so the app never breaks.</>,
      detail: "Calls are capped per minute; run notes are truncated before they reach the prompt.",
    },
    {
      icon: "⚠️", title: "What it can't tell you",
      body: <>Every run is in microgravity, so gravity has no learned effect; there are no flame temperatures; FLEX droplets burned in still air. Moon/Mars numbers are interpolated and marked.</>,
      detail: "BASS, Saffire-I/III, FLEX-2 and ACME were checked but their tables lack the spread rate or outcome needed to train on — they're in the Research section instead.",
    },
  ];

  return (
    <section id="how" className="relative z-10 px-6 py-24 md:px-12">
      <SectionGlow colors={["#2D6BFF", "#9B6BFF"]} />
      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="mb-10 text-center">
          <span className="eyebrow text-cool">How it works</span>
          <h2 className="mt-3 font-space text-4xl font-bold tracking-tight text-white md:text-5xl">From NASA tables to an answer you can check</h2>
          <p className="mx-auto mt-3 max-w-2xl text-[17px] text-dim">Every number on this site traces back to a real experiment. Here's the path it takes.</p>
        </Reveal>
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 60} className="h-full">
              <li className="glass relative flex h-full flex-col rounded-2xl p-5">
                <span className="num absolute right-4 top-4 text-[11px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-2xl" aria-hidden>{s.icon}</span>
                <h3 className="mt-2 font-space text-lg font-bold text-white">{s.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-snug text-white/85">{s.body}</p>
                <p className="mt-auto pt-3 text-[11.5px] leading-snug text-dim">{s.detail}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
