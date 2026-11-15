// COMMAND MODE: briefing screen → full-screen real-time fire fight (GameView). The model predictions for every cabin
// state the game can reach are prefetched before IGNITE, so play never waits on the network. Labelled SIMULATION (I-27).
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store/useStore";
import { api } from "../../api/client";
import type { Scenario } from "../../types";
import * as E from "../../sim/engine";
import * as G from "../../sim/game";
import { ModuleScene } from "./ModuleScene";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { fmtGravity } from "../../lib/format";
import { rateLabel } from "../../lib/units";

const GameView = lazy(() => import("./GameView"));
const DIFFS: G.Difficulty[] = ["easy", "normal", "hard"];
const DIFF_TEXT: Record<G.Difficulty, string> = {
  easy: "Bigger extinguisher, slower spread, Nova coaches you.",
  normal: "The real deal. No hints.",
  hard: "Small extinguisher, fast spread. Every second counts.",
};

function hasWebGL() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } }

function useScenario(): Scenario | null {
  const material = useStore((s) => s.material);
  const o2_percent = useStore((s) => s.o2_percent);
  const pressure_kpa = useStore((s) => s.pressure_kpa);
  const airflow_cm_s = useStore((s) => s.airflow_cm_s);
  const gravity_g = useStore((s) => s.gravity_g);
  if (material == null || o2_percent == null || pressure_kpa == null || airflow_cm_s == null || gravity_g == null) return null;
  return { material, o2_percent, pressure_kpa, airflow_cm_s, gravity_g };
}

const readBest = (d: G.Difficulty) => { try { const v = localStorage.getItem(`command-best-${d}`); return v ? +v : null; } catch { return null; } };

