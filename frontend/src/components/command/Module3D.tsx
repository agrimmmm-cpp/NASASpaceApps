// Real-time 3D interior of a station module for Command Mode (three.js via react-three-fiber, lazy-loaded).
// Off-white racks on all four walls, handrails, laptops, stowage bags and lights; a shader flame that lights the walls;
// sparks, smoke, CO₂ spray and drifting dust; the procedural crew from the Nova astronaut. The equipment you can use at
// a decision glows and is clickable (fan, extinguisher, O₂ valve, hatch). The camera follows the mouse.
// Every moving thing is driven by the drill state passed in — nothing here computes risk.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import * as E from "../../sim/engine";
import * as C from "../../sim/config";
import { Environment, Suit } from "../astronaut/Astronaut3D";

export interface Module3DProps {
  sim: E.SimState | null;
  gravity: number;
  airflow: number; airMax: number;
  o2: number; o2Max: number;
  hotspots: E.ActionId[];
  recommended?: string;
  onChoose?(id: E.ActionId): void;
  shakeKey: number;
}

export type Equip = "fan" | "ext" | "valve" | "hatch";
const EQUIP_OF: Partial<Record<E.ActionId, Equip>> = {
  vent_off: "fan", vent_max: "fan", co2_extinguisher: "ext", lower_o2: "valve", isolate_evacuate: "hatch",
};
const EQUIP_NAME: Record<Equip, string> = { fan: "Cabin fan", ext: "CO₂ extinguisher", valve: "O₂ supply valve", hatch: "Hatch" };
export const POS: Record<Equip, [number, number, number]> = {
  fan: [-1.86, 0.85, 0.6], ext: [-1.72, -0.55, 2.4], valve: [1.8, -0.15, 1.5], hatch: [0, 0, -7.4],
};
export const FIRE = new THREE.Vector3(0.45, -0.15, -1.3);
export const HALF_W = 2, HALF_H = 1.8, Z_NEAR = 6, Z_FAR = -7.5;

