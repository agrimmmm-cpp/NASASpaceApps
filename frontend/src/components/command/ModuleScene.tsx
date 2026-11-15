// The inside of a space-station module, drawn in perspective (SVG + CSS animation, no WebGL so it stays light).
// Everything moving here is driven by the drill state: fan speed and air streams = airflow, O₂ gauge = oxygen,
// flame size / embers / smoke = burned area and model rate, CO₂ cloud while the extinguisher works, crew + hatch on
// evacuation. During a decision the equipment you can use glows and is clickable.
import { lazy, Suspense, useState, type CSSProperties } from "react";
import { ErrorBoundary } from "../common/ErrorBoundary";
import * as E from "../../sim/engine";
import * as C from "../../sim/config";
import { Flame } from "../space/Flame";

const Module3D = lazy(() => import("./Module3D"));
function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

const W = 800, H = 450;
const L = (u: number, v: number): [number, number] => [300 * u, 140 * u + v * (450 - 280 * u)];
const R = (u: number, v: number): [number, number] => [800 - 300 * u, 140 * u + v * (450 - 280 * u)];
const quad = (f: typeof L, u0: number, u1: number, v0: number, v1: number) =>
  [f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)].map((p) => p.join(",")).join(" ");
const ceil = (u0: number, u1: number, w0: number, w1: number) => {
  const c = (u: number, w: number) => [300 * u + w * (800 - 600 * u), 140 * u].join(",");
  return [c(u0, w0), c(u0, w1), c(u1, w1), c(u1, w0)].join(" ");
};
const at = (x: number, y: number): CSSProperties => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

const FIRE: [number, number] = [445, 262];
const LOSS_R = 150;
const EXT = L(0.12, 0.72);
const FAN = L(0.22, 0.3);
const VALVE = R(0.2, 0.64);
const HATCH: [number, number] = [400, 225];
export const HOTSPOT: Partial<Record<E.ActionId, [number, number]>> = {
  co2_extinguisher: EXT, vent_off: FAN, vent_max: FAN, lower_o2: VALVE, isolate_evacuate: HATCH,
};

const EMBERS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.4;
  return { a, d: 40 + ((i * 37) % 30), delay: (i * 0.29) % 2.4, r: 1.6 + (i % 3) * 0.7 };
});
const STREAMS = Array.from({ length: 9 }, (_, i) => ({ y: 120 + i * 30 + ((i * 13) % 11), w: 40 + ((i * 29) % 50), delay: (i * 0.37) % 2 }));

export interface SceneProps {
  sim: E.SimState | null;      // null = before ignition
  gravity: number;
  airflow: number; airMax: number;
  o2: number; o2Max: number;
  hotspots?: E.ActionId[];
  recommended?: string;
  onChoose?(id: E.ActionId): void;
  banner?: React.ReactNode;
  shakeKey?: number;
}

