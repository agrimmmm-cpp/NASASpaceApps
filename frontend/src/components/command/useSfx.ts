// Tiny synthesized sound effects for Command Mode (Web Audio, no files). Starts only after a click (IGNITE),
// remembers mute in localStorage.
import { useCallback, useMemo, useRef, useState } from "react";

const KEY = "command-sfx";

export function useSfx() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } });
  const ctx = useRef<AudioContext | null>(null);
  const onRef = useRef(on);
  onRef.current = on;

  const hiss = useRef<{ src: AudioBufferSourceNode; g: GainNode } | null>(null);
  const audio = useCallback(() => {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx.current ??= new AC();
    if (ctx.current.state === "suspended") void ctx.current.resume();
    return ctx.current;
  }, []);
  const noise = useCallback((c: AudioContext, seconds: number) => {
    const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }, []);
  /** Extinguisher hiss: filtered white noise while spraying. */
  const spray = useCallback((on: boolean) => {
    try {
      if (!on || !onRef.current) { if (hiss.current) { hiss.current.g.gain.value = 0; hiss.current.src.stop(); hiss.current = null; } return; }
      if (hiss.current) return;
      const c = audio();
      const src = c.createBufferSource(); src.buffer = noise(c, 2); src.loop = true;
      const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1800;
      const g = c.createGain(); g.gain.value = 0.06;
      src.connect(f).connect(g).connect(c.destination); src.start();
      hiss.current = { src, g };
    } catch { /* audio unavailable */ }
  }, [audio, noise]);
  /** Fire spreading: low filtered noise burst. */
  const whoosh = useCallback(() => {
    if (!onRef.current) return;
    try {
      const c = audio();
      const src = c.createBufferSource(); src.buffer = noise(c, 1);
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 500;
      const g = c.createGain(); const t0 = c.currentTime;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.25, t0 + 0.15); g.gain.linearRampToValueAtTime(0, t0 + 0.9);
      src.connect(f).connect(g).connect(c.destination); src.start(); src.stop(t0 + 1);
    } catch { /* audio unavailable */ }
  }, [audio, noise]);

  const tone = useCallback((freq: number, start: number, dur: number, type: OscillatorType = "square", vol = 0.05) => {
    if (!onRef.current) return;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx.current ??= new AC();
      const c = ctx.current;
      if (c.state === "suspended") void c.resume();
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      const t0 = c.currentTime + start;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
      g.gain.linearRampToValueAtTime(0, t0 + dur);
      o.connect(g).connect(c.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch { /* audio unavailable */ }
  }, []);

  const toggle = useCallback(() => setOn((v) => {
    try { localStorage.setItem(KEY, v ? "0" : "1"); } catch { /* ignore */ }
    return !v;
  }), []);

  return useMemo(() => ({
    on, toggle, spray, whoosh,
    alarm: () => { for (let i = 0; i < 3; i++) { tone(880, i * 0.5, 0.22); tone(660, i * 0.5 + 0.25, 0.22); } },
    decision: () => { tone(1046, 0, 0.12, "sine", 0.08); tone(1318, 0.14, 0.18, "sine", 0.08); },
    success: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.25, "sine", 0.07)); },
    fail: () => { tone(220, 0, 0.6, "sawtooth", 0.05); tone(165, 0.3, 0.8, "sawtooth", 0.05); },
  }), [on, toggle, tone, spray, whoosh]);
}
