// "Start here": a 4-stop guide under the hero so a first-time visitor (or judge) reaches the key parts in a minute.
import { useStore } from "../../store/useStore";

const STOPS = [
  { n: "1", icon: "🔬", title: "Which NASA research matters", text: "Pick a habitat — ISS, Moon base, Mars — and see the experiments that matter most, ranked.", href: "#investigations" },
  { n: "2", icon: "🔥", title: "Predict a fire", text: "Risk for your cabin conditions, from 190 real NASA runs — and how sure we are.", href: "#status" },
  { n: "3", icon: "🗺", title: "Find the safe zone", text: "Where oxygen and airflow turn dangerous, with a safer option to try.", href: "#danger" },
  { n: "4", icon: "🧯", title: "Take command", text: "Fight a fire in a 3D station module. Wait too long and it spreads.", href: "command" },
] as const;

export function StartHere() {
  const setMode = useStore((s) => s.setMode);
  const go = (href: string) => {
    if (href === "command") { setMode("command"); return; }
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <section aria-label="Start here" className="relative z-10 mx-auto -mt-6 max-w-6xl px-6 pb-10 md:px-12">
      <div className="glass rounded-2xl p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="label text-cool">Start here · 1-minute tour</span>
          <span className="num text-[11px] text-dim">NASA FLEX + Saffire-II data · AI insights · research & education tool</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STOPS.map((s) => (
            <button key={s.n} onClick={() => go(s.href)}
              className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-cool/50">
              <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cool/15 text-[13px] font-bold text-cool">{s.n}</span>
              <span>
                <span className="flex items-center gap-1.5 text-[14px] font-semibold text-white"><span aria-hidden>{s.icon}</span>{s.title}
                  <span className="text-cool opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>→</span></span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-dim">{s.text}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
