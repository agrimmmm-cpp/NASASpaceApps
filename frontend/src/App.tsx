import { useEffect, useState } from "react";
import { useStore } from "./store/useStore";
import { Header } from "./components/Header";
import { TelemetryBar } from "./components/TelemetryBar";
import { Starfield } from "./components/space/Starfield";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { Hero } from "./components/sections/Hero";
import { Gravity } from "./components/sections/Gravity";
import { Status } from "./components/sections/Status";
import { Danger } from "./components/sections/Danger";
import { Compare } from "./components/sections/Compare";
import { Passport } from "./components/sections/Passport";
import { Experiments, RunDrawer } from "./components/sections/Experiments";
import { AstronautChat } from "./components/astronaut/AstronautChat";
import { AboutModal } from "./components/AboutModal";
import { MissionReport, printReport } from "./components/MissionReport";
import { CommandMode } from "./components/command/CommandMode";
import { Investigations } from "./components/sections/Investigations";
import { StartHere } from "./components/sections/StartHere";
import { HowItWorks } from "./components/sections/HowItWorks";
import { NasaMissions } from "./components/sections/NasaMissions";
import { CommandTeaser } from "./components/command/CommandTeaser";

/** Shown while /api/meta is loading. After a few seconds it explains the free-hosting wake-up instead of looking broken. */
function WakingUp() {
  const [secs, setSecs] = useState(0);
  useEffect(() => { const id = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(id); }, []);
  if (secs < 4) return <span className="text-dim">Connecting to mission server…</span>;
  const frac = Math.min(1, secs / 60);
  return (
    <span className="inline-flex flex-col items-center gap-1.5 text-[#FFB873]">
      <span>🛰 Waking up the mission server — free hosting sleeps when idle, this takes up to a minute ({secs}s)</span>
      <span className="block h-1 w-64 overflow-hidden rounded bg-white/10"><span className="block h-full bg-[#FFB873] transition-[width] duration-1000" style={{ width: `${frac * 100}%` }} /></span>
    </span>
  );
}

export default function App() {
  const init = useStore((s) => s.init);
  const meta = useStore((s) => s.meta);
  const retry = useStore((s) => s.retry);
  const mode = useStore((s) => s.mode);
  useEffect(() => { void init(); }, [init]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }, [mode]);

  return (
    <div className="app-root relative min-h-screen">
      <Starfield />
      <Header />
      <div className="h-20" />
      {mode === "explore" && <TelemetryBar />}
      {meta.status !== "ready" && (
        <div className="num relative z-40 border-b border-white/10 bg-[#070B14]/90 px-6 py-2 text-center text-[13px]">
          {meta.status === "error" ? (
            <span className="text-danger">
              Can't reach the mission server: {meta.error?.message}
              <button className="ml-3 rounded border border-white/20 px-2 py-0.5 text-xs uppercase" onClick={() => retry("meta")}>Retry</button>
            </span>
          ) : <WakingUp />}
        </div>
      )}
      {mode === "command" ? (
        <main className="relative z-10"><ErrorBoundary name="command"><CommandMode /></ErrorBoundary></main>
      ) : (
      <main className="relative z-10">
        {/* each section is isolated (I-22) */}
        <ErrorBoundary name="hero"><Hero /></ErrorBoundary>
        <ErrorBoundary name="start-here" fallback={null}><StartHere /></ErrorBoundary>
        <ErrorBoundary name="gravity"><Gravity /></ErrorBoundary>
        <ErrorBoundary name="status"><Status /></ErrorBoundary>
        <ErrorBoundary name="danger"><Danger /></ErrorBoundary>
        <ErrorBoundary name="compare"><Compare /></ErrorBoundary>
        <ErrorBoundary name="passport"><Passport /></ErrorBoundary>
        <ErrorBoundary name="experiments"><Experiments /></ErrorBoundary>
        <ErrorBoundary name="investigations"><Investigations /></ErrorBoundary>
        <ErrorBoundary name="how" fallback={null}><HowItWorks /></ErrorBoundary>
        <ErrorBoundary name="nasa-missions" fallback={null}><NasaMissions /></ErrorBoundary>
        <ErrorBoundary name="command-teaser" fallback={null}><CommandTeaser /></ErrorBoundary>
      </main>
      )}
      <ErrorBoundary name="astronaut-chat" fallback={null}><AstronautChat /></ErrorBoundary>
      <RunDrawer />
      <ErrorBoundary name="about" fallback={null}><AboutModal /></ErrorBoundary>
      <div id="mission-report-wrap" aria-hidden><ErrorBoundary name="report" fallback={null}><MissionReport /></ErrorBoundary></div>
      <footer className="num relative z-10 border-t border-white/10 bg-[rgba(3,5,11,0.85)] px-6 py-4 text-center text-[12px] text-dim">
        Research and education demo — not operational fire-safety guidance.
        {meta.data && ` Data: ${meta.data.data_source === "nasa" ? "NASA experiment runs" : "mock runs (real NASA data coming)"} · ${meta.data.n_runs} runs. `}
        <button onClick={() => useStore.getState().setAboutOpen(true)} className="text-cool underline-offset-2 hover:underline">About the data</button>
        {" · "}<button onClick={printReport} className="text-cool underline-offset-2 hover:underline">Download fire-safety report</button>
      </footer>
    </div>
  );
}
