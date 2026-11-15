// End-of-page invitation to Command Mode: the live module scene (idle) + one button. Lives in its own section so the
// explore controls stay uncluttered.
import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store/useStore";
import { ModuleScene } from "./ModuleScene";
import { Reveal } from "../common/Reveal";

export function CommandTeaser() {
  const meta = useStore((s) => s.meta.data);
  const setMode = useStore((s) => s.setMode);
  // the 3D scene only exists while this section is on screen, so it never costs anything while you use the sliders
  const box = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Deliberately NOT subscribed to the sliders: re-rendering this animated scene on every slider move made the
  // gravity slider lag. It shows the default spacecraft; the drill itself uses the live conditions.
  const vehicle = meta?.vehicles[0];
  if (!meta || !vehicle) return null;
  const o2 = vehicle.o2_percent, air = vehicle.airflow_cm_s, g = vehicle.gravity_g;
  return (
    <section id="command-teaser" className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 [contain-intrinsic-size:auto_520px] [content-visibility:auto]">
      <Reveal>
        <div className="grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]">
          <button onClick={() => setMode("command")} className="group block text-left" aria-label="Start the fire drill">
            <div ref={box} className="aspect-[16/9] w-full overflow-hidden rounded-xl transition-transform duration-300 group-hover:scale-[1.01]">
              {inView ? <ModuleScene sim={null} gravity={g} airflow={air} airMax={meta.ranges.airflow_cm_s.max} o2={o2} o2Max={meta.ranges.o2_percent.max} />
                : <div className="h-full w-full rounded-xl border border-white/10 bg-[#05070d]" />}
            </div>
          </button>
          <div>
            <div className="num mb-2 text-[11px] uppercase tracking-[0.2em] text-[#FFB873]">Command Mode · simulation</div>
            <h2 className="font-space text-3xl font-semibold text-white sm:text-4xl">Now you're the commander.</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-white/80">
              A fire breaks out aboard your spacecraft, in the conditions you set above. Grab the extinguisher and fight it in first person —
              hesitate and it spreads to the racks until the module is lost. The model decides how fast the flame grows.
            </p>
            <button onClick={() => setMode("command")}
              className="mt-6 rounded-xl border border-[#FF6A1A]/60 bg-gradient-to-b from-[#FF7A2A] to-[#D9480F] px-6 py-3 font-space text-base font-semibold tracking-[0.18em] text-white shadow-[0_0_30px_rgba(255,106,26,0.35)] hover:brightness-110">
              START FIRE DRILL →
            </button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