// ---------- shared textures ----------
export function radialTexture(inner: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Subtle panel texture: seams, rivets and labels, so racks don't look like flat plastic. */
function panelTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e4e0d4"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.035})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  g.strokeStyle = "rgba(60,60,60,0.35)"; g.lineWidth = 2;
  g.strokeRect(6, 6, 244, 244); g.strokeRect(6, 6, 244, 120);
  g.fillStyle = "rgba(70,70,70,0.5)";
  for (const [x, y] of [[14, 14], [242, 14], [14, 242], [242, 242], [14, 118], [242, 118]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  g.fillStyle = "rgba(40,60,110,0.55)"; g.fillRect(30, 150, 70, 12); g.fillRect(30, 170, 110, 8);
  g.fillStyle = "rgba(200,60,30,0.6)"; g.fillRect(200, 150, 26, 26);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- flame shader ----------
const flameVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const flameFrag = /* glsl */ `
uniform float uTime; uniform float uG; uniform float uHeat; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
void main(){
  vec2 p = vUv*2.0-1.0;
  float up = max(p.y + 0.15, 0.0);
  // microgravity: sphere; with gravity the top stretches into a teardrop
  vec2 q = vec2(p.x * (1.0 + uG*1.4*up), (p.y + uG*0.25) / (1.0 + uG*1.5*step(-0.15, p.y)));
  float n = fbm(vec2(p.x*3.2, p.y*3.2 - uTime*(0.5 + 2.8*uG)) + uTime*0.15);
  float d = length(q) * 1.75 + (n - 0.5) * (0.28 + 0.4*uG);
  float body = smoothstep(1.0, 0.28, d);
  float core = smoothstep(0.55, 0.0, d);
  vec3 blue = vec3(0.22, 0.5, 1.0), deep = vec3(0.08, 0.2, 0.85);
  vec3 orange = vec3(1.0, 0.42, 0.06), yellow = vec3(1.0, 0.86, 0.5);
  float g = clamp(uG * 1.4 + 0.15, 0.0, 1.0);
  vec3 col = mix(mix(deep, blue, body), orange, g);
  // microgravity droplet flames show a thin yellow soot shell inside the blue
  float shell = smoothstep(0.18, 0.0, abs(d - 0.5)) * (1.0 - g) * 0.7;
  col = mix(col, yellow, core * (0.55 + 0.45*g)) + vec3(1.0, 0.75, 0.35) * shell;
  float a = body * (0.55 + 0.45*uHeat) + shell * 0.4;
  gl_FragColor = vec4(col * a * 2.4, a);
}`;

export function Flame({ size, gravity, heat, visible, position = FIRE, light: withLight = true }: { size: number; gravity: number; heat: number; visible: boolean; position?: THREE.Vector3 | [number, number, number]; light?: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Sprite>(null);
  const light = useRef<THREE.PointLight>(null);
  const cur = useRef(0);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: flameVert, fragmentShader: flameFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uG: { value: gravity }, uHeat: { value: heat } },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const glowTex = useMemo(() => radialTexture("rgba(255,170,90,0.9)", "rgba(255,90,20,0)"), []);
  const { camera } = useThree();
  useFrame((st, dt) => {
    const target = visible ? size : 0;
    cur.current = THREE.MathUtils.damp(cur.current, target, visible ? 3 : 1.5, dt);
    const s = cur.current;
    mat.uniforms.uTime.value = st.clock.elapsedTime;
    mat.uniforms.uG.value = gravity;
    mat.uniforms.uHeat.value = heat;
    if (mesh.current) { mesh.current.quaternion.copy(camera.quaternion); mesh.current.scale.setScalar(Math.max(0.001, s)); }
    if (glow.current) { glow.current.scale.setScalar(Math.max(0.001, s * 3.2)); (glow.current.material as THREE.SpriteMaterial).opacity = 0.35 + 0.15 * Math.sin(st.clock.elapsedTime * 13); }
    if (light.current) {
      const flick = 0.85 + 0.15 * Math.sin(st.clock.elapsedTime * 17) * Math.sin(st.clock.elapsedTime * 5.3);
      light.current.intensity = s * 14 * flick;
      light.current.color.set(gravity > 0.3 ? "#ff8a3a" : "#7fa6ff").lerp(new THREE.Color("#ffb070"), 0.3);
    }
  });
  return (
    <group position={position}>
      <sprite ref={glow}><spriteMaterial map={glowTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
      <mesh ref={mesh} material={mat}><planeGeometry args={[1, 1]} /></mesh>
      {withLight && <pointLight ref={light} distance={7} decay={1.6} />}
    </group>
  );
}

// ---------- particles ----------
export function Particles({ count, color, size, opacity, spawn, update, blending = THREE.AdditiveBlending, texture }: {
  count: number; color: string; size: number; opacity: number; blending?: THREE.Blending; texture: THREE.Texture;
  spawn(i: number, p: Float32Array, v: Float32Array, life: Float32Array): void;
  update(dt: number, i: number, p: Float32Array, v: Float32Array, life: Float32Array): void;
}) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, [count]);
  const v = useMemo(() => new Float32Array(count * 3), [count]);
  const life = useMemo(() => new Float32Array(count), [count]);
  const mat = useRef<THREE.PointsMaterial>(null);
  useEffect(() => { const p = geo.attributes.position.array as Float32Array; for (let i = 0; i < count; i++) { spawn(i, p, v, life); life[i] = Math.random(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    dt = Math.min(dt, 0.05);
    const p = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) update(dt, i, p, v, life);
    geo.attributes.position.needsUpdate = true;
    if (mat.current) mat.current.opacity = THREE.MathUtils.damp(mat.current.opacity, opacity, 3, dt);
  });
  return (
    <points geometry={geo} frustumCulled={false}>
      <pointsMaterial ref={mat} color={color} size={size} map={texture} transparent opacity={0} depthWrite={false} blending={blending} sizeAttenuation />
    </points>
  );
}

// ---------- module structure ----------
function seeded(n: number) { let s = n; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function RackFace({ tex, seed, alarm }: { tex: THREE.Texture; seed: number; alarm: React.MutableRefObject<number> }) {
  const r = useMemo(() => seeded(seed), [seed]);
  const items = useMemo(() => {
    const out: { z: number; kind: number; x: number; w: number; h: number; c: string }[] = [];
    for (let z = Z_NEAR - 1; z > Z_FAR + 1; z -= 1.75) {
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) out.push({ z: z - 0.3 + r() * 0.6, kind: Math.floor(r() * 4), x: -1 + r() * 2, w: 0.25 + r() * 0.35, h: 0.15 + r() * 0.3, c: ["#f2f0ea", "#d8d4c8", "#cfd6de", "#e9e4d6"][Math.floor(r() * 4)] });
    }
    return out;
  }, [r]);
  const screens = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => { if (screens.current) screens.current.color.setRGB(0.35 + 0.5 * alarm.current, 0.6 * (1 - alarm.current) + 0.1, 1 - 0.8 * alarm.current); });
  return (
    <group>
      {/* racks */}
      {Array.from({ length: 8 }, (_, i) => Z_NEAR - 0.9 - i * 1.75).map((z) => (
        <mesh key={z} position={[0, 0.06, z]}>
          <boxGeometry args={[2.9, 0.12, 1.62]} />
          <meshStandardMaterial map={tex} color="#c9c5b8" roughness={0.8} metalness={0.05} />
        </mesh>
      ))}
      {/* equipment boxes, bags, laptops */}
      {items.map((it, i) => it.kind === 3 ? (
        <group key={i} position={[it.x, 0.16, it.z]}>
          <mesh><boxGeometry args={[0.36, 0.03, 0.26]} /><meshStandardMaterial color="#20232a" roughness={0.4} metalness={0.5} /></mesh>
          <mesh position={[0, 0.02, 0]}><boxGeometry args={[0.3, 0.005, 0.2]} /><meshBasicMaterial ref={i === 0 ? screens : undefined} color="#5aa0ff" /></mesh>
        </group>
      ) : it.kind === 2 ? (
        <mesh key={i} position={[it.x, 0.2, it.z]}>
          <capsuleGeometry args={[it.h * 0.45, it.w, 4, 10]} />
          <meshStandardMaterial color="#f4f4f0" roughness={0.95} />
        </mesh>
      ) : (
        <mesh key={i} position={[it.x, 0.12 + it.h / 4, it.z]}>
          <boxGeometry args={[it.w, it.h / 2, it.w * 0.8]} />
          <meshStandardMaterial color={it.c} roughness={0.6} metalness={0.15} />
        </mesh>
      ))}
      {/* handrails */}
      {[-1.25, 1.25].map((x) => (
        <mesh key={x} position={[x, 0.24, (Z_NEAR + Z_FAR) / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, Z_NEAR - Z_FAR - 1, 10]} />
          <meshStandardMaterial color="#c9b98c" roughness={0.4} metalness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

export function Shell({ alarm, good }: { alarm: React.MutableRefObject<number>; good: boolean }) {
  const tex = useMemo(() => panelTexture(), []);
  const lights = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => { lights.current?.color.setRGB(1, 1 - 0.75 * alarm.current, 1 - 0.8 * alarm.current).lerp(new THREE.Color(good ? "#bfffe0" : "#ffffff"), good ? 0.4 : 0); });
  const faces: [number, number, number, number][] = [
    [0, -HALF_H, 0, 0], [0, HALF_H, 0, Math.PI], [-HALF_W, 0, 0, -Math.PI / 2], [HALF_W, 0, 0, Math.PI / 2],
  ];
  return (
    <group>
      {/* inner hull (corners and gaps behind racks) */}
      <mesh position={[0, 0, (Z_NEAR + Z_FAR) / 2]}>
        <boxGeometry args={[HALF_W * 2 + 0.3, HALF_H * 2 + 0.3, Z_NEAR - Z_FAR]} />
        <meshStandardMaterial color="#6d6a62" roughness={0.9} side={THREE.BackSide} />
      </mesh>
      {faces.map(([x, y, , rz], i) => (
        <group key={i} position={[x, y, 0]} rotation={i === 1 ? [Math.PI, 0, 0] : [0, 0, rz]}>
          <RackFace tex={tex} seed={11 + i * 7} alarm={alarm} />
        </group>
      ))}
      {/* light panels along the ceiling corners */}
      {[-1.45, 1.45].map((x) => Array.from({ length: 4 }, (_, i) => (
        <mesh key={`${x}${i}`} position={[x, HALF_H - 0.05, Z_NEAR - 1.8 - i * 3.3]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.32, 1.3]} />
          <meshBasicMaterial ref={i === 0 && x < 0 ? lights : undefined} color="#ffffff" />
        </mesh>
      )))}
    </group>
  );
}

// ---------- equipment ----------
export function Equipment({ id, active, rec, onPick, hover, children }: {
  id: Equip; active: boolean; rec: boolean; onPick?(): void; hover(id: Equip | null): void; children: React.ReactNode;
}) {
  const ring = useRef<THREE.Mesh>(null);
  const grp = useRef<THREE.Group>(null);
  const [over, setOver] = useState(false);
  useFrame((st) => {
    if (ring.current) {
      const k = (st.clock.elapsedTime * 1.2) % 1;
      ring.current.scale.setScalar(active ? 1 + k * 0.6 : 0.001);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = active ? 0.9 * (1 - k) : 0;
    }
    if (grp.current) grp.current.scale.setScalar(THREE.MathUtils.damp(grp.current.scale.x, over && active ? 1.12 : 1, 10, 0.016));
  });
  const face = id === "hatch" ? [0, 0, 0] : id === "valve" ? [0, -Math.PI / 2, 0] : [0, Math.PI / 2, 0];
  return (
    <group position={POS[id]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setOver(true); hover(id); document.body.style.cursor = active ? "pointer" : "help"; }}
      onPointerOut={() => { setOver(false); hover(null); document.body.style.cursor = ""; }}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (active) onPick?.(); }}>
      <group ref={grp}>{children}</group>
      <mesh ref={ring} rotation={face as [number, number, number]}>
        <torusGeometry args={[id === "hatch" ? 1.15 : 0.42, 0.02, 8, 48]} />
        <meshBasicMaterial color={rec ? "#5FE6FF" : "#FFB873"} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function FanSpin({ air }: { air: number }) {
  // the blade group spins around the axis pointing into the cabin (+x)
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (g.current) g.current.rotation.x += dt * air * 20; });
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.46, 0.46, 0.05, 6]} /><meshStandardMaterial color="#c3c6cc" metalness={0.6} roughness={0.35} /></mesh>
      <mesh position={[0.03, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.36, 0.36, 0.03, 32]} /><meshStandardMaterial color="#15181d" /></mesh>
      <group ref={g} position={[0.06, 0, 0]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} rotation={[(i * Math.PI * 2) / 5, 0, 0]} position={[0, 0, 0]}>
            <boxGeometry args={[0.01, 0.32, 0.09]} />
            <meshStandardMaterial color="#9aa1ab" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
        <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.06, 0.06, 0.05, 16]} /><meshStandardMaterial color="#e3e6ea" metalness={0.5} /></mesh>
      </group>
    </group>
  );
}

