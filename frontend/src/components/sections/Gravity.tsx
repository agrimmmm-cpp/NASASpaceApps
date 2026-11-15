// Section 2: porthole flame + gravity journey. Marks from meta.gravity_marks placed at true scale;
// the sparse-data band from meta.model.ci_widen (I-21).
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../../store/useStore";
import { fmtGravity } from "../../lib/format";
import { Flame } from "../space/Flame";
import { Body } from "../space/Body";

const JOURNEY_MS = 4200;
const prefersReduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Visual-only journey from Earth (max g) down to the current setting. Never touches the store, so it fires no
 *  API calls and doesn't change the preset; the page returns to the real value when it ends. */
function useJourney(target: number | undefined, from: number) {
  const [shown, setShown] = useState<number | null>(null);
  const raf = useRef(0);
  const stop = useCallback(() => { cancelAnimationFrame(raf.current); setShown(null); }, []);
  const play = useCallback(() => {
    if (target === undefined || prefersReduced()) return;
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / JOURNEY_MS);
      const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2; // ease-in-out
      setShown(from + (target - from) * e);
      if (k < 1) raf.current = requestAnimationFrame(tick);
      else setShown(null);
    };
    raf.current = requestAnimationFrame(tick);
  }, [target, from]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return { shown, play, stop, playing: shown !== null };
}

export function Gravity() {
  const meta = useStore((s) => s.meta.data);
  const realG = useStore((s) => s.gravity_g);
  const risk = useStore((s) => s.prediction.data?.risk_index);
  const setScenario = useStore((s) => s.setScenario);
  const section = useRef<HTMLElement>(null);
  const journey = useJourney(realG, meta?.ranges.gravity_g.max ?? 1);
  const played = useRef(false);
  // play once, the first time the section is mostly on screen
  useEffect(() => {
    const el = section.current;
    if (!el || realG === undefined) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !played.current) { played.current = true; journey.play(); }
    }, { threshold: 0.45 });
    io.observe(el);
    return () => io.disconnect();
  }, [realG === undefined, journey.play]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!meta || realG === undefined) return <section id="gravity" className="min-h-screen" />;
  const g = journey.shown ?? realG;
  const set = (v: number) => { journey.stop(); setScenario({ gravity_g: v }); };
  const r = meta.ranges.gravity_g;
  const w = meta.model.ci_widen;
  const pct = (v: number) => ((v - r.min) / (r.max - r.min)) * 100;
  const nearest = meta.gravity_marks.reduce((a, m) => (Math.abs(m.value - g) < Math.abs(a.value - g) ? m : a));
  const sparse = g > w.g_min && g < w.g_max;
  const noGravityData = meta.model.capabilities.gravity_effect === false;
  return (
    <section id="gravity" ref={section} className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-24 text-center md:px-12">
      <span className="eyebrow text-cool">Gravity</span>
      <h2 className="mt-3 font-space text-4xl font-bold tracking-tight text-white md:text-5xl">No gravity, no rising flame</h2>
      <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-dim">
        On Earth, hot gas rises and pulls fresh air in, so flames stretch upward. In microgravity nothing rises:
        oxygen only drifts in slowly, and the flame becomes a dim blue sphere.
      </p>

      <div className="porthole-rim relative mt-12 flex h-72 w-72 items-center justify-center rounded-full border border-cool/40 bg-gradient-to-tr from-[#1B2234] via-[#0A0D17] to-[#252E46] p-2.5">
        {["top-2 left-1/2 -translate-x-1/2", "bottom-2 left-1/2 -translate-x-1/2", "left-2 top-1/2 -translate-y-1/2", "right-2 top-1/2 -translate-y-1/2"].map((p) => (
          <span key={p} className={`absolute h-2 w-2 rounded-full bg-[#8E9EB8] ${p}`} />
        ))}
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-cool/30 bg-[#020409]">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-1/2 h-px bg-cool/20" />
            <div className="absolute inset-y-0 left-1/2 w-px bg-cool/20" />
            <div className="absolute inset-8 rounded-full border border-dashed border-cool/20" />
            <span className="num absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap text-[9px] uppercase tracking-widest text-cool/80">Cam 02 · Porthole</span>
            <span className="num absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] uppercase tracking-widest text-dim">{fmtGravity(g)}</span>
          </div>
          <Flame gravity={g} intensity={(risk ?? 40) / 100} size={200} />
        </div>
      </div>

      <div className="glass mt-12 w-full max-w-5xl rounded-2xl px-8 pb-6 pt-8 md:px-14">
        <div className="relative h-36">
          <div className="absolute inset-x-0 top-11 h-1 rounded bg-white/10" />
          <div className="absolute top-11 h-1 rounded bg-cool shadow-[0_0_8px_#3DD9FF]" style={{ left: 0, width: `${pct(g)}%` }} />
          <div className="absolute top-11 h-1 border-t-2 border-dashed border-[#FFB873]/70"
            style={{ left: `${pct(w.g_min)}%`, width: `${pct(w.g_max) - pct(w.g_min)}%` }} />
          <span className="num absolute -top-1 -translate-x-1/2 whitespace-nowrap rounded border border-[#FFB873]/40 bg-[#0A0E1A] px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#FFB873]"
            style={{ left: `${(pct(w.g_min) + pct(w.g_max)) / 2 + 8}%` }}>
            Sparse data — interpolated
          </span>
          {meta.gravity_marks.map((m) => {
            const p = pct(m.value);
            return (
              <button key={m.value} onClick={() => set(m.value)}
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-2" style={{ left: `${p}%` }}
                aria-label={`Set gravity to ${m.value} g (${m.label})`}>
                <Body label={m.label} size={88} active={m === nearest && Math.abs(m.value - g) < 0.005} />
                <span className="num whitespace-nowrap text-[13px] font-semibold text-white">{m.value} g {m.label}</span>
              </button>
            );
          })}
        </div>
        <input type="range" aria-label="Gravity" className="mt-8 w-full" min={r.min} max={r.max} step={r.step} value={g}
          onPointerDown={journey.stop} onChange={(e) => set(Number(e.target.value))} />
        <div className="mt-3 flex items-center justify-center gap-3">
          <button onClick={journey.playing ? journey.stop : journey.play}
            className="num rounded-full border border-cool/50 px-4 py-1.5 text-[12px] font-semibold uppercase tracking-wider text-cool hover:bg-cool/10">
            {journey.playing ? "■ Stop" : "▶ Replay Earth → orbit"}
          </button>
          {journey.playing && <span className="num text-[12px] text-dim">illustration — your setting returns at the end</span>}
        </div>
        {noGravityData && (
          <p className="mt-4 rounded-lg border border-[#FFB873]/40 bg-[#FFB873]/10 px-4 py-2 text-[13px] text-[#FFB873]">
            The loaded data only has microgravity runs, so predictions don't change with gravity. The flame above is an illustration of the physics.
          </p>
        )}
        <p className="mt-3 text-[13px] text-dim">
          {fmtGravity(realG)}{sparse && !noGravityData && !journey.playing && <span className="text-[#FFB873]"> · between {w.g_min} and {w.g_max} g there are few experiments, so the uncertainty band is widened ×{w.factor}</span>}
        </p>
      </div>
    </section>
  );
}
