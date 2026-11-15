// "Real NASA missions": the experiments behind the data, with links out to NASA, plus ways to follow the real station.
// Run counts come from /api/runs (nothing hardcoded); links from content/nasaLinks.ts.
import { useStore } from "../../store/useStore";
import { MISSIONS, STATION_LINKS } from "../../content/nasaLinks";
import { Reveal, SectionGlow } from "../common/Reveal";
import candlePhoto from "../../assets/nasa/candle-microgravity.jpg";
import fabricPhoto from "../../assets/nasa/saffire-fabric.jpg";

const PHOTO: Record<string, { src: string; caption: string }> = {
  FLEX: { src: candlePhoto, caption: "A flame in microgravity · NASA" },
  Saffire: { src: fabricPhoto, caption: "Saffire fabric burn · NASA" },
};

const Ext = ({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
);

export function NasaMissions() {
  const runs = useStore((s) => s.runs.data?.runs);
  const source = useStore((s) => s.meta.data?.data_source);
  const count = (exp: string) => runs?.filter((r) => r.experiment === exp).length ?? null;

  return (
    <section id="nasa" className="relative z-10 px-6 py-24 md:px-12">
      <SectionGlow colors={["#2D6BFF", "#5FE6FF"]} />
      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="mb-10 text-center">
          <span className="eyebrow text-cool">Real missions</span>
          <h2 className="mt-3 font-space text-4xl font-bold tracking-tight text-white md:text-5xl">The NASA experiments behind this</h2>
          <p className="mx-auto mt-3 max-w-2xl text-[17px] text-dim">
            These are real fires, lit on purpose in space so we can learn how to stop them. Open the data and follow the station yourself.
          </p>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-2">
          {MISSIONS.map((m, i) => {
            const n = count(m.id);
            const ph = PHOTO[m.id];
            return (
              <Reveal key={m.id} delay={i * 80} className="h-full">
                <article className="glass group flex h-full flex-col overflow-hidden rounded-2xl transition-[transform,border-color] duration-200 hover:-translate-y-1 hover:border-white/25">
                  <div className="relative h-40 overflow-hidden">
                    <img src={ph.src} alt="" className="h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0D1424] via-[#0D1424]/30 to-transparent" />
                    <span className="num absolute bottom-2 right-3 text-[10px] text-white/60">{ph.caption}</span>
                    <div className="absolute bottom-3 left-4">
                      <div className="font-space text-2xl font-bold text-white">{m.name}</div>
                      <div className="num text-[11px] uppercase tracking-[0.14em] text-cool">{m.full}</div>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="num mb-2 text-[11px] text-dim">📍 {m.where}{n !== null && source === "nasa" && <> · <b className="text-white">{n}</b> runs used here</>}</div>
                    <p className="text-[14px] leading-relaxed text-white/85">{m.what}</p>
                    <p className="mt-2 text-[13px] text-[#FFB873]">→ {m.why}</p>
                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      {m.links.map((l) => (
                        <Ext key={l.href} href={l.href}
                          className="num inline-flex items-center gap-1.5 rounded-full border border-cool/40 bg-cool/10 px-3 py-1.5 text-[11.5px] font-semibold text-cool hover:bg-cool/20">
                          <span title={l.note}>{l.label}</span><span aria-hidden>↗</span>
                        </Ext>
                      ))}
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal className="mt-10">
          <div className="num mb-3 text-center text-[11px] uppercase tracking-[0.2em] text-dim">Follow the real station</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STATION_LINKS.map((l) => (
              <Ext key={l.href} href={l.href}
                className="glass group flex flex-col rounded-xl p-4 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-cool/40">
                <span className="text-2xl" aria-hidden>{l.icon}</span>
                <span className="mt-2 flex items-center gap-1 text-[14px] font-semibold text-white">{l.label}<span className="text-cool opacity-60 group-hover:opacity-100" aria-hidden>↗</span></span>
                <span className="mt-1 text-[12px] leading-snug text-dim">{l.note}</span>
              </Ext>
            ))}
          </div>
          <p className="num mt-3 text-center text-[10.5px] text-dim">Links open nasa.gov in a new tab. The rest of this site works offline.</p>
        </Reveal>
      </div>
    </section>
  );
}
