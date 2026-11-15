import { useEffect } from "react";
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
import { Experiments, RunDrawer } from "./components/sections/Experiments";
import { AstronautChat } from "./components/astronaut/AstronautChat";

export default function App() {
  const init = useStore((s) => s.init);
  const meta = useStore((s) => s.meta);
  const retry = useStore((s) => s.retry);
  useEffect(() => { void init(); }, [init]);

  return (
    <div className="relative min-h-screen">
      <Starfield />
      <Header />
      <div className="h-20" />
      <TelemetryBar />
      {meta.status !== "ready" && (
        <div className="num relative z-40 border-b border-white/10 bg-[#070B14]/90 px-6 py-2 text-center text-[13px]">
          {meta.status === "error" ? (
            <span className="text-danger">
              Can't reach the mission server: {meta.error?.message}
              <button className="ml-3 rounded border border-white/20 px-2 py-0.5 text-xs uppercase" onClick={() => retry("meta")}>Retry</button>
            </span>
          ) : <span className="text-dim">Connecting to mission server…</span>}
        </div>
      )}
      <main className="relative z-10">
        {/* each section is isolated (I-22) */}
        <ErrorBoundary name="hero"><Hero /></ErrorBoundary>
        <ErrorBoundary name="gravity"><Gravity /></ErrorBoundary>
        <ErrorBoundary name="status"><Status /></ErrorBoundary>
        <ErrorBoundary name="danger"><Danger /></ErrorBoundary>
        <ErrorBoundary name="compare"><Compare /></ErrorBoundary>
        <ErrorBoundary name="experiments"><Experiments /></ErrorBoundary>
      </main>
      <ErrorBoundary name="astronaut-chat" fallback={null}><AstronautChat /></ErrorBoundary>
      <RunDrawer />
      <footer className="num relative z-10 border-t border-white/10 bg-[var(--space)]/80 px-6 py-4 text-center text-[12px] text-dim">
        Research and education demo — not operational fire-safety guidance.
        {meta.data && ` Data: ${meta.data.data_source === "nasa" ? "NASA experiment runs" : "mock runs (real NASA data coming)"} · ${meta.data.n_runs} runs.`}
      </footer>
    </div>
  );
}