export function CommandMode() {
  const meta = useStore((s) => s.meta.data);
  const vehicleId = useStore((s) => s.vehicle_id);
  const setMode = useStore((s) => s.setMode);
  const live = useScenario();
  const [diff, setDiff] = useState<G.Difficulty>(() => { try { return (localStorage.getItem("command-diff") as G.Difficulty) || "normal"; } catch { return "normal"; } });
  const [playing, setPlaying] = useState<Scenario | null>(null);
  const [loaded, setLoaded] = useState({ done: 0, total: 0, error: null as string | null });
  const [webgl] = useState(hasWebGL);
  const [, bump] = useState(0);
  const cache = useRef(new Map<string, E.Pred>());

  const lim: E.Limits | null = useMemo(() => meta && ({
    o2Min: meta.ranges.o2_percent.min, o2Max: meta.ranges.o2_percent.max, o2Step: meta.ranges.o2_percent.step,
    airMax: meta.ranges.airflow_cm_s.max, airStep: meta.ranges.airflow_cm_s.step,
  }), [meta]);
  const predict: E.Predict = useCallback((sc) => cache.current.get(E.keyOf(sc)), []);
  const remember = useCallback((sc: Scenario, p: E.Pred) => { cache.current.set(E.keyOf(sc), p); }, []);
  const material = meta?.materials.find((m) => m.id === (playing ?? live)?.material);
  const vehicle = meta?.vehicles.find((v) => v.id === vehicleId);
  const rate = rateLabel(meta?.data_source, material?.fuel_type);

  // prefetch every cabin state the game can reach for the current conditions
  const liveKey = live && lim ? E.keyOf(E.quantize(live, lim)) : "";
  useEffect(() => {
    if (!live || !lim || playing) return;
    const ctl = new AbortController();
    const all = G.gameReachable(live, lim);
    const todo = all.filter((sc) => !cache.current.has(E.keyOf(sc)));
    setLoaded({ done: all.length - todo.length, total: all.length, error: null });
    let i = 0;
    const worker = async () => {
      while (i < todo.length && !ctl.signal.aborted) {
        const sc = todo[i++];
        try {
          const p = await api.predict(sc, ctl.signal);
          cache.current.set(E.keyOf(sc), { spread: p.spread_rate_mm_s, extP: p.extinction_probability, risk: p.risk_index });
          if (!ctl.signal.aborted) setLoaded((l) => ({ ...l, done: l.done + 1 }));
        } catch (e) {
          if (!ctl.signal.aborted) setLoaded((l) => ({ ...l, error: (e as Error).message || "Prediction failed" }));
          return;
        }
      }
    };
    void Promise.all(Array.from({ length: 6 }, worker));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, lim, playing]);

  const ready = !!live && !!lim && loaded.total > 0 && loaded.done >= loaded.total && !loaded.error && webgl;
  const pickDiff = (d: G.Difficulty) => { setDiff(d); try { localStorage.setItem("command-diff", d); } catch { /* ignore */ } };
  const ignite = () => { if (ready && live && predict(E.quantize(live, lim!))) setPlaying(live); };
  const exitGame = () => { setPlaying(null); bump((n) => n + 1); if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); };

  if (!meta || !lim) return <Shell><p className="text-dim">Connecting to mission server…</p></Shell>;
  const scen = live;

  return (
    <Shell>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="num mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[#FFB873]">
            <span className="rounded border border-[#FFB873]/40 bg-[#FFB873]/10 px-1.5 py-0.5">Simulation</span>
            Command Mode · fire emergency
          </div>
          <h1 className="font-space text-3xl font-semibold text-white sm:text-4xl">Fire aboard {vehicle?.label ?? "your spacecraft"}</h1>
        </div>
        <button onClick={() => setMode("explore")} className="num rounded border border-white/20 px-3 py-1.5 text-[12px] uppercase tracking-[0.12em] text-dim hover:border-cool/50 hover:text-white">
          Back to explore
        </button>
      </div>

      {scen && (
        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <div className="glass rounded-2xl border border-white/10 p-4">
            {!playing && <ModuleScene sim={null} gravity={scen.gravity_g} airflow={scen.airflow_cm_s} airMax={lim.airMax} o2={scen.o2_percent} o2Max={lim.o2Max} />}
            <p className="mt-4 text-[15px] leading-relaxed text-white/85">
              A fire breaks out in the module. You're inside, in first person. <b className="text-white">Grab the CO₂ extinguisher and aim it at the flames</b> —
              wait too long and the fire jumps to the equipment racks, smoke fills the cabin, and the module is lost.
              How fast the flame grows comes from the model trained on {meta.data_source === "nasa" ? "NASA experiment runs" : "mock runs"} for these exact conditions.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[["🧯", "E then hold mouse / Space", "grab the extinguisher, spray where you aim"], ["🌀", "F", "cabin fans on / off"],
                ["🫁", "O", "lower the O₂ supply (slows the flame)"], ["🚪", "H twice", "seal the module and evacuate the crew"]].map(([i, k, d]) => (
                <div key={k} className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px]">
                  <span className="text-lg leading-none">{i}</span>
                  <span><b className="num text-[#FFB873]">{k}</b> <span className="text-dim">— {d}</span></span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass flex flex-col rounded-2xl border border-white/10 p-5">
            <div className="num mb-2 text-[11px] uppercase tracking-[0.16em] text-dim">Difficulty</div>
            <div className="grid gap-2">
              {DIFFS.map((d) => {
                const b = readBest(d);
                return (
                  <button key={d} onClick={() => pickDiff(d)} aria-pressed={diff === d}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${diff === d ? "border-[#FF6A1A]/70 bg-[#FF6A1A]/10" : "border-white/10 bg-white/[0.03] hover:border-white/30"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-space font-semibold text-white">{G.GAME.difficulty[d].label}</span>
                      {b !== null && <span className="num text-[11px] text-[#FFB873]">best {b}</span>}
                    </div>
                    <div className="mt-0.5 text-[12px] text-dim">{DIFF_TEXT[d]}</div>
                  </button>
                );
              })}
            </div>
            <div className="num mb-2 mt-5 text-[11px] uppercase tracking-[0.16em] text-dim">Cabin conditions</div>
            <dl className="num grid grid-cols-2 gap-y-1.5 text-[13px]">
              <dt className="text-dim">Fuel</dt><dd className="text-white">{material?.label ?? scen.material}</dd>
              <dt className="text-dim">Oxygen</dt><dd className="text-white">{scen.o2_percent} %</dd>
              <dt className="text-dim">Pressure</dt><dd className="text-white">{scen.pressure_kpa} kPa</dd>
              <dt className="text-dim">Airflow</dt><dd className="text-white">{scen.airflow_cm_s} cm/s</dd>
              <dt className="text-dim">Gravity</dt><dd className="text-white">{fmtGravity(scen.gravity_g)}</dd>
            </dl>
            <p className="mt-2 text-[12px] text-dim">Change these in Explore mode, then come back.</p>
            <div className="mt-auto pt-5">
              <button onClick={ignite} disabled={!ready}
                className="w-full rounded-xl border border-[#FF6A1A]/60 bg-gradient-to-b from-[#FF7A2A] to-[#D9480F] px-5 py-3.5 font-space text-lg font-semibold tracking-[0.2em] text-white shadow-[0_0_30px_rgba(255,106,26,0.35)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
                IGNITE
              </button>
              <div className="num mt-2 text-center text-[11px] text-dim">
                {!webgl ? <span className="text-danger">This game needs WebGL (3D graphics), which this browser has turned off.</span>
                  : loaded.error ? <span className="text-danger">Model unavailable: {loaded.error}</span>
                  : ready ? "Model ready · opens full screen" : `Loading model predictions ${loaded.done}/${loaded.total || "…"}`}
              </div>
            </div>
          </div>
        </div>
      )}
      <p className="num mt-6 text-center text-[11px] text-dim">
        Simulation for education, not operational guidance. Flame growth and self-extinction come from the model; spreading to racks, extinguisher power and scoring are game rules (src/sim/game.ts).
      </p>

      {playing && (
        <ErrorBoundary name="command-game" fallback={<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black text-white">
          <div className="text-center"><p>The 3D game couldn't start on this device.</p><button className="mt-3 underline" onClick={exitGame}>Back</button></div></div>}>
          <Suspense fallback={<div className="num fixed inset-0 z-[80] flex items-center justify-center bg-black text-[12px] uppercase tracking-[0.2em] text-[#FFB873]">Entering module…</div>}>
            <GameView base={playing} lim={lim} diff={diff} predict={predict} remember={remember}
              vehicleLabel={vehicle?.label ?? "Spacecraft"} materialLabel={material?.label ?? playing.material}
              rateUnit={rate.unit} dataSource={meta.data_source} onExit={exitGame} />
          </Suspense>
        </ErrorBoundary>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <section id="command" className="relative mx-auto min-h-[calc(100vh-5rem)] max-w-6xl px-4 py-8 sm:px-6">{children}</section>;
}