export function Extinguisher({ used }: { used: boolean }) {
  return (
    <group>
      <mesh><cylinderGeometry args={[0.13, 0.13, 0.62, 24]} /><meshPhysicalMaterial color={used ? "#7a3a35" : "#d1271c"} roughness={0.25} clearcoat={1} /></mesh>
      <mesh position={[0, 0.34, 0]}><sphereGeometry args={[0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshPhysicalMaterial color={used ? "#7a3a35" : "#d1271c"} roughness={0.25} clearcoat={1} /></mesh>
      <mesh position={[0, 0.48, 0]}><cylinderGeometry args={[0.04, 0.05, 0.1, 12]} /><meshStandardMaterial color="#222" metalness={0.6} /></mesh>
      <mesh position={[0.08, 0.5, 0]} rotation={[0, 0, -0.5]}><boxGeometry args={[0.18, 0.025, 0.05]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[0, 0.02, 0.13]}><planeGeometry args={[0.16, 0.12]} /><meshBasicMaterial color="#f2f2f2" /></mesh>
      {/* wall bracket */}
      <mesh position={[-0.15, 0, 0]}><boxGeometry args={[0.04, 0.5, 0.2]} /><meshStandardMaterial color="#8a8f98" metalness={0.7} /></mesh>
    </group>
  );
}

export function Valve({ o2, o2Max }: { o2: number; o2Max: number }) {
  const wheel = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (wheel.current) wheel.current.rotation.x = THREE.MathUtils.damp(wheel.current.rotation.x, (1 - o2 / o2Max) * Math.PI * 3, 3, dt); });
  return (
    <group>
      <mesh position={[0.05, 0.35, 0]}><boxGeometry args={[0.06, 0.55, 0.8]} /><meshStandardMaterial color="#2c4f7c" roughness={0.5} /></mesh>
      <mesh position={[0.01, 0.4, 0]}><boxGeometry args={[0.01, 0.16, 0.5]} /><meshBasicMaterial color={o2 < o2Max * 0.5 ? "#5BE49B" : "#7cc4ff"} /></mesh>
      <group ref={wheel} position={[-0.05, -0.1, 0]}>
        <mesh rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[0.2, 0.03, 10, 32]} /><meshStandardMaterial color="#3b8fd6" metalness={0.5} roughness={0.3} /></mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[(i * Math.PI) / 3, 0, 0]}><boxGeometry args={[0.02, 0.4, 0.025]} /><meshStandardMaterial color="#3b8fd6" metalness={0.5} /></mesh>
        ))}
      </group>
    </group>
  );
}

