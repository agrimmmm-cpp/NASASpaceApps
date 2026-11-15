// Nova's voice: Gemini text-to-speech through the backend (/api/tts), with the browser's built-in voice as fallback.
//  - speak(): speechSynthesis — runs on-device, works offline.
//  - listen(): SpeechRecognition — only where the browser supports it. Chrome sends audio to Google's servers
//    (needs internet); Safari can recognise on-device. The mic button is hidden when unsupported.
import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "nova-auto-read"; // auto-read is opt-in; every message also has its own Read-aloud button

/** Pick the most natural-sounding English voice the browser/OS offers (Edge "Natural", macOS "Premium"/"Enhanced"). */
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const score = (v: SpeechSynthesisVoice) => {
    if (!/^en(-|_|$)/i.test(v.lang)) return -1;
    let s = 0;
    if (/natural|neural/i.test(v.name)) s += 100;       // e.g. "Microsoft Ava Online (Natural)"
    if (/premium/i.test(v.name)) s += 90;               // macOS downloadable premium voices
    if (/enhanced/i.test(v.name)) s += 80;
    if (/google (us|uk) english/i.test(v.name)) s += 50;
    if (/\b(ava|zoe|jenny|aria|emma|sonia|libby|samantha|allison|serena)\b/i.test(v.name)) s += 15;
    if (/en-us/i.test(v.lang)) s += 5;
    if (v.localService === false) s += 3;               // cloud voices are usually the higher-quality ones
    return s;
  };
  return voices.reduce<SpeechSynthesisVoice | null>((best, v) => (score(v) > (best ? score(best) : -1) ? v : best), null);
}

/** Say symbols the way a person would. */
export function speakable(text: string) {
  return text
    .replace(/mm²\/s|mm\^2\/s/g, " square millimetres per second")
    .replace(/mm\/s/g, " millimetres per second")
    .replace(/cm\/s/g, " centimetres per second")
    .replace(/kPa/g, " kilopascals")
    .replace(/O₂|O2/g, "oxygen")
    .replace(/\b(\d+(?:\.\d+)?)\s*K\b/g, "$1 kelvin")
    .replace(/\[(MOCK|Stub|Template)\]\s*/gi, "")
    .replace(/[👋🌙]/gu, "");
}

type Rec = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export function useVoice() {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  const RecCtor = typeof window !== "undefined"
    ? ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition)
    : undefined;
  const [on, setOn] = useState(() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } });
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Rec | null>(null);

  const [preparingId, setPreparingId] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const clips = useRef(new Map<string, string>());   // text -> object URL (instant replays)
  const geminiDownUntil = useRef(0);                  // after a failure, use the browser voice for a minute
  const token = useRef(0);                            // newest request wins

  const stopAll = useCallback(() => {
    token.current++;
    synth?.cancel();
    if (audio.current) { audio.current.pause(); audio.current = null; }
    setSpeaking(false); setSpeakingId(null); setPreparingId(null);
  }, [synth]);

  const toggle = useCallback(() => setOn((v) => {
    const next = !v;
    try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* storage may be blocked */ }
    if (!next) stopAll();
    return next;
  }), [stopAll]);

  const stop = stopAll;

  const browserSpeak = useCallback((text: string, id: string | null, t: number) => {
    if (!synth || t !== token.current) return;
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(synth.getVoices());
    if (v) { u.voice = v; u.lang = v.lang; }
    setVoiceName(v ? `${v.name} (browser)` : "browser voice");
    u.rate = /natural|neural|premium|enhanced/i.test(v?.name ?? "") ? 1.0 : 1.03;
    u.onstart = () => { setSpeaking(true); setSpeakingId(id); };
    u.onend = u.onerror = () => { setSpeaking(false); setSpeakingId(null); };
    synth.speak(u);
  }, [synth]);

  /** Gemini voice via /api/tts (backend keeps the key); falls back to the browser voice on any problem.
   *  auto=true: only when Auto-read is on. Manual Read-aloud passes an id so that message shows Preparing/Stop. */
  const speak = useCallback(async (raw: string, opts: { auto?: boolean; id?: string } = {}) => {
    if (!raw || (opts.auto && !on)) return;
    stopAll();
    const t = token.current;
    const id = opts.id ?? null;
    const text = speakable(raw);
    let url = clips.current.get(text);
    if (!url && Date.now() > geminiDownUntil.current) {
      setPreparingId(id ?? "auto");
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.slice(0, 800) }), signal: ctrl.signal });
        clearTimeout(timer);
        if (!r.ok || !(r.headers.get("content-type") ?? "").includes("audio")) throw new Error(`tts ${r.status}`);
        url = URL.createObjectURL(await r.blob());
        clips.current.set(text, url);
      } catch {
        geminiDownUntil.current = Date.now() + 60_000;
      }
    }
    if (t !== token.current) return;          // user pressed Stop or asked something else meanwhile
    setPreparingId(null);
    if (!url) { browserSpeak(text, id, t); return; }
    const a = new Audio(url);
    audio.current = a;
    setVoiceName("Gemini voice");
    a.onplay = () => { setSpeaking(true); setSpeakingId(id); };
    a.onended = a.onerror = () => { if (audio.current === a) { audio.current = null; setSpeaking(false); setSpeakingId(null); } };
    a.play().catch(() => browserSpeak(text, id, t)); // autoplay blocked → browser voice
  }, [on, stopAll, browserSpeak]);

  const listen = useCallback((onText: (t: string) => void) => {
    if (!RecCtor) return;
    if (listening) { rec.current?.stop(); return; }
    stopAll();
    const r = new RecCtor();
    r.lang = "en-US"; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript?.trim(); if (t) onText(t); };
    r.onend = r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  }, [RecCtor, listening, stopAll]);

  useEffect(() => () => { synth?.cancel(); audio.current?.pause(); rec.current?.stop(); clips.current.forEach((u) => URL.revokeObjectURL(u)); }, [synth]);
  // some browsers load voices lazily
  useEffect(() => { synth?.getVoices(); }, [synth]);

  return { canSpeak: true, canListen: !!RecCtor, on, toggle, speak, stop, speaking, speakingId, preparingId, voiceName, listen, listening };
}
