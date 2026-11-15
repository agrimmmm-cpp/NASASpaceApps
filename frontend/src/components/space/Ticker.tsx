// Drives a <Canvas frameloop="demand"> at a capped frame rate, and skips frames while the page is scrolling or the tab
// is hidden. Small decorative 3D (Nova, the globe) doesn't need 60 fps, and pausing it during scroll keeps the page smooth.
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

let lastScroll = 0;
if (typeof window !== "undefined") window.addEventListener("scroll", () => { lastScroll = performance.now(); }, { passive: true });

export function Ticker({ fps = 30, pauseOnScroll = true }: { fps?: number; pauseOnScroll?: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let raf = 0, last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < 1000 / fps - 1) return;
      if (pauseOnScroll && now - lastScroll < 160) return;
      last = now;
      invalidate();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps, pauseOnScroll, invalidate]);
  return null;
}