export function ModuleScene(props: SceneProps & { flat?: boolean }) {
  const [webgl] = useState(hasWebGL);
  const { sim, gravity, airflow, airMax, o2, o2Max, hotspots = [], recommended, onChoose, banner, shakeKey = 0, flat } = props;
  const use3d = webgl && !flat;
  const status = sim?.status ?? "idle";
  const burning = status === "running";
  const good = status === "extinguished" || status === "contained";
  const failed = status === "failed";
  const evacuated = status === "evacuated";
  const areaFrac = sim ? Math.min(1, sim.area / C.FAIL_AREA_CM2) : 0;
  const co2Active = !!sim && sim.co2Until !== null && sim.t <= sim.co2Until && burning;
  const air = airMax > 0 ? airflow / airMax : 0;
  const spread = sim?.pred.spread ?? 0;
  const lit = burning || failed;
  const light = good ? "#9BF5C8" : evacuated ? "#FFB873" : lit ? undefined : "#CFE6FF";

  const drawing = (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="ms-wall" x1="0" x2="1"><stop offset="0" stopColor="#1b2436" /><stop offset="1" stopColor="#0d1320" /></linearGradient>
          <linearGradient id="ms-wallr" x1="1" x2="0"><stop offset="0" stopColor="#1b2436" /><stop offset="1" stopColor="#0d1320" /></linearGradient>
          <linearGradient id="ms-ceil" y1="0" y2="1"><stop offset="0" stopColor="#222c40" /><stop offset="1" stopColor="#111827" /></linearGradient>
          <linearGradient id="ms-floor" y1="1" y2="0"><stop offset="0" stopColor="#151c2b" /><stop offset="1" stopColor="#0b101a" /></linearGradient>
          <radialGradient id="ms-heat"><stop offset="0" stopColor="#FF7A2A" stopOpacity="0.55" /><stop offset="0.6" stopColor="#FF4B1A" stopOpacity="0.18" /><stop offset="1" stopColor="#FF4B1A" stopOpacity="0" /></radialGradient>
          <radialGradient id="ms-smoke"><stop offset="0" stopColor="#5b6170" stopOpacity="0.7" /><stop offset="1" stopColor="#5b6170" stopOpacity="0" /></radialGradient>
          <radialGradient id="ms-puff"><stop offset="0" stopColor="#F4F8FF" stopOpacity="0.9" /><stop offset="1" stopColor="#F4F8FF" stopOpacity="0" /></radialGradient>
          <radialGradient id="ms-alarm" cx="50%" cy="50%" r="75%"><stop offset="0.45" stopColor="#ff2a1a" stopOpacity="0" /><stop offset="1" stopColor="#ff2a1a" stopOpacity="0.55" /></radialGradient>
        </defs>

        {/* shell */}
        <polygon points="0,0 800,0 500,140 300,140" fill="url(#ms-ceil)" />
        <polygon points="0,450 800,450 500,310 300,310" fill="url(#ms-floor)" />
        <polygon points="0,0 300,140 300,310 0,450" fill="url(#ms-wall)" />
        <polygon points="800,0 500,140 500,310 800,450" fill="url(#ms-wallr)" />
        <rect x="300" y="140" width="200" height="170" fill="#0a0f1a" stroke="#2a3550" />
        {[0.25, 0.5, 0.75].map((u) => (
          <g key={u} stroke="#2a3550" strokeWidth="1.2" fill="none">
            <polyline points={[L(u, 0), R(u, 0), R(u, 1), L(u, 1), L(u, 0)].map((p) => p.join(",")).join(" ")} />
          </g>
        ))}

        {/* racks with blinking LEDs */}
        {[[0.04, 0.2], [0.3, 0.46], [0.52, 0.66], [0.7, 0.86]].map(([u0, u1], i) => (
          <g key={i}>
            <polygon points={quad(L, u0, u1, 0.1, 0.9)} fill="#18233a" stroke="#33415f" strokeWidth="1" opacity={i === 0 ? 0.5 : 1} />
            <polygon points={quad(R, u0, u1, 0.1, 0.9)} fill="#18233a" stroke="#33415f" strokeWidth="1" opacity={i === 0 ? 0.6 : 1} />
            {[0.2, 0.32, 0.44].map((v, j) => {
              const [x, y] = L(u0 + (u1 - u0) * 0.75, v); const [xr, yr] = R(u0 + (u1 - u0) * 0.3, v + 0.3);
              return (
                <g key={j}>
                  <circle cx={x} cy={y} r={2.2 * (1 - u0 * 0.6)} className="led-blink" style={{ animationDelay: `${(i + j) * 0.37}s` }}
                    fill={lit ? "#ff5a3c" : j === 1 ? "#FFB873" : "#5BE49B"} />
                  <circle cx={xr} cy={yr} r={2.2 * (1 - u0 * 0.6)} className="led-blink" style={{ animationDelay: `${(i * 2 + j) * 0.29}s` }}
                    fill={lit ? "#ff5a3c" : "#7CC4FF"} />
                </g>
              );
            })}
          </g>
        ))}
        {/* handrails */}
        <line x1={L(0.05, 0.94)[0]} y1={L(0.05, 0.94)[1]} x2={L(0.9, 0.94)[0]} y2={L(0.9, 0.94)[1]} stroke="#d9a441" strokeWidth="3" opacity="0.55" />
        <line x1={R(0.05, 0.94)[0]} y1={R(0.05, 0.94)[1]} x2={R(0.9, 0.94)[0]} y2={R(0.9, 0.94)[1]} stroke="#d9a441" strokeWidth="3" opacity="0.55" />

        {/* ceiling light strip: steady, red strobe while burning */}
        {[0.36, 0.64].map((w) => (
          <polygon key={w} points={ceil(0.12, 0.95, w - 0.025, w + 0.025)} className={lit ? "alarm-strobe" : ""}
            fill={light ?? "#ff3b30"} opacity={lit ? 0.95 : 0.6} style={{ transition: "fill 0.6s" }} />
        ))}

        {/* hatch at the far end (closes on evacuation) */}
        <circle cx={HATCH[0]} cy={HATCH[1]} r="62" fill="#1a2234" stroke="#3b4a6b" strokeWidth="5" />
        <circle cx={HATCH[0]} cy={HATCH[1]} r="50" fill="#020409" />
        <circle cx={HATCH[0]} cy={HATCH[1]} r="50" fill="#56627c" stroke="#8090b0" strokeWidth="2"
          style={{ transformBox: "fill-box", transformOrigin: "center", transform: evacuated ? "scale(1)" : "scale(0)", transition: "transform 0.9s 0.6s ease-in" }} />
        {evacuated && <text x={HATCH[0]} y={HATCH[1] + 4} textAnchor="middle" fontSize="11" fill="#FFE6C2" fontFamily="JetBrains Mono" letterSpacing="2">SEALED</text>}

        {/* vent fan */}
        <circle cx={FAN[0]} cy={FAN[1]} r="34" fill="#0b111d" stroke="#46557a" strokeWidth="3" />
        <g className={air > 0 ? "fan-spin" : ""} style={{ "--fan-dur": `${Math.max(0.25, 2.2 - 1.9 * air)}s` } as CSSProperties}>
          {[0, 72, 144, 216, 288].map((a) => (
            <path key={a} d={`M${FAN[0]},${FAN[1]} q 10,-14 0,-28 q -8,10 0,28`} fill="#7d8cb0" transform={`rotate(${a} ${FAN[0]} ${FAN[1]})`} />
          ))}
          <circle cx={FAN[0]} cy={FAN[1]} r="5" fill="#c9d3ea" />
        </g>
        {/* air streams (none when the fans are off) */}
        {air > 0 && STREAMS.map((s, i) => (
          <line key={i} x1={FAN[0] + 30} y1={s.y} x2={FAN[0] + 30 + s.w} y2={s.y} stroke="#9fd2ff" strokeWidth="1.4" strokeLinecap="round"
            className="air-stream" style={{ "--air-dur": `${Math.max(0.7, 3.2 - 2.4 * air)}s`, "--air-op": 0.15 + 0.45 * air, animationDelay: `${s.delay}s` } as CSSProperties} />
        ))}

        {/* CO₂ extinguisher on the wall */}
        <g opacity={sim?.co2Used && !co2Active ? 0.45 : 1}>
          <rect x={EXT[0] - 11} y={EXT[1] - 34} width="22" height="62" rx="8" fill="#d42b20" stroke="#ff7a6a" strokeWidth="1.5" />
          <rect x={EXT[0] - 5} y={EXT[1] - 44} width="10" height="12" rx="2" fill="#2b2b2b" />
          <path d={`M${EXT[0] + 5},${EXT[1] - 40} q 16,0 18,16`} stroke="#2b2b2b" strokeWidth="3" fill="none" />
          <rect x={EXT[0] - 9} y={EXT[1] - 8} width="18" height="12" fill="#fff" opacity="0.85" />
          <text x={EXT[0]} y={EXT[1] + 1} textAnchor="middle" fontSize="7" fill="#d42b20" fontWeight="700">CO₂</text>
        </g>

        {/* O₂ control panel + valve */}
        <polygon points={quad(R, 0.1, 0.32, 0.18, 0.46)} fill="#0b1424" stroke="#4a7bb5" strokeWidth="1.5" />
        <circle cx={VALVE[0]} cy={VALVE[1]} r="20" fill="none" stroke="#4a9bd9" strokeWidth="4" />
        <g style={{ transformBox: "fill-box", transformOrigin: "center", transform: `rotate(${(1 - o2 / o2Max) * 540}deg)`, transition: "transform 0.6s" }}>
          <line x1={VALVE[0] - 20} y1={VALVE[1]} x2={VALVE[0] + 20} y2={VALVE[1]} stroke="#4a9bd9" strokeWidth="3" />
          <line x1={VALVE[0]} y1={VALVE[1] - 20} x2={VALVE[0]} y2={VALVE[1] + 20} stroke="#4a9bd9" strokeWidth="3" />
        </g>

        {/* fire: heat zone, smoke, CO₂ cloud */}
        {sim && (
          <>
            <circle cx={FIRE[0]} cy={FIRE[1]} r={LOSS_R} fill="none" stroke="#ff5a3c" strokeOpacity="0.45" strokeDasharray="5 6" />
            <circle cx={FIRE[0]} cy={FIRE[1]} r={Math.max(6, LOSS_R * Math.sqrt(areaFrac))} fill="url(#ms-heat)"
              opacity={burning || failed ? 1 : 0.25} style={{ transition: "r 0.5s, opacity 1.5s" }} />
            <circle cx={FIRE[0] - 20} cy={FIRE[1] - 40} r={60 + 160 * areaFrac} fill="url(#ms-smoke)"
              opacity={(burning || failed ? 0.25 + 0.75 * areaFrac : 0.15 * areaFrac)} style={{ transition: "r 0.5s, opacity 2s" }} />
            {burning && EMBERS.map((e, i) => {
              const d = e.d * (0.6 + spread);
              const up = gravity * 50;
              return (
                <circle key={i} cx={FIRE[0]} cy={FIRE[1]} r={e.r} fill="#FFB873" className="ember"
                  style={{ "--dx": `${Math.cos(e.a) * d}px`, "--dy": `${Math.sin(e.a) * d - up}px`, animationDelay: `${e.delay}s` } as CSSProperties} />
              );
            })}
            {co2Active && Array.from({ length: 8 }, (_, i) => (
              <circle key={i} cx={EXT[0] + 18} cy={EXT[1] - 30} r="22" fill="url(#ms-puff)" className="co2-puff"
                style={{ "--dx": `${FIRE[0] - EXT[0] - 30 + ((i * 23) % 40) - 20}px`, "--dy": `${FIRE[1] - EXT[1] + 20 + ((i * 17) % 50) - 25}px`, animationDelay: `${i * 0.2}s` } as CSSProperties} />
            ))}
          </>
        )}

        {/* alarm wash */}
        {lit && <rect width={W} height={H} fill="url(#ms-alarm)" className={burning ? "alarm-wash" : ""} opacity={failed ? 0.9 : undefined} />}
        {good && <rect width={W} height={H} fill="#3ddc97" opacity="0.06" />}
      </svg>

      {/* flame (HTML so it can reuse the gravity-morphing Flame) */}
      {sim && (
        <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 [&>svg]:h-full [&>svg]:w-full"
          style={{ ...at(FIRE[0], FIRE[1]), width: `${11 + 24 * Math.sqrt(areaFrac)}%`, aspectRatio: "1", opacity: burning || failed ? 1 : 0,
            transition: "width 0.5s, opacity 1.2s" }}>
          <Flame gravity={gravity} intensity={Math.min(1, spread)} size={100} />
        </div>
      )}

      {/* crew */}
      {[[355, 312, 0], [470, 188, 1.3]].map(([x, y, d], i) => (
        <div key={i} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[clamp(18px,3.6vw,34px)]"
          style={{ ...(evacuated ? at(HATCH[0], HATCH[1]) : at(x, y)), opacity: evacuated ? 0 : 1, transform: `translate(-50%,-50%) scale(${evacuated ? 0.3 : 1})`,
            transition: `left 0.9s ${i * 0.15}s, top 0.9s ${i * 0.15}s, opacity 0.6s ${0.5 + i * 0.15}s, transform 0.9s` }}>
          <span className="crew-float inline-block" style={{ animationDelay: `${d}s` }}>🧑‍🚀</span>
        </div>
      ))}

    </>
  );

  return (
    <div key={use3d ? undefined : shakeKey} className={`relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-white/10 bg-[#05070d] ${shakeKey && !use3d ? "scene-shake" : ""}`}>
      {use3d ? (
        <ErrorBoundary name="module-3d" fallback={drawing}>
          <Suspense fallback={drawing}>
            <Module3D sim={sim} gravity={gravity} airflow={airflow} airMax={airMax} o2={o2} o2Max={o2Max}
              hotspots={hotspots} recommended={recommended} onChoose={onChoose} shakeKey={shakeKey} />
          </Suspense>
        </ErrorBoundary>
      ) : drawing}

      {/* status chip + clock */}
      <div className="num absolute left-3 top-3 flex items-center gap-2 text-[11px]">
        <span className={`rounded border px-2 py-0.5 uppercase tracking-[0.14em] ${
          status === "idle" ? "border-[#5BE49B]/40 bg-[#5BE49B]/10 text-[#5BE49B]"
          : burning ? "animate-pulse border-danger/60 bg-danger/20 text-[#ff8a75]"
          : good ? "border-[#3ddc97]/50 bg-[#3ddc97]/15 text-[#3ddc97]" : "border-[#FFB873]/50 bg-[#FFB873]/15 text-[#FFB873]"}`}>
          {status === "idle" ? "All systems nominal" : burning ? "🔥 Fire alarm" : E.outcomeLabel[status as E.Status]}
        </span>
        {sim && <span className="rounded bg-black/40 px-1.5 py-0.5 text-white/80">T+{sim.t.toFixed(0)} s</span>}
      </div>
      <div className="num absolute right-3 top-3 flex flex-col items-end gap-1 text-[10.5px] text-white/75">
        <span className="rounded bg-black/40 px-1.5 py-0.5">O₂ {o2.toFixed(1)} %</span>
        <span className="rounded bg-black/40 px-1.5 py-0.5">AIR {airflow.toFixed(0)} cm/s</span>
      </div>
      {sim && <span className="num absolute bottom-2 right-3 text-[10px] text-[#ff8a75]/80">dashed ring = loss line ({C.FAIL_AREA_CM2} cm²)</span>}

      {/* clickable equipment during a decision */}
      {!use3d && onChoose && hotspots.map((id) => {
        const p = HOTSPOT[id];
        if (!p) return null;
        const rec = id === recommended;
        return (
          <button key={id} onClick={() => onChoose(id)} aria-label={E.ACTIONS[id].label}
            className="group absolute z-10 h-[clamp(44px,9%,72px)] w-[clamp(44px,9%,72px)] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={at(p[0], p[1])}>
            <span className={`hotspot-ring absolute inset-0 rounded-full border-2 ${rec ? "border-cool" : "border-[#FFB873]"}`} />
            <span className={`absolute inset-0 rounded-full border-2 bg-white/5 transition group-hover:bg-white/15 ${rec ? "border-cool" : "border-[#FFB873]"}`} />
            <span className={`num absolute whitespace-nowrap ${p[0] < 200 ? "left-full top-1/2 ml-2 -translate-y-1/2" : p[0] > 600 ? "right-full top-1/2 mr-2 -translate-y-1/2" : "left-1/2 top-full mt-1 -translate-x-1/2"} rounded px-1.5 py-0.5 text-[10.5px] font-semibold shadow-lg ${rec ? "bg-cool text-[#04121f]" : "bg-[#FFB873] text-[#1a1208]"}`}>
              {E.ACTIONS[id].icon} {E.ACTIONS[id].label}{rec ? " · Nova" : ""}
            </span>
          </button>
        );
      })}

      {banner && <div className="pointer-events-none absolute inset-x-0 top-[13%] flex justify-center px-3">{banner}</div>}
    </div>
  );
}
