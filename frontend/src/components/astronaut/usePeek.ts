// When Commander Nova is fully out vs tucked behind the right edge, and what the speech bubble says.
//   arrival            → out, greeting bubble, then tuck after GREET_MS
//   scrolling          → tuck (unless the pointer is near or a tip is showing)
//   pointer near corner→ pop out: "Hey! 👋 Need a hand?"
//   new section        → peek once with a tip for that section, then tuck
// Under prefers-reduced-motion Nova never tucks (bubbles still appear).
import { useCallback, useEffect, useRef, useState } from "react";

export const GREETING = "__greeting__";
const GREET_MS = 8000;
const TIP_MS = 4500;
const NEAR_PX = 240; // pointer distance from the bottom-right corner that calls Nova out
const FAR_PX = 380;

// Tips are tied to section ids; shown once per page load each.
const TIPS: [string, string][] = [
  ["#gravity", "Click the Moon or Mars on the track! 🌙"],
  ["#status", "Ask me why the risk is what it is."],
  ["#danger", "Click any cell to jump to that mix."],
  ["#earth-vs-space", "Same fire, two worlds — ask me about it!"],
  ["#passport", "Which material would you fly? Check the grades! 🛡️"],
  ["#experiments", "Click a dot to see a real run."],
];

export function usePeek(enabled: boolean) {
  const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [out, setOut] = useState(true);
  const [bubble, setBubble] = useState<string | null>(GREETING);
  const near = useRef(false);
  const busy = useRef(true); // greeting or a tip is on screen
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const seen = useRef(new Set<string>());

  const tuck = useCallback(() => {
    if (reduced || near.current) return;
    busy.current = false;
    setBubble(null);
    setOut(false);
  }, [reduced]);

  const show = useCallback((text: string, ms: number) => {
    clearTimeout(timer.current);
    busy.current = true;
    setOut(true);
    setBubble(text);
    timer.current = setTimeout(() => { busy.current = false; if (!near.current) tuck(); else setBubble(null); }, ms);
  }, [tuck]);

  // arrival greeting
  useEffect(() => {
    timer.current = setTimeout(() => { busy.current = false; tuck(); }, GREET_MS);
    return () => clearTimeout(timer.current);
  }, [tuck]);

  useEffect(() => {
    if (!enabled) return;
    // one tip per section, the first time it crosses the middle of the screen (after the greeting).
    // A plain scroll check (not IntersectionObserver) so it behaves the same in every browser state.
    const checkTips = () => {
      if (busy.current) return; // try again on a later scroll
      const mid = window.innerHeight / 2;
      for (const [sel, tip] of TIPS) {
        if (seen.current.has(sel)) continue;
        const r = document.querySelector(sel)?.getBoundingClientRect();
        if (r && r.top < mid && r.bottom > mid) { seen.current.add(sel); show(tip, TIP_MS); return; }
      }
    };
    let pending = 0;
    const onScroll = () => {
      if (!busy.current && !near.current) tuck();
      clearTimeout(pending);
      pending = window.setTimeout(checkTips, 180); // once scrolling settles
    };
    const onMove = (e: PointerEvent) => {
      const d = Math.hypot(window.innerWidth - e.clientX, window.innerHeight - e.clientY);
      if (d < NEAR_PX && !near.current) {
        near.current = true;
        if (!busy.current) { setOut(true); setBubble("Hey! 👋 Need a hand?"); }
      } else if (d > FAR_PX && near.current) {
        near.current = false;
        if (!busy.current) setTimeout(() => { if (!near.current && !busy.current) tuck(); }, 1200);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onMove);
    return () => { clearTimeout(pending); window.removeEventListener("scroll", onScroll); window.removeEventListener("pointermove", onMove); };
  }, [enabled, tuck, show]);

  return { out: out || reduced, bubble, reduced };
}
