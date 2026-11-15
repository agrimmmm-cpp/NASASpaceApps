// Cited-run chip (opens the run drawer) and the AI / Template / MOCK source tags (I-09, 05 §4 panel 8).
import { useStore } from "../../store/useStore";

export function RunChip({ id }: { id: string }) {
  const selectRun = useStore((s) => s.selectRun);
  return (
    <button onClick={() => selectRun(id)}
      className="num rounded border border-cool/40 bg-cool/10 px-2 py-0.5 text-[11px] font-semibold text-cool hover:bg-cool/20">{id}</button>
  );
}

export function SourceTags({ gen, mock }: { gen: "llm" | "template"; mock: boolean }) {
  return (
    <span className="ml-auto flex gap-1.5">
      <span className="num rounded border border-white/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-dim">{gen === "llm" ? "AI" : "Template"}</span>
      {mock && <span className="num rounded border border-dashed border-mock px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-mock">Mock</span>}
    </span>
  );
}
