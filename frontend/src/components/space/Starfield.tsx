// Fixed starfield behind the whole page. Deterministic (seeded) so it never reshuffles between renders.
import { memo } from "react";

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const STARS = (() => {
  const r = rng(20241014);
  return Array.from({ length: 260 }, (_, i) => ({
    x: r() * 100, y: r() * 100,
    s: r() < 0.08 ? 1.6 + r() : 0.5 + r() * 0.9,
    o: 0.3 + r() * 0.7,
    blue: r() < 0.2,
    tw: i % 9 === 0,
  }));
})();

export const Starfield = memo(function Starfield() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0"
      style={{
        background:
          "radial-gradient(ellipse 90% 50% at 20% 25%, rgba(74,110,220,0.12), transparent 70%)," +
          "radial-gradient(ellipse 80% 40% at 85% 65%, rgba(140,80,220,0.09), transparent 65%)," +
          "linear-gradient(135deg, rgba(30,45,90,0.15) 0%, rgba(12,17,36,0.05) 50%, rgba(55,25,95,0.10) 100%), var(--space)",
      }}>
      <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        {STARS.map((st, i) => (
          <circle key={i} cx={st.x} cy={st.y} r={st.s * 0.06} className={st.tw ? "twinkle" : undefined}
            fill={st.blue ? "#B7EDFF" : "#FFFFFF"} opacity={st.o}
            style={st.tw ? { animationDelay: `${(i % 7) * 0.5}s` } : undefined} />
        ))}
      </svg>
    </div>
  );
});
