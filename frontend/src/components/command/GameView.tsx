// Full-screen, real-time Command Mode. You are inside the module: grab the CO₂ extinguisher and hold the mouse on the
// flames to knock them down, switch the fans / O₂ supply, or seal the hatch and evacuate. Fires that get big spread
// to the racks; smoke fills the module as damage builds. Rules live in src/sim/game.ts (model-driven growth and
// self-extinction; everything else is a labelled game rule). Lazy-loaded (three.js).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Scenario } from "../../types";
import { api } from "../../api/client";
import * as E from "../../sim/engine";
import * as G from "../../sim/game";
import { Environment } from "../astronaut/Astronaut3D";
import { Crew, Extinguisher, FanSpin, Flame, Hatch, Particles, POS, Shell, Valve, radialTexture, type Equip } from "./Module3D";
import { survivalProbability } from "../../lib/survival";
import { useSfx } from "./useSfx";

const FAST = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("fast") === "1";
const TICK_MS = (G.GAME.DT * 1000) / (FAST ? 4 : 1);
const HOLD_MS = 2000;
const KEYS: Record<Equip, string> = { ext: "E", fan: "F", valve: "O", hatch: "H" };
const NAMES: Record<Equip, string> = { ext: "CO₂ extinguisher", fan: "Cabin fans", valve: "O₂ supply", hatch: "Hatch · evacuate" };
const flameSize = (area: number) => 0.45 + 0.1 * Math.sqrt(area);
const BEST_KEY = (d: G.Difficulty) => `command-best-${d}`;

interface Input { spraying: boolean; target: number | null; hovered: Equip | null; aim: THREE.Vector3 }

export interface GameViewProps {
  base: Scenario; lim: E.Limits; diff: G.Difficulty; predict: E.Predict;
  remember(sc: Scenario, p: E.Pred): void;
  vehicleLabel: string; materialLabel: string; rateUnit: string; dataSource: string;
  onExit(): void;
}

