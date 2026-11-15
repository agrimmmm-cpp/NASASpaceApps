// Commander Nova: the floating 3D astronaut that IS the chatbot. Waves on arrival, opens a chat on click,
// "thinks" while /api/ask runs and "talks" when the answer arrives. Answers cite runs (I-11) and carry the
// AI / Template / MOCK tags (I-09). The question text is sent as-is; the backend treats it as untrusted.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useStore, scenarioOf } from "../../store/useStore";
import { api, ApiFailure } from "../../api/client";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { RunChip, SourceTags } from "../common/RunChip";
import type { AskResponse } from "../../types";
import type { Mood } from "./Astronaut3D";
import { GREETING as GREET_BUBBLE, usePeek } from "./usePeek";

const Astronaut3D = lazy(() => import("./Astronaut3D"));
const NAME = "Commander Nova";
const EXAMPLES = [
  "Why is the flame cooler in space?",
  "Does more airflow put the flame out?",
  "What makes this scenario risky?",
];
const MAX = 500;
const GREETING = /^(hi+|hello|hey+|yo|hiya|good (morning|afternoon|evening)|thanks|thank you|thx|ty)[\s!.?]*$/i;

type Msg =
  | { role: "user"; text: string }
  | { role: "local"; text: string } // small talk handled in the UI, no API call, no data claims
  | { role: "nova"; res: AskResponse }
  | { role: "error"; text: string; question: string };

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MIN_THINK_MS = 1100; // Nova always visibly "thinks" before answering

