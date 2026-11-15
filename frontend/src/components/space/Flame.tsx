// <Flame gravity intensity size /> (05 §9): continuous morph from a dim blue sphere (0 g) to a bright orange
// teardrop (1 g). Shape and colors are interpolated, never swapped. Static under prefers-reduced-motion (CSS).
import { useId } from "react";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mix(c1: string, c2: string, t: number) {
  const p = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(lerp(p(c1, i), p(c2, i), t))).join(",")})`;
}

function shapePath(t: number, r: number, c: number) {
  // radius stretched upward by a cos^4 lobe; t=0 → circle, t=1 → teardrop ~2.6r tall
  const k = 1.7 * t;
  const pts: string[] = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const up = Math.max(0, Math.cos(a)); // a=0 → straight up
    const rr = r * (1 + k * up ** 4) * (1 - 0.12 * t * Math.max(0, -Math.cos(a)));
    pts.push(`${(c + rr * Math.sin(a)).toFixed(2)},${(c + r * 0.55 * t - rr * Math.cos(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

export function Flame({ gravity, intensity = 0.5, size = 160 }: { gravity: number; intensity?: number; size?: number }) {
  const id = useId().replace(/:/g, "");
  const t = Math.min(1, Math.max(0, gravity));
  const v = 100;
  const r = lerp(20, 17, t);
  const core = mix("#EAF7FF", "#FFE7A8", t);
  const mid = mix("#4AA8FF", "#FF9A1F", t);
  const edge = mix("#2D6BFF", "#FF4B1A", t);
  const halo = mix("#2D6BFF", "#FF6A1A", t);
  const glow = 0.35 + 0.45 * Math.min(1, Math.max(0, intensity));
  return (
    // the pulse animates the whole <svg> (GPU transform) instead of a filtered group inside it, so nothing is re-rendered per frame
    <svg width={size} height={size} viewBox={`0 0 ${v} ${v}`} role="img" className="flame-pulse"
      aria-label={t < 0.05 ? "Spherical microgravity flame" : `Flame at ${t.toFixed(2)} g`}>
      <defs>
        <radialGradient id={`f${id}`} cx="50%" cy={`${lerp(50, 62, t)}%`} r="60%">
          <stop offset="0%" stopColor={core} />
          <stop offset="35%" stopColor={mid} />
          <stop offset="100%" stopColor={edge} stopOpacity={lerp(0.85, 0.95, t)} />
        </radialGradient>
        <filter id={`b${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={lerp(2.4, 1.2, t)} />
        </filter>
        <filter id={`h${id}`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <circle cx="50" cy="52" r={lerp(30, 26, t)} fill={halo} opacity={glow * 0.55} filter={`url(#h${id})`} />
      <g>
        <path d={shapePath(t, r, 50)} fill={`url(#f${id})`} filter={`url(#b${id})`} opacity={lerp(0.8, 1, t)} />
        <ellipse cx="50" cy={lerp(50, 60, t)} rx={r * 0.35} ry={r * lerp(0.35, 0.5, t)} fill={core} opacity="0.85"
          filter={`url(#b${id})`} />
      </g>
    </svg>
  );
}