export function Hatch({ sealed }: { sealed: boolean }) {
  const door = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (door.current) door.current.position.y = THREE.MathUtils.damp(door.current.position.y, sealed ? 0 : 2.4, 2.2, dt); });
  return (
    <group>
      {/* end bulkhead with a square hatch opening */}
      {[[-1.5, 0, 1, 3.6], [1.5, 0, 1, 3.6], [0, 1.45, 2, 0.7], [0, -1.45, 2, 0.7]].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0]}><boxGeometry args={[w, h, 0.1]} /><meshStandardMaterial color="#d9d5c9" roughness={0.7} /></mesh>
      ))}
      <mesh position={[0, 0, 0.02]} rotation={[0, 0, Math.PI / 4]}><torusGeometry args={[1.05, 0.07, 10, 4, Math.PI * 2]} /><meshStandardMaterial color="#9da3ad" metalness={0.7} roughness={0.3} /></mesh>
      {/* the next module, dimly lit */}
      <mesh position={[0, 0, -2]}><boxGeometry args={[2, 2.2, 4]} /><meshStandardMaterial color="#3a4250" side={THREE.BackSide} /></mesh>
      <pointLight position={[0, 0, -2]} intensity={2} distance={4} color="#9fc4ff" />
      <mesh ref={door} position={[0, 2.4, 0.08]}><boxGeometry args={[2, 2.2, 0.08]} /><meshStandardMaterial color="#aeb3bb" metalness={0.6} roughness={0.35} /></mesh>
    </group>
  );
}

