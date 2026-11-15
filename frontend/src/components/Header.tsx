import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { Emblem } from "./space/Emblem";
import { passportUseful } from "./sections/Passport";

const NAV = [
  ["#gravity", "Gravity"], ["#status", "Risk"], ["#danger", "Danger"],
  ["#earth-vs-space", "Earth vs Space"], ["#passport", "Passport"], ["#experiments", "Experiments"],
] as const;

/** Elapsed time since the page opened — a session clock, not real mission data. */
function useSessionClock() {
  const [t0] = useState(() => Date.now());
  const [now, setNow] = useState(t0);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const s = Math.floor((now - t0) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function Header() {
  const meta = useStore((s) => s.meta.data);
  const compareSource = useStore((s) => s.compare.data?.data_source);
  const showPassport = useStore((s) => passportUseful(s.passport.data));
  // The nav measures itself: if its links don't fully fit beside the badges, it hides instead of overlapping or clipping.
  const navRef = useRef<HTMLElement>(null);
  const [navFits, setNavFits] = useState(true);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const check = () => setNavFits(el.scrollWidth <= el.clientWidth + 1);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    check();
    return () => ro.disconnect();
  }, [showPassport, compareSource, meta]);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const setAboutOpen = useStore((s) => s.setAboutOpen);
  const clock = useSessionClock();
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[rgba(3,5,11,0.97)] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      <div className="mx-auto flex h-20 max-w-[1720px] items-center justify-between gap-6 px-6 md:px-10">
        <a href="#overview" className="flex shrink-0 items-center gap-4">
          <Emblem />
          <div className="flex flex-col">
            <span className="whitespace-nowrap font-space text-lg font-bold uppercase tracking-[0.2em] text-[#B7EDFF] md:text-xl">
              Fire Command: Zero-G
            </span>
            <span className="num text-[11px] uppercase tracking-[0.2em] text-dim">NASA Space Apps · Flame in Freefall</span>
          </div>
        </a>
        <nav ref={navRef} aria-hidden={!navFits}
          className={`num hidden min-w-0 flex-1 items-center justify-center gap-x-6 overflow-hidden text-[12px] uppercase tracking-[0.1em] text-dim lg:flex ${navFits ? "" : "invisible"}`}>
          {NAV.filter(([href]) => href !== "#earth-vs-space" || meta?.model.capabilities.gravity_effect !== false || compareSource === "mock")
            .filter(([href]) => href !== "#passport" || showPassport).map(([href, label]) => (
            <a key={href} href={href} className="whitespace-nowrap py-1 hover:text-white">{label}</a>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          {meta && (
            <span title={`${meta.n_runs} runs loaded`}
              className={`num inline-flex h-7 items-center whitespace-nowrap rounded border px-3 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                meta.data_source === "nasa" ? "border-cool/80 bg-cool/10 text-cool" : "border-dashed border-mock/80 bg-mock/10 text-mock"}`}>
              {meta.data_source === "nasa" ? "NASA Data" : "Mock Data"}
            </span>
          )}
          {meta?.model.stub && (
            <span className="num inline-flex h-7 items-center rounded border border-white/20 px-2 text-[11px] uppercase tracking-[0.14em] text-dim"
              title="Predictions come from the stub model">Stub</span>
          )}
          <span className="num hidden items-center gap-2 whitespace-nowrap rounded border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-[#FFB873] 2xl:flex"
            title="Session elapsed time">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#FFB873]" /> MET {clock}
          </span>
          <div className="num hidden overflow-hidden rounded border border-white/15 text-[11px] md:flex" role="group" aria-label="Mode">
            {(["explore", "command"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                className={`whitespace-nowrap px-3 py-1.5 uppercase tracking-[0.12em] ${mode === m ? "bg-white/10 text-white" : "text-dim hover:bg-white/5"}`}>
                {m}
              </button>
            ))}
          </div>
          <button onClick={() => setAboutOpen(true)}
            className="num whitespace-nowrap rounded border border-white/15 px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-dim hover:border-cool/50 hover:text-white">
            About
          </button>
        </div>
      </div>
    </header>
  );
}
