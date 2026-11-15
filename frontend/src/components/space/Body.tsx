// Artwork for a gravity mark. Picked by the mark's label from /api/meta (art only — values come from meta).
const BASE = "relative overflow-hidden rounded-full border shadow-lg";
const LIGHT = "radial-gradient(circle at 28% 35%, rgba(255,255,255,0.45), transparent 58%)";
const NIGHT = "linear-gradient(90deg, transparent 55%, rgba(2,4,10,0.92) 92%)";

export function Body({ label, size = 88, active }: { label: string; size?: number; active?: boolean }) {
  const l = label.toLowerCase();
  const ring = active ? "0 0 0 3px var(--cool), 0 0 24px rgba(61,217,255,0.55)" : undefined;
  const style = (bg: string) => ({ width: size, height: size, background: `${LIGHT}, ${NIGHT}, ${bg}`, boxShadow: ring });
  if (l.includes("micro") || l.includes("orbit")) {
    return (
      <div className={`${BASE} flex items-center justify-center border-cool/60 bg-[#060a14]`}
        style={{ width: size, height: size, boxShadow: ring ?? "0 0 18px rgba(61,217,255,0.25)" }}>
        <svg viewBox="0 0 100 100" width={size * 0.72} height={size * 0.72} aria-hidden>
          {[8, 74].map((x) => (
            <g key={x}>
              <rect x={x} y="22" width="18" height="56" rx="1.5" fill="#0B2347" stroke="#3DD9FF" strokeWidth="1.2" />
              {[36, 50, 64].map((y) => <line key={y} x1={x} x2={x + 18} y1={y} y2={y} stroke="#FFC83D" strokeWidth="1" />)}
            </g>
          ))}
          <line x1="6" x2="94" y1="50" y2="50" stroke="#EAF0FA" strokeWidth="2.5" />
          <rect x="46" y="32" width="8" height="36" rx="2" fill="#869398" stroke="#3DD9FF" />
          <rect x="41" y="42" width="18" height="16" rx="2" fill="#EAF0FA" stroke="#3DD9FF" strokeWidth="1.5" />
        </svg>
      </div>
    );
  }
  if (l.includes("moon")) {
    return (
      <div className={`${BASE} border-white/20`} style={style("radial-gradient(circle at 30% 30%, #e2e8f0, #94a3b8 45%, #334155)")}>
        <span className="absolute left-[20%] top-[22%] h-[22%] w-[26%] rounded-full bg-[#475569]/70 shadow-inner" />
        <span className="absolute bottom-[22%] left-[30%] h-[28%] w-[28%] rounded-full bg-[#334155]/75 shadow-inner" />
        <span className="absolute left-[52%] top-[34%] h-[12%] w-[12%] rounded-full bg-[#475569]/60 shadow-inner" />
      </div>
    );
  }
  if (l.includes("mars")) {
    return (
      <div className={`${BASE} border-fire/40`} style={style("radial-gradient(circle at 30% 30%, #f97316, #c2410c 45%, #431407)")}>
        <span className="absolute left-[28%] top-[2%] h-[9%] w-[28%] rounded-full bg-white/80 blur-[0.5px]" />
        <span className="absolute left-[16%] top-[38%] h-[12%] w-[46%] -rotate-12 rounded-full bg-[#5A1A05]/70" />
        <span className="absolute bottom-[18%] left-[26%] h-[22%] w-[36%] rounded-full bg-[#4A1504]/70 blur-[1px]" />
      </div>
    );
  }
  if (l.includes("earth")) {
    return (
      <div className={`${BASE} border-cool/40`} style={style("radial-gradient(circle at 30% 30%, #38bdf8, #0369a1 50%, #082f49)")}>
        <span className="absolute left-[14%] top-[18%] h-[26%] w-[32%] rounded-[45%] bg-[#3f7d3a]/80 blur-[0.5px]" />
        <span className="absolute bottom-[16%] left-[24%] h-[30%] w-[28%] rounded-[40%] bg-[#4d7c2f]/75 blur-[0.5px]" />
        <span className="absolute left-[8%] top-[34%] h-[9%] w-[40%] rotate-12 rounded-full bg-white/75 blur-[1px]" />
        <span className="absolute bottom-[28%] left-[18%] h-[8%] w-[52%] -rotate-6 rounded-full bg-white/80 blur-[1px]" />
      </div>
    );
  }
  return <div className={`${BASE} border-white/20`} style={style("radial-gradient(circle at 30% 30%, #94a3b8, #1e293b)")} />;
}