// ---------- crew ----------
export function Crew({ evacuated }: { evacuated: boolean }) {
  const a = useRef<THREE.Group>(null), b = useRef<THREE.Group>(null);
  const cursor = useRef({ x: 0, y: 0 });
  const homes: [THREE.Vector3, THREE.Vector3] = useMemo(() => [new THREE.Vector3(-1.0, 0.35, -2.6), new THREE.Vector3(1.05, -0.5, -4.4)], []);
  const exit = useMemo(() => new THREE.Vector3(0, 0, -9), []);
  useFrame((_, dt) => {
    [a, b].forEach((r, i) => {
      if (!r.current) return;
      const target = evacuated ? exit : homes[i];
      r.current.position.lerp(target, 1 - Math.exp(-dt * (evacuated ? 0.9 + i * 0.3 : 4)));
    });
  });
  return (
    <>
      <group ref={a} position={homes[0]} rotation={[0.1, 0.5, 0.2]} scale={0.5}><Suit mood="idle" reduced={false} cursor={cursor} /></group>
      <group ref={b} position={homes[1]} rotation={[-0.15, -0.6, -0.3]} scale={0.5}><Suit mood="thinking" reduced={false} cursor={cursor} /></group>
    </>
  );
}

// ---------- camera ----------
function Rig({ shakeKey }: { shakeKey: number }) {
  const { camera, pointer } = useThree();
  const shake = useRef(0);
  useEffect(() => { if (shakeKey) shake.current = 0.5; }, [shakeKey]);
  useFrame((st, dt) => {
    shake.current = Math.max(0, shake.current - dt);
    const s = shake.current * 0.18;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, pointer.x * 0.7, 2.5, dt) + (Math.random() - 0.5) * s;
    camera.position.y = THREE.MathUtils.damp(camera.position.y, 0.15 + pointer.y * 0.4, 2.5, dt) + (Math.random() - 0.5) * s;
    camera.lookAt(pointer.x * 0.4, pointer.y * 0.2, -5);
    void st;
  });
  return null;
}