// ------------------------------------------------------------------ 3D
function GameScene({ game, input, airMax, o2Max }: { game: G.GameState; input: React.MutableRefObject<Input>; airMax: number; o2Max: number }) {
  const { camera, scene, pointer, raycaster } = useThree();
  const alarm = useRef(0);
  const red = useRef<THREE.PointLight>(null);
  const cabin = useRef<THREE.Group>(null);
  const hand = useRef<THREE.Group>(null);
  const nozzle = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const fog = useMemo(() => new THREE.Fog("#05070d", 9, 18), []);
  const dot = useMemo(() => radialTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)"), []);
  const smokeTex = useMemo(() => radialTexture("rgba(110,104,100,0.95)", "rgba(110,104,100,0)"), []);
  const scorchTex = useMemo(() => radialTexture("rgba(10,8,6,0.95)", "rgba(10,8,6,0)"), []);

  const running = game.status === "running";
  const failed = game.status === "failed";
  const good = game.status === "extinguished";
  const D = G.GAME.difficulty[game.diff];
  const smoke = Math.min(1, game.damage / D.failDamage);
  const live = G.alive(game);
  const livePos = useRef<THREE.Vector3[]>([]);
  livePos.current = (failed ? G.ANCHORS.map((_, i) => i) : live.map((f) => f.anchor)).map((a) => new THREE.Vector3(...G.ANCHORS[a]));
  const air = game.fansOn && airMax > 0 ? game.base.airflow_cm_s / airMax : 0;
  const spraying = input.current.spraying && game.equipped && game.charge > 0 && running;

  useEffect(() => { scene.fog = fog; return () => { scene.fog = null; }; }, [scene, fog]);

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    // alarm + lights (flicker when the module is critical)
    const target = running ? (Math.sin(t * 5) > 0 ? 1 : 0.15) : failed ? 0.9 : 0;
    alarm.current = THREE.MathUtils.damp(alarm.current, target, 12, dt);
    if (red.current) red.current.intensity = alarm.current * 14;
    const flicker = smoke > 0.7 && running ? (Math.random() < 0.12 ? 0.1 : 1) : 1;
    cabin.current?.children.forEach((l) => {
      const pl = l as THREE.PointLight;
      pl.intensity = THREE.MathUtils.damp(pl.intensity, (running || failed ? 0.8 : 2.4) * (1 - 0.6 * smoke) * flicker, 6, dt);
    });
    scene.environmentIntensity = running || failed ? 0.1 : 0.3;
    // smoke closes in
    fog.far = THREE.MathUtils.damp(fog.far, 18 - 13 * smoke, 2, dt);
    fog.near = THREE.MathUtils.damp(fog.near, 9 - 8.5 * smoke, 2, dt);
    fog.color.lerpColors(new THREE.Color("#05070d"), new THREE.Color("#2a2420"), smoke);

    // camera: small sway towards the pointer (kept small so aiming stays steady)
    camera.position.x = THREE.MathUtils.damp(camera.position.x, pointer.x * 0.25, 2, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, 0.1 + pointer.y * 0.15, 2, dt);
    camera.lookAt(pointer.x * 0.15, pointer.y * 0.1, -5);

    // aim: ray through the pointer; the fire it passes closest to (within its size) is the target
    raycaster.setFromCamera(pointer, camera);
    const ray = raycaster.ray;
    let best: { id: number; along: number } | null = null;
    for (const f of live) {
      tmp.set(...G.ANCHORS[f.anchor]);
      const d = ray.distanceToPoint(tmp);
      const along = tmp.clone().sub(ray.origin).dot(ray.direction);
      if (d < Math.max(0.35, flameSize(f.area) * 0.6) && (!best || along < best.along)) best = { id: f.id, along };
    }
    input.current.target = best?.id ?? null;
    input.current.aim.copy(ray.origin).addScaledVector(ray.direction, best ? best.along : 6);

    // the extinguisher in your hand, pointing at the aim point
    if (hand.current) {
      hand.current.visible = game.equipped && running;
      tmp.set(0.42, -0.42, -0.85);
      hand.current.position.copy(camera.localToWorld(tmp.clone()));
      hand.current.lookAt(input.current.aim);
      nozzle.set(0, 0, 0.42).applyMatrix4(hand.current.matrixWorld);
      dir.copy(input.current.aim).sub(nozzle).normalize();
    }
  });

  return (
    <>
      <color attach="background" args={["#05070d"]} />
      <Environment />
      <ambientLight intensity={0.12} />
      <hemisphereLight args={["#dfe8ff", "#3a3328", 0.22]} />
      <group ref={cabin}>
        {[4, 0.5, -3, -6].map((z) => <pointLight key={z} position={[0, 1.4, z]} intensity={2.4} distance={6} decay={1.6} color={good ? "#dfffee" : "#fff6ea"} />)}
      </group>
      <pointLight ref={red} position={[0, 1.6, -0.5]} color="#ff2a1a" distance={12} decay={1.2} intensity={0} />
      <Shell alarm={alarm} good={good} />

      {/* equipment (clicks are handled by the HUD layer using `input.hovered`) */}
      {(Object.keys(POS) as Equip[]).map((k) => (
        <group key={k} position={POS[k]}
          onPointerOver={(e) => { e.stopPropagation(); input.current.hovered = k; }}
          onPointerOut={() => { if (input.current.hovered === k) input.current.hovered = null; }}>
          {k === "fan" && <FanSpin air={air} />}
          {k === "ext" && !game.equipped && <Extinguisher used={false} />}
          {k === "valve" && <Valve o2={game.o2Set} o2Max={o2Max} />}
          {k === "hatch" && <Hatch sealed={game.status === "evacuated"} />}
          {/* generous invisible hit box */}
          {k !== "hatch" && <mesh visible={false}><sphereGeometry args={[0.55, 8, 8]} /></mesh>}
        </group>
      ))}
      <Crew evacuated={game.status === "evacuated"} />

      {/* fires: one flame per anchor; lights only on the first three to keep the shader cost fixed */}
      {G.ANCHORS.map((pos, i) => {
        const f = game.fires.find((x) => x.anchor === i && !x.out);
        const ever = game.fires.find((x) => x.anchor === i);
        const visible = !!f || (failed && !!ever) || (failed && i < 4);
        const size = f ? flameSize(f.area) : failed ? 1.8 : 0;
        return (
          <group key={i}>
            <Flame position={pos} size={size} gravity={game.base.gravity_g} heat={Math.min(1, game.pred.spread)} visible={visible} light={i < 3} />
            {ever && i > 0 && (
              <sprite position={pos} scale={Math.min(2.6, 0.4 + 0.12 * Math.sqrt(ever.peak))}>
                <spriteMaterial map={scorchTex} transparent depthWrite={false} opacity={0.85} />
              </sprite>
            )}
          </group>
        );
      })}

      {/* sparks from every live fire */}
      <Particles count={110} color="#ffb070" size={0.05} texture={dot} opacity={running || failed ? 0.95 : 0}
        spawn={(i, p, v, life) => { const src = livePos.current[i % Math.max(1, livePos.current.length)] ?? new THREE.Vector3(0, 0, -20);
          p.set([src.x, src.y, src.z], i * 3); v.set([(Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)], i * 3); life[i] = 0; }}
        update={(d, i, p, v, life) => { life[i] += d * 0.7; if (life[i] > 1) { const L = livePos.current; const src = L[Math.floor(Math.random() * L.length)] ?? new THREE.Vector3(0, 0, -20);
            const a = Math.random() * 6.28, b = Math.acos(2 * Math.random() - 1), s = (0.25 + Math.random() * 0.55) * (0.6 + game.pred.spread);
            p.set([src.x, src.y, src.z], i * 3); v.set([Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s], i * 3); life[i] = 0; }
          v[i * 3 + 1] += game.base.gravity_g * 1.5 * d; v[i * 3] += air * 0.8 * d;
          p[i * 3] += v[i * 3] * d; p[i * 3 + 1] += v[i * 3 + 1] * d; p[i * 3 + 2] += v[i * 3 + 2] * d; }} />

      {/* smoke volume around the fires, thicker with damage */}
      <Particles count={40} color="#7a726c" size={2.2} texture={smokeTex} blending={THREE.NormalBlending} opacity={0.08 + 0.5 * smoke}
        spawn={(i, p, v, life) => { p.set([(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, -Math.random() * 6], i * 3); v.set([(Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2], i * 3); life[i] = Math.random(); }}
        update={(d, i, p, v, life) => { life[i] += d * 0.06; if (life[i] > 1) { const L = livePos.current; const src = L[Math.floor(Math.random() * L.length)];
            if (src) p.set([src.x + (Math.random() - 0.5) * 0.5, src.y + (Math.random() - 0.5) * 0.5, src.z], i * 3); life[i] = 0; }
          v[i * 3 + 1] += game.base.gravity_g * 0.12 * d; v[i * 3] += air * 0.1 * d;
          p[i * 3] = THREE.MathUtils.clamp(p[i * 3] + v[i * 3] * d, -1.9, 1.9); p[i * 3 + 1] = THREE.MathUtils.clamp(p[i * 3 + 1] + v[i * 3 + 1] * d, -1.7, 1.7); p[i * 3 + 2] += v[i * 3 + 2] * d; }} />

      {/* CO₂ jet from the nozzle in your hand */}
      <Particles count={220} color="#f4f8ff" size={0.22} texture={dot} blending={THREE.NormalBlending} opacity={spraying ? 0.7 : 0}
        spawn={(i, p, _v, life) => { p.set([0, 0, 50], i * 3); life[i] = Math.random(); }}
        update={(d, i, p, v, life) => { life[i] += d * 1.8; if (life[i] > 1) {
            if (input.current.spraying && game.equipped && game.charge > 0) { const s = 6 + Math.random() * 3;
              p.set([nozzle.x, nozzle.y, nozzle.z], i * 3);
              v.set([dir.x * s + (Math.random() - 0.5) * 0.9, dir.y * s + (Math.random() - 0.5) * 0.9, dir.z * s + (Math.random() - 0.5) * 0.9], i * 3);
            } else p.set([0, 0, 50], i * 3);
            life[i] = 0; }
          p[i * 3] += v[i * 3] * d; p[i * 3 + 1] += v[i * 3 + 1] * d; p[i * 3 + 2] += v[i * 3 + 2] * d; v[i * 3] *= 0.97; v[i * 3 + 1] *= 0.97; v[i * 3 + 2] *= 0.97; }} />

      {/* first-person extinguisher */}
      <group ref={hand} visible={false}>
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh position={[0, -0.05, 0]}><cylinderGeometry args={[0.09, 0.09, 0.42, 20]} /><meshPhysicalMaterial color="#d1271c" roughness={0.25} clearcoat={1} /></mesh>
          <mesh position={[0, 0.22, 0]}><cylinderGeometry args={[0.025, 0.045, 0.16, 12]} /><meshStandardMaterial color="#1b1b1b" metalness={0.5} /></mesh>
          <mesh position={[0, 0.34, 0]}><cylinderGeometry args={[0.035, 0.02, 0.1, 12]} /><meshStandardMaterial color="#2a2a2a" /></mesh>
        </group>
      </group>
    </>
  );
}

// ------------------------------------------------------------------ HUD + loop
export default function GameView(p: GameViewProps) {
  const sfx = useSfx();
  const input = useRef<Input>({ spraying: false, target: null, hovered: null, aim: new THREE.Vector3() });
  const [game, setGame] = useState<G.GameState>(() => G.newGame(p.base, p.predict(E.quantize(p.base, p.lim))!, p.lim, p.diff));
  const ref = useRef(game);
  const holdSince = useRef<number | null>(null);
  const [armHatch, setArmHatch] = useState(false);
  const [best, setBest] = useState<number | null>(() => { try { const v = localStorage.getItem(BEST_KEY(p.diff)); return v ? +v : null; } catch { return null; } });
  const [newBest, setNewBest] = useState(false);
  const [hover, setHover] = useState<Equip | null>(null);
  const D = G.GAME.difficulty[p.diff];

  const apply = useCallback((fn: (s: G.GameState) => G.GameState) => { ref.current = fn(ref.current); setGame(ref.current); }, []);

  const finish = useCallback((s: G.GameState) => {
    input.current.spraying = false;
    sfx.spray(false);
    if (s.status === "extinguished") sfx.success(); else sfx.fail();
    const sc = G.gameScore(s);
    if (s.status !== "failed" && (best === null || sc > best)) { setBest(sc); setNewBest(true); try { localStorage.setItem(BEST_KEY(p.diff), String(sc)); } catch { /* ignore */ } }
  }, [best, p.diff, sfx]);

  // start: alarm + lock page scroll
  useEffect(() => {
    sfx.alarm();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; sfx.spray(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the clock
  useEffect(() => {
    if (game.status !== "running") return;
    const id = setInterval(() => {
      const cur = ref.current;
      if (cur.status !== "running") return;
      const n = G.step(cur, input.current, p.predict);
      if (n.missing) {
        const sc = G.effectiveScenario(n);
        if (holdSince.current === null) {
          holdSince.current = Date.now();
          api.predict(sc).then((r) => p.remember(sc, { spread: r.spread_rate_mm_s, extP: r.extinction_probability, risk: r.risk_index }))
            .catch(() => undefined).finally(() => { holdSince.current = null; });
        }
        if (Date.now() - (holdSince.current ?? Date.now()) < HOLD_MS) return;
      }
      if (n.fires.length > cur.fires.length) sfx.whoosh();
      ref.current = n; setGame(n);
      if (n.status !== "running") finish(n);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [game.status, p, finish, sfx]);

  // continuous sound: fire rumble that grows with the damage, and an alarm chirp every few seconds while burning
  const dmgLevel = Math.round(Math.min(1, game.damage / G.GAME.difficulty[p.diff].failDamage) * 20) / 20;
  useEffect(() => {
    sfx.fire(game.status === "running" ? 0.08 + 0.3 * dmgLevel : 0);
  }, [dmgLevel, game.status, sfx]);
  useEffect(() => {
    if (game.status !== "running") return;
    const id = setInterval(() => sfx.beep(), 2600);
    return () => clearInterval(id);
  }, [game.status, sfx]);
  useEffect(() => () => { sfx.fire(0); sfx.spray(false); }, [sfx]);

  // hover state for labels / cursor (polled from the 3D layer)
  useEffect(() => { const id = setInterval(() => setHover(input.current.hovered), 80); return () => clearInterval(id); }, []);

  const operate = useCallback((k: Equip) => {
    if (ref.current.status !== "running") return;
    if (k === "ext") apply(G.grabExtinguisher);
    if (k === "fan") apply(G.toggleFans);
    if (k === "valve") apply(G.toggleO2);
    if (k === "hatch") {
      if (armHatch) { apply(G.evacuate); setArmHatch(false); finish(ref.current); }
      else { setArmHatch(true); setTimeout(() => setArmHatch(false), 2500); }
    }
  }, [apply, armHatch, finish]);

  const startSpray = () => { if (ref.current.equipped && ref.current.charge > 0 && ref.current.status === "running") { input.current.spraying = true; sfx.spray(true); } };
  const stopSpray = () => { input.current.spraying = false; sfx.spray(false); };

  // keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat && e.code !== "Space") return;
      const k = e.key.toLowerCase();
      if (k === "escape") { p.onExit(); return; }
      if (e.code === "Space") { e.preventDefault(); startSpray(); return; }
      const eq = (Object.keys(KEYS) as Equip[]).find((x) => KEYS[x].toLowerCase() === k);
      if (eq) operate(eq);
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") stopSpray(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  });

  const running = game.status === "running";
  const live = G.alive(game);
  const stg = G.stage(game);
  const dmgFrac = Math.min(1, game.damage / D.failDamage);
  const left = Math.max(0, G.GAME.DURATION_S - game.t);
  const onTarget = input.current.spraying && input.current.target !== null;
  const hint = !D.hints || !running ? null
    : !game.equipped ? (game.t > 2 ? "Grab the CO₂ extinguisher on the left wall — click it or press E." : null)
    : game.charge <= 0 ? "Out of CO₂! Lower the O₂ supply (O) or evacuate (H)."
    : live.length > 1 ? "The fire spread! Knock down the new fires before they grow."
    : !input.current.spraying ? "Hold the mouse button (or Space) on the flame to spray." : null;

  return (
    <div className="fixed inset-0 z-[80] select-none bg-black" role="application" aria-label="Fire drill">
      <div className={`absolute inset-0 ${game.equipped && running ? "cursor-crosshair" : hover ? "cursor-pointer" : ""}`}
        onPointerDown={(e) => { if (e.button !== 0) return; const h = input.current.hovered; if (h && !(h === "ext" && game.equipped)) operate(h); else startSpray(); }}
        onPointerUp={stopSpray} onPointerLeave={stopSpray}>
        <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.1, 5.4], fov: 64, near: 0.05, far: 40 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
          <GameScene game={game} input={input} airMax={p.lim.airMax} o2Max={p.lim.o2Max} />
        </Canvas>
      </div>

      {/* smoke / heat vignette */}
      <div className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{ opacity: running ? 0.35 + 0.5 * dmgFrac : game.status === "failed" ? 0.9 : 0,
          background: "radial-gradient(ellipse at center, transparent 45%, rgba(255,60,20,0.55) 100%)" }} />

      {/* ---- top HUD ---- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="num flex flex-col gap-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="rounded border border-[#FFB873]/50 bg-black/60 px-1.5 py-0.5 uppercase tracking-[0.16em] text-[#FFB873]">Simulation</span>
            <span className={`rounded border px-2 py-0.5 uppercase tracking-[0.14em] ${running ? "animate-pulse border-danger/60 bg-danger/25 text-[#ffb3a6]" : "border-white/20 bg-black/60 text-white"}`}>
              {running ? "🔥 Fire alarm" : G.STATUS_LABEL[game.status]}
            </span>
          </div>
          <div className="font-space text-3xl font-semibold tabular-nums text-white drop-shadow">{Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, "0")}</div>
          <div className="text-white/60">{p.vehicleLabel} · {p.materialLabel} · {D.label}</div>
        </div>

        <div className="w-[min(420px,40vw)] pt-1">
          <div className="num mb-1 flex justify-between text-[11px] uppercase tracking-[0.14em]">
            <span className="text-white/80">Module damage</span>
            <span className={["text-[#5BE49B]", "text-[#FFB873]", "text-[#FF8A5B]", "text-danger"][stg]}>{["Contained", "Spreading", "Serious", "Critical"][stg]}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full border border-white/20 bg-black/60">
            <div className="h-full rounded-full bg-gradient-to-r from-[#FFB873] via-[#FF6A1A] to-[#ff2a1a] transition-[width] duration-200" style={{ width: `${dmgFrac * 100}%` }} />
          </div>
          <div className="num mt-1 text-center text-[11px] text-white/70">
            {live.length} fire{live.length === 1 ? "" : "s"} burning · {Math.round(game.damage)} / {D.failDamage} cm² burned
          </div>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <div className="flex gap-1.5">
            <button onClick={sfx.toggle} className="num rounded border border-white/20 bg-black/60 px-2 py-1 text-[12px] text-white/80 hover:text-white">{sfx.on ? "🔊" : "🔇"}</button>
            <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => undefined)}
              className="num rounded border border-white/20 bg-black/60 px-2 py-1 text-[12px] text-white/80 hover:text-white" title="Full screen">⛶</button>
            <button onClick={p.onExit} className="num rounded border border-white/20 bg-black/60 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-white/80 hover:text-white">Exit · Esc</button>
          </div>
          <div className="num rounded border border-white/10 bg-black/55 px-2 py-1 text-right text-[11px] leading-5 text-white/80">
            <div>O₂ <b className={game.o2Set < game.base.o2_percent ? "text-[#5BE49B]" : "text-white"}>{game.o2Set.toFixed(1)} %</b>{game.lowering && " ↓"}</div>
            <div>Fans <b className={game.fansOn ? "text-white" : "text-[#7cc4ff]"}>{game.fansOn ? "ON" : "OFF"}</b></div>
            <div title="From the model">Growth {game.pred.spread.toFixed(2)} {p.rateUnit}</div>
            <div title="Model chance a fire keeps burning on its own">Keeps burning {Math.round(survivalProbability(game.pred.extP) * 100)}%</div>
          </div>
        </div>
      </div>

      {/* event feed */}
      <div className="pointer-events-none absolute left-1/2 top-24 flex -translate-x-1/2 flex-col items-center gap-1">
        {game.events.slice(0, 3).map((ev, i) => (
          <div key={`${ev.t}-${i}`} style={{ opacity: 1 - i * 0.3 }}
            className={`num rounded-md border px-3 py-1 text-[12.5px] shadow-lg backdrop-blur-0 ${ev.tone === "bad" ? "border-danger/50 bg-[#2a0c08]/85 text-[#ffb3a6]" : ev.tone === "good" ? "border-[#3ddc97]/50 bg-[#062018]/85 text-[#8ff0c4]" : "border-white/15 bg-black/70 text-white/85"}`}>
            {ev.text}
          </div>
        ))}
      </div>

      {/* crosshair */}
      {game.equipped && running && (
        <div className={`num pointer-events-none absolute bottom-[30%] left-1/2 -translate-x-1/2 rounded px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] ${onTarget ? "bg-[#5BE49B]/20 text-[#8ff0c4]" : input.current.spraying ? "bg-black/50 text-white/60" : "text-transparent"}`}>
          {onTarget ? "● On target" : "Missing"}
        </div>
      )}

      {/* hovered equipment label */}
      {hover && running && !(hover === "ext" && game.equipped) && (
        <div className="num pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 rounded bg-black/75 px-2.5 py-1 text-[12px] text-white">
          {NAMES[hover]} — click or press <b className="text-[#FFB873]">{KEYS[hover]}</b>
          {hover === "hatch" && armHatch && <span className="ml-2 text-danger">click again to evacuate</span>}
        </div>
      )}
      {armHatch && running && <div className="num pointer-events-none absolute left-1/2 top-[44%] -translate-x-1/2 rounded border border-danger/60 bg-[#2a0c08]/90 px-3 py-1.5 text-[13px] text-[#ffb3a6]">Evacuate and seal the module? Press H / click the hatch again</div>}

      {/* ---- bottom HUD ---- */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 sm:p-4">
        <div className="num hidden rounded border border-white/10 bg-black/55 px-3 py-2 text-[11px] leading-5 text-white/75 sm:block">
          <div><b className="text-[#FFB873]">E</b> grab extinguisher · <b className="text-[#FFB873]">hold mouse / Space</b> spray</div>
          <div><b className="text-[#FFB873]">F</b> fans · <b className="text-[#FFB873]">O</b> lower O₂ · <b className="text-[#FFB873]">H</b> evacuate · <b className="text-[#FFB873]">Esc</b> exit</div>
        </div>
        {hint && (
          <div className="mx-auto max-w-md rounded-xl border border-cool/40 bg-[#04121f]/85 px-3 py-2 text-[13px] text-white/90">👩‍🚀 <b className="text-cool">Nova:</b> {hint}</div>
        )}
        <div className="w-56 rounded border border-white/10 bg-black/60 px-3 py-2">
          {game.equipped ? (
            <>
              <div className="num mb-1 flex justify-between text-[11px] uppercase tracking-[0.14em] text-white/80"><span>CO₂ charge</span><span>{game.charge.toFixed(1)} s</span></div>
              <div className="h-2 overflow-hidden rounded bg-white/10">
                <div className={`h-full ${game.charge / D.charge < 0.25 ? "bg-danger" : "bg-[#e9f2ff]"}`} style={{ width: `${(game.charge / D.charge) * 100}%` }} />
              </div>
            </>
          ) : <div className="num text-[11.5px] text-[#FFB873]">🧯 Extinguisher on the left wall — press <b>E</b></div>}
        </div>
      </div>

      {/* ---- debrief ---- */}
      {!running && <Debrief game={game} best={best} newBest={newBest} onAgain={p.onExit} />}
    </div>
  );
}

function Debrief({ game, best, newBest, onAgain }: { game: G.GameState; best: number | null; newBest: boolean; onAgain(): void }) {
  const sc = G.gameScore(game);
  const good = game.status === "extinguished";
  const lesson = good
    ? game.endedAt! < 15 ? "Fast and clean — catching a fire in its first seconds is everything." : "Fire's out. The earlier you reach the extinguisher, the less of the module burns."
    : game.status === "evacuated" ? "Crew safe — that always comes first. The module is lost, though; acting in the first 10 seconds can save it."
    : "The fire spread faster than it could be stopped. Flame area grows with the square of its size: waiting even 20 seconds makes it many times harder.";
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-4">
      <div className={`w-full max-w-md rounded-2xl border bg-[#070B14]/95 p-6 shadow-2xl ${good ? "border-[#3ddc97]/40" : "border-danger/40"}`}>
        <div className="num text-[11px] uppercase tracking-[0.18em] text-[#FFB873]">Debrief · simulation · {G.GAME.difficulty[game.diff].label}</div>
        <div className={`mt-1 font-space text-3xl font-semibold ${good ? "text-[#3ddc97]" : "text-[#ff8a75]"}`}>{G.STATUS_LABEL[game.status]}</div>
        <div className="mt-3 flex items-end gap-3">
          <div className="num text-6xl font-semibold text-white">{sc}</div>
          <div className="num pb-2 text-white/60">/ 1000</div>
          {newBest ? <span className="num mb-2 rounded bg-[#FFB873]/20 px-2 py-0.5 text-[11px] uppercase tracking-wider text-[#FFB873]">New best!</span>
            : best !== null && <span className="num mb-2 text-[12px] text-white/50">best {best}</span>}
        </div>
        <dl className="num mt-4 grid grid-cols-3 gap-2 text-[12.5px]">
          <div><dt className="text-white/50">Time</dt><dd className="text-white">{(game.endedAt ?? game.t).toFixed(1)} s</dd></div>
          <div><dt className="text-white/50">Burned</dt><dd className="text-white">{Math.round(game.damage)} cm²</dd></div>
          <div><dt className="text-white/50">Fires</dt><dd className="text-white">{game.fires.length}</dd></div>
        </dl>
        <p className="mt-4 text-[13.5px] leading-relaxed text-white/85">👩‍🚀 <b className="text-cool">Nova:</b> {lesson}</p>
        <p className="num mt-3 text-[10.5px] leading-snug text-white/45">
          Flame growth and self-extinction come from the model trained on NASA data. Spreading to racks, extinguisher power, charge and scoring are game rules (src/sim/game.ts).
        </p>
        <div className="mt-5 flex gap-2">
          <button onClick={onAgain} className="rounded-lg border border-[#FF6A1A]/60 bg-[#FF6A1A]/20 px-4 py-2 font-space text-sm font-semibold text-white hover:bg-[#FF6A1A]/30">Back to briefing</button>
        </div>
      </div>
    </div>
  );
}
