// Tweens a number to its new value (≤ 400 ms, 05 §6) and renders it through a formatter from lib/format.
// Under prefers-reduced-motion it jumps straight to the value.
import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function NumberTicker({ value, format, duration = 400 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    if (reduced() || from.current === value) { from.current = value; setShown(value); return; }
    const start = performance.now(), a = from.current, b = value;
    cancelAnimationFrame(raf.current);
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - (1 - k) ** 3; // ease-out cubic
      const v = a + (b - a) * e;
      from.current = v;
      setShown(v);
      if (k < 1) raf.current = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return <span className="tabular-nums">{format(shown)}</span>;
}
