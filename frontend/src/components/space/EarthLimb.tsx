// Earth seen from orbit: a huge sphere whose top edge is the curved horizon, with a glowing atmosphere rim.
export function EarthLimb() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] overflow-hidden">
      <div className="absolute left-1/2 top-[38%] aspect-square w-[260%] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse 30% 6% at 38% 1.2%, rgba(255,255,255,0.18), transparent 70%)," +
            "radial-gradient(ellipse 18% 4% at 58% 2%, rgba(255,255,255,0.12), transparent 70%)," +
            "radial-gradient(ellipse 22% 5% at 47% 3%, rgba(40,120,80,0.35), transparent 70%)," +
            "radial-gradient(circle at 50% 0%, #1d5fa8 0%, #0d3a72 6%, #071d3d 14%, #030a18 26%)",
          boxShadow: "0 -2px 6px rgba(183,237,255,0.9), 0 -10px 40px rgba(61,217,255,0.55), 0 -40px 120px rgba(45,107,255,0.35)",
        }} />
      {/* night side: city lights on the right limb */}
      <div className="absolute right-[6%] top-[46%] h-24 w-[30%] rounded-full opacity-60"
        style={{ background: "radial-gradient(ellipse at center, rgba(255,184,115,0.25), transparent 70%)" }} />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-[var(--space)]" />
    </div>
  );
}