// ---------- the scene ----------
function Scene(p: Module3DProps & { hover(id: Equip | null): void; labels: React.MutableRefObject<Partial<Record<Equip, HTMLDivElement | null>>> }) {
  const { sim } = p;
  const status = sim?.status ?? "idle";
  const burning = status === "running";
  const failed = status === "failed";
  const good = status === "extinguished" || status === "contained";
  const areaFrac = sim ? Math.min(1, sim.area / C.FAIL_AREA_CM2) : 0;
  const co2Active = !!sim && sim.co2Until !== null && sim.t <= sim.co2Until && burning;
  const air = p.airMax > 0 ? p.airflow / p.airMax : 0;
  const activeEquip = new Set(p.hotspots.map((h) => EQUIP_OF[h]).filter(Boolean) as Equip[]);
  const recEquip = p.recommended ? EQUIP_OF[p.recommended as E.ActionId] : undefined;
  const actionFor = (eq: Equip) => p.hotspots.find((h) => EQUIP_OF[h] === eq);

  const alarm = useRef(0);
  const red = useRef<THREE.PointLight>(null);
  const cabin = useRef<THREE.Group>(null);
  const { camera, size, scene } = useThree();
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((st, dt) => {
    const target = burning ? (Math.sin(st.clock.elapsedTime * 5) > 0 ? 1 : 0.15) : failed ? 0.8 : 0;
    alarm.current = THREE.MathUtils.damp(alarm.current, target, 12, dt);
    if (red.current) red.current.intensity = alarm.current * 16;
    scene.environmentIntensity = burning || failed ? 0.12 : 0.3;
    cabin.current?.children.forEach((l) => { (l as THREE.PointLight).intensity = THREE.MathUtils.damp((l as THREE.PointLight).intensity, burning || failed ? 0.7 : 2.4, 3, dt); });
    // pin HTML labels to the equipment
    (Object.keys(POS) as Equip[]).forEach((k) => {
      const el = p.labels.current[k];
      if (!el) return;
      tmp.set(...POS[k]).project(camera);
      el.style.transform = `translate(${((tmp.x + 1) / 2) * size.width}px, ${((1 - tmp.y) / 2) * size.height}px)`;
    });
  });

  const dot = useMemo(() => radialTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)"), []);
  const smoke = useMemo(() => radialTexture("rgba(120,120,125,0.9)", "rgba(120,120,125,0)"), []);
  const spread = sim?.pred.spread ?? 0;
  const nozzle = useMemo(() => new THREE.Vector3(POS.ext[0] + 0.2, POS.ext[1] + 0.5, POS.ext[2]), []);

  return (
    <>
      <color attach="background" args={["#05070d"]} />
      <fog attach="fog" args={["#05070d", 9, 17]} />
      <Environment />
      <ambientLight intensity={0.12} />
      <hemisphereLight args={["#dfe8ff", "#3a3328", 0.22]} />
      <group ref={cabin}>
        {[4, 0.5, -3, -6].map((z) => <pointLight key={z} position={[0, 1.4, z]} intensity={2.4} distance={6} decay={1.6} color={good ? "#dfffee" : "#fff6ea"} />)}
      </group>
      <pointLight ref={red} position={[0, 1.6, -0.5]} color="#ff2a1a" distance={12} decay={1.2} intensity={0} />
      <Shell alarm={alarm} good={good} />

      <Equipment id="fan" active={activeEquip.has("fan")} rec={recEquip === "fan"} hover={p.hover} onPick={() => { const a = actionFor("fan"); if (a) p.onChoose?.(a); }}>
        <FanSpin air={air} />
      </Equipment>
      <Equipment id="ext" active={activeEquip.has("ext")} rec={recEquip === "ext"} hover={p.hover} onPick={() => p.onChoose?.("co2_extinguisher")}>
        <Extinguisher used={!!sim?.co2Used && !co2Active} />
      </Equipment>
      <Equipment id="valve" active={activeEquip.has("valve")} rec={recEquip === "valve"} hover={p.hover} onPick={() => p.onChoose?.("lower_o2")}>
        <Valve o2={p.o2} o2Max={p.o2Max} />
      </Equipment>
      <Equipment id="hatch" active={activeEquip.has("hatch")} rec={recEquip === "hatch"} hover={p.hover} onPick={() => p.onChoose?.("isolate_evacuate")}>
        <Hatch sealed={status === "evacuated"} />
      </Equipment>

      <Crew evacuated={status === "evacuated"} />

      <Flame size={sim ? 0.7 + 1.5 * Math.sqrt(areaFrac) : 0} gravity={p.gravity} heat={Math.min(1, spread)} visible={burning || failed} />

      {/* sparks / soot leaving the flame (spherical in microgravity, rising with gravity) */}
      <Particles count={70} color="#ffb070" size={0.05} texture={dot} opacity={burning ? 0.95 : 0}
        spawn={(i, pos, v, life) => { const a = Math.random() * 6.28, b = Math.acos(2 * Math.random() - 1), s = 0.25 + Math.random() * 0.5;
          pos.set([FIRE.x, FIRE.y, FIRE.z], i * 3); v.set([Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s], i * 3); life[i] = 0; }}
        update={(dt, i, pos, v, life) => { life[i] += dt * 0.6; if (life[i] > 1) { const a = Math.random() * 6.28, b = Math.acos(2 * Math.random() - 1), s = (0.2 + Math.random() * 0.5) * (0.6 + spread);
          pos.set([FIRE.x, FIRE.y, FIRE.z], i * 3); v.set([Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s], i * 3); life[i] = 0; }
          v[i * 3 + 1] += p.gravity * 1.5 * dt; v[i * 3] += air * 0.8 * dt;
          pos[i * 3] += v[i * 3] * dt; pos[i * 3 + 1] += v[i * 3 + 1] * dt; pos[i * 3 + 2] += v[i * 3 + 2] * dt; }} />

      {/* smoke builds with burned area */}
      <Particles count={26} color="#6a6a70" size={1.6} texture={smoke} blending={THREE.NormalBlending} opacity={(burning || failed ? 0.12 + 0.5 * areaFrac : 0.05 * areaFrac)}
        spawn={(i, pos, v, life) => { pos.set([FIRE.x + (Math.random() - 0.5) * 0.4, FIRE.y + (Math.random() - 0.5) * 0.4, FIRE.z], i * 3);
          v.set([(Math.random() - 0.5) * 0.25, (Math.random() - 0.3) * 0.2, (Math.random() - 0.5) * 0.25], i * 3); life[i] = 0; }}
        update={(dt, i, pos, v, life) => { life[i] += dt * 0.08; if (life[i] > 1) { pos.set([FIRE.x, FIRE.y, FIRE.z], i * 3); life[i] = 0; }
          v[i * 3 + 1] += p.gravity * 0.15 * dt; v[i * 3] += air * 0.12 * dt;
          pos[i * 3] += v[i * 3] * dt; pos[i * 3 + 1] += v[i * 3 + 1] * dt; pos[i * 3 + 2] += v[i * 3 + 2] * dt; }} />

      {/* CO₂ discharge from the extinguisher towards the fire */}
      <Particles count={160} color="#f4f8ff" size={0.35} texture={dot} blending={THREE.NormalBlending} opacity={co2Active ? 0.55 : 0}
        spawn={(i, pos, v, life) => { pos.set([nozzle.x, nozzle.y, nozzle.z], i * 3); const d = FIRE.clone().sub(nozzle).normalize().multiplyScalar(2.2 + Math.random());
          v.set([d.x + (Math.random() - 0.5) * 0.7, d.y + (Math.random() - 0.5) * 0.7, d.z + (Math.random() - 0.5) * 0.7], i * 3); life[i] = 0; }}
        update={(dt, i, pos, v, life) => { life[i] += dt * 0.7; if (life[i] > 1) { pos.set([nozzle.x, nozzle.y, nozzle.z], i * 3); life[i] = 0; }
          pos[i * 3] += v[i * 3] * dt; pos[i * 3 + 1] += v[i * 3 + 1] * dt; pos[i * 3 + 2] += v[i * 3 + 2] * dt; }} />

      {/* dust drifting with the cabin air (stops when the fans are off) */}
      <Particles count={90} color="#cfe3ff" size={0.025} texture={dot} opacity={0.5}
        spawn={(i, pos) => { pos.set([(Math.random() - 0.5) * 3.6, (Math.random() - 0.5) * 3.2, Z_NEAR - Math.random() * 12], i * 3); }}
        update={(dt, i, pos) => { pos[i * 3] += (0.04 + air * 1.6) * dt; pos[i * 3 + 1] += Math.sin(i + pos[i * 3]) * 0.02 * dt; if (pos[i * 3] > 1.9) pos[i * 3] = -1.9; }} />

      <Rig shakeKey={p.shakeKey} />
    </>
  );
}