/** Reveals text word by word (≤ ~2.2 s total), then calls onDone. Instant under reduced motion. */
function Typewriter({ text, onDone }: { text: string; onDone?: () => void }) {
  const words = text.split(/(\s+)/);
  const [n, setN] = useState(() => (reducedMotion() ? words.length : 0));
  const done = useRef(false);
  useEffect(() => {
    if (n >= words.length) { if (!done.current) { done.current = true; onDone?.(); } return; }
    const step = Math.max(1, Math.ceil(words.length / 70));
    const id = setTimeout(() => setN((x) => Math.min(words.length, x + step)), 32);
    return () => clearTimeout(id);
  }, [n, words.length, onDone]);
  return <>{words.slice(0, n).join("")}{n < words.length && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-cool align-middle" />}</>;
}

function Nova({ mood, size }: { mood: Mood; size: number }) {
  const fallback = (
    <div style={{ width: size, height: size }} className="flex items-center justify-center text-5xl" aria-hidden>🧑‍🚀</div>
  );
  return (
    <ErrorBoundary name="astronaut" fallback={fallback}>
      <Suspense fallback={fallback}><Astronaut3D mood={mood} size={size} /></Suspense>
    </ErrorBoundary>
  );
}

export function AstronautChat() {
  const open = useStore((s) => s.chatOpen);
  const setOpen = useStore((s) => s.setChatOpen);
  const meta = useStore((s) => s.meta.data);
  const [hover, setHover] = useState(false);
  const peek = usePeek(!open);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);
  const [typing, setTyping] = useState<number | null>(null); // index of the message being typed out
  const [greetTyped, setGreetTyped] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }); }, [msgs, pending, typing]);
  // keep the transcript pinned to the bottom while an answer types out
  useEffect(() => {
    if (typing === null) return;
    const id = setInterval(() => list.current?.scrollTo({ top: list.current.scrollHeight }), 120);
    return () => clearInterval(id);
  }, [typing]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  async function ask(question: string) {
    const text = question.trim();
    const sc = scenarioOf(useStore.getState());
    if (!text || !sc || pending || typing !== null) return;
    setQ("");
    setMsgs((m) => [...m, { role: "user", text }]);
    const think = reducedMotion() ? 0 : MIN_THINK_MS;
    const reply = (msg: Msg) => setMsgs((m) => { setTyping(m.length); return [...m, msg]; });
    setPending(true);
    if (GREETING.test(text)) {
      const thanks = /thank|thx|ty/i.test(text);
      await sleep(think * 0.6);
      setPending(false);
      reply({ role: "local", text: thanks
        ? "Anytime! Change the scenario above and ask me again — I'll check the runs for you."
        : "Hey there! 👋 I'm Nova. Ask me how oxygen, airflow, pressure or gravity change this fire — I'll answer from the experiment runs." });
      return;
    }
    try {
      const [res] = await Promise.all([api.ask({ question: text, scenario: sc }), sleep(think)]);
      setPending(false);
      reply({ role: "nova", res });
    } catch (e) {
      const msg = e instanceof ApiFailure ? e.body.message : "I lost the signal. Try again?";
      setMsgs((m) => [...m, { role: "error", text: msg, question: text }]);
    } finally {
      setPending(false);
    }
  }

  const mood: Mood = pending ? "thinking" : typing !== null ? "talking" : peek.bubble || hover ? "wave" : "idle";
  const doneTyping = useCallback(() => setTyping(null), []);
  const mock = meta?.data_source === "mock";

  if (!open) {
    return (
      <div className="fixed bottom-4 right-4 z-[55] flex items-end gap-2 transition-transform duration-700 ease-[cubic-bezier(.34,1.56,.64,1)]"
        // tucked: slide most of the way off the right edge, tilted, still peeking
        style={{ transform: peek.out || hover ? "none" : "translateX(64%) rotate(-14deg)" }}>
        {(peek.bubble || hover) && (peek.out || hover) && (
          <div key={peek.bubble ?? "hover"} className="glass mb-16 max-w-[230px] rounded-2xl rounded-br-sm px-4 py-3 text-[14px] leading-snug shadow-2xl [animation:fadein_250ms_ease]">
            {peek.bubble === GREET_BUBBLE || (!peek.bubble && hover) ? (
              <>
                <b className="text-white"><Typewriter text={`Hi! 👋 I'm ${NAME.split(" ")[1]}.`} onDone={() => setGreetTyped(true)} /></b>{" "}
                {(greetTyped || hover) && <span className="text-dim">Ask me anything about fire in space.</span>}
              </>
            ) : (
              <span className="text-white"><Typewriter text={peek.bubble ?? ""} /></span>
            )}
          </div>
        )}
        <button onClick={() => setOpen(true)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          aria-label={`Open chat with ${NAME}`}
          className="relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cool">
          <span className="absolute inset-4 rounded-full bg-cool/20 blur-3xl" aria-hidden />
          <Nova mood={mood} size={176} />
          <span className="num absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-cool/50 bg-[#070B14]/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-cool">
            Ask me
          </span>
        </button>
      </div>
    );
  }

  return (
    <div role="dialog" aria-label={`Chat with ${NAME}`}
      className="glass fixed bottom-4 right-4 z-[55] flex max-h-[min(640px,calc(100vh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl shadow-2xl">
      <header className="relative flex items-center gap-3 border-b border-white/10 bg-gradient-to-b from-cool/10 to-transparent px-4 pt-2">
        <Nova mood={mood} size={124} />
        <div className="min-w-0 flex-1 pb-2">
          <p className="font-space text-lg font-bold text-white">{NAME}</p>
          <p className="text-[12px] text-dim">
            {pending ? "Checking the experiment logs…" : `Answers from ${meta?.n_runs ?? "the"} ${meta?.data_source === "nasa" ? "NASA" : "mock"} runs for your current scenario`}
          </p>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close chat"
          className="num absolute right-3 top-3 rounded-full border border-white/15 px-2.5 py-1 text-[12px] text-dim hover:text-white">✕</button>
      </header>

      <div ref={list} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <div className="space-y-3">
            <div className="max-w-[90%] rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.04] px-4 py-3 text-[14px] leading-relaxed">
              Hi! I'm {NAME.split(" ")[1]}, your fire-lab astronaut. Ask me about the scenario you've set up — I'll answer from the
              experiment runs and show you which ones.
            </div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((x) => (
                <button key={x} onClick={() => void ask(x)}
                  className="rounded-full border border-cool/30 bg-cool/5 px-3 py-1.5 text-[13px] text-cool hover:bg-cool/15">{x}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm border border-cool/40 bg-gradient-to-br from-cool/30 to-[#2D6BFF]/25 px-4 py-2.5 text-[14px] text-white shadow-lg">{m.text}</div>
          ) : m.role === "local" ? (
            <div key={i} className="w-fit max-w-[92%] rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.06] px-4 py-3 text-[14px] leading-relaxed">
              {typing === i ? <Typewriter text={m.text} onDone={doneTyping} /> : m.text}
            </div>
          ) : m.role === "nova" ? (
            <div key={i} className="w-fit max-w-[92%] rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.06] px-4 py-3">
              <p className="text-[14px] leading-relaxed">{typing === i ? <Typewriter text={m.res.answer} onDone={doneTyping} /> : m.res.answer}</p>
              {typing !== i && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 [animation:fadein_300ms_ease]">
                  {m.res.cited_run_ids.map((id) => <RunChip key={id} id={id} />)}
                  <SourceTags gen={m.res.generated_by} mock={m.res.data_source === "mock"} />
                </div>
              )}
            </div>
          ) : (
            <div key={i} role="alert" className="w-fit max-w-[92%] rounded-2xl rounded-tl-sm border border-danger/40 bg-danger/10 px-4 py-3 text-[14px]">
              {m.text}{" "}
              <button onClick={() => { setMsgs((ms) => ms.filter((_, j) => j !== i)); void ask(m.question); }}
                className="num ml-1 rounded border border-white/20 px-2 py-0.5 text-[11px] uppercase hover:bg-white/10">Retry</button>
            </div>
          ),
        )}
        {pending && (
          <div className="flex w-fit items-center gap-3 rounded-2xl rounded-tl-sm border border-cool/25 bg-cool/[0.06] px-4 py-3" aria-label="Nova is thinking">
            <span className="text-[13px] text-cool">Checking the experiment runs</span>
            <span className="flex gap-1">
              {[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-cool" style={{ animationDelay: `${d * 0.15}s` }} />)}
            </span>
          </div>
        )}
      </div>

      <form className="border-t border-white/10 p-3" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
        <div className="flex gap-2">
          <input ref={input} value={q} maxLength={MAX} onChange={(e) => setQ(e.target.value)} placeholder={`Ask ${NAME.split(" ")[1]}…`}
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-[#0A0E1A] px-3 text-[14px] focus:outline-none focus:ring-1 focus:ring-cool" />
          <button disabled={pending || typing !== null || !q.trim()}
            className="num rounded-xl border border-cool bg-cool/10 px-4 text-[12px] font-semibold uppercase tracking-wider text-cool hover:bg-cool/20 disabled:opacity-40">
            Send
          </button>
        </div>
        <div className="num mt-1 flex justify-between text-[11px] text-dim">
          <span>{mock ? "Mock data — answers describe simulated runs" : "Answers cite real NASA runs"}</span>
          <span>{q.length}/{MAX}</span>
        </div>
      </form>
    </div>
  );
}
