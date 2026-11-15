// Fades + floats content in the first time it scrolls into view. Off under prefers-reduced-motion.
// Safety: if IntersectionObserver never reports (some embedded/hidden browsers), content shows after 1.5 s.
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "section" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setShown(true); return; }
    let reported = false;
    const io = new IntersectionObserver(([e]) => {
      reported = true;
      if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: "0px 0px -10% 0px" });
    io.observe(el);
    const fallback = setTimeout(() => { if (!reported) setShown(true); }, 1500);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, [shown]);
  return (
    <Tag ref={ref as never} className={`${className} transition-all duration-700 ease-out ${shown ? "translate-y-0 opacity-100 blur-0" : "translate-y-8 opacity-0 blur-[2px]"}`}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}>
      {children}
    </Tag>
  );
}

/** Soft coloured nebula behind a section so each one has its own atmosphere. */
export function SectionGlow({ colors }: { colors: [string, string] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-40 top-10 h-[520px] w-[620px] rounded-full opacity-[0.16] blur-[110px]" style={{ background: colors[0] }} />
      <div className="absolute -right-40 bottom-0 h-[460px] w-[560px] rounded-full opacity-[0.12] blur-[110px]" style={{ background: colors[1] }} />
    </div>
  );
}