export default function Module3D(props: Module3DProps) {
  const [hover, setHover] = useState<Equip | null>(null);
  const labels = useRef<Partial<Record<Equip, HTMLDivElement | null>>>({});
  useEffect(() => () => { document.body.style.cursor = ""; }, []);
  const shown = new Set<Equip>(props.hotspots.map((h) => EQUIP_OF[h]).filter(Boolean) as Equip[]);
  const recEquip = props.recommended ? EQUIP_OF[props.recommended as E.ActionId] : undefined;
  return (
    <div className="absolute inset-0">
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.15, 5.4], fov: 62, near: 0.05, far: 40 }}
        gl={{ antialias: true, powerPreference: "high-performance" }} onPointerMissed={() => setHover(null)}>
        <Scene {...props} hover={setHover} labels={labels} />
      </Canvas>
      {(Object.keys(POS) as Equip[]).map((k) => {
        const action = props.hotspots.find((h) => EQUIP_OF[h] === k);
        const visible = shown.has(k) || hover === k;
        return (
          <div key={k} ref={(el) => { labels.current[k] = el; }} className="pointer-events-none absolute left-0 top-0 will-change-transform">
            <div className={`num -translate-x-1/2 translate-y-[-150%] whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-semibold shadow-lg transition-opacity duration-200 ${
              visible ? "opacity-100" : "opacity-0"} ${action ? (recEquip === k ? "bg-cool text-[#04121f]" : "bg-[#FFB873] text-[#1a1208]") : "bg-black/70 text-white/80"}`}>
              {action ? `${E.ACTIONS[action].icon} ${E.ACTIONS[action].label}${recEquip === k ? " · Nova" : ""}` : EQUIP_NAME[k]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
