// Interactive 3D Earth (three.js). Real NASA Blue Marble day map, city lights on the night side,
// ocean glint, and an atmosphere glow. Slowly rotates, tilts toward the cursor, drag to spin (with inertia).
// Loaded lazily from Hero; if WebGL is missing or anything throws, Hero falls back to the CSS EarthLimb.
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import dayUrl from "../../assets/earth/earth-blue-marble.jpg";
import nightUrl from "../../assets/earth/earth-night.jpg";
import waterUrl from "../../assets/earth/earth-water.png";

// sun from the upper left, so the right of the visible cap falls into night and shows city lights
const SUN = new THREE.Vector3(-1.0, 0.35, 0.25).normalize();

const earthVert = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const earthFrag = /* glsl */ `
  uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D waterMap; uniform vec3 sunDir;
  varying vec2 vUv; varying vec3 vN; varying vec3 vView;
  void main() {
    vec3 n = normalize(vN);
    float d = dot(n, sunDir);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;
    float dayMix = smoothstep(-0.18, 0.28, d);
    vec3 col = mix(night * vec3(1.6, 1.25, 0.9), day * (0.18 + 1.05 * max(d, 0.0)), dayMix);
    float water = texture2D(waterMap, vUv).r;
    float spec = pow(max(dot(reflect(-sunDir, n), vView), 0.0), 28.0) * water * 0.55 * dayMix;
    col += vec3(1.0, 0.95, 0.85) * spec;
    float fres = pow(1.0 - max(dot(n, vView), 0.0), 2.6);
    col += vec3(0.30, 0.55, 1.0) * fres * (0.15 + 0.45 * dayMix);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;
const atmoVert = /* glsl */ `
  varying vec3 vN; varying vec3 vView;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const atmoFrag = /* glsl */ `
  uniform vec3 sunDir; varying vec3 vN; varying vec3 vView;
  void main() {
    // back-face shell: brightest just outside the planet's edge, fading smoothly into space
    // -dot is ~0.33 at the planet's edge (shell scale 1.06) and 0 at the shell's outer edge
    float i = pow(clamp(-dot(normalize(vN), vView) / 0.33, 0.0, 1.0), 2.4);
    float lit = 0.25 + 0.75 * smoothstep(-0.5, 0.4, dot(normalize(vN), sunDir));
    gl_FragColor = vec4(vec3(0.32, 0.58, 1.0) * i * lit * 1.3, i * lit * 0.8);
  }`;

export interface GlobeControls {
  drag: { active: boolean; x: number; y: number; px: number; py: number; vx: number; vy: number }; // p* = pending pointer delta, v* = velocity
  cursor: { x: number; y: number }; // -1..1
  reduced: boolean;
}

function Earth({ ctl, radius, y, z, showOrbit }: { ctl: GlobeControls; radius: number; y: number; z: number; showOrbit: boolean }) {
  const [day, night, water] = useLoader(THREE.TextureLoader, [dayUrl, nightUrl, waterUrl]);
  day.colorSpace = THREE.SRGBColorSpace;
  night.colorSpace = THREE.SRGBColorSpace;
  const spin = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const rot = useRef({ y: 0.4, x: 0.12 }); // start facing Africa / Europe
  const earthMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { dayMap: { value: day }, nightMap: { value: night }, waterMap: { value: water }, sunDir: { value: SUN } },
    vertexShader: earthVert, fragmentShader: earthFrag,
  }), [day, night, water]);
  const atmoMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: SUN } }, vertexShader: atmoVert, fragmentShader: atmoFrag,
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }), []);

  useFrame((_, dt) => {
    const r = rot.current, d = ctl.drag;
    dt = Math.min(dt, 0.05);
    if (d.active) {
      r.y += d.px; r.x += d.py;          // follow the pointer exactly
      d.vx = d.px; d.vy = d.py;          // remember the speed for inertia on release
      d.px = 0; d.py = 0;
    } else {
      r.y += d.vx; r.x += d.vy;          // coast after a flick, decaying back to auto-rotation
      d.vx *= 0.94; d.vy *= 0.94;
      if (!ctl.reduced) r.y += dt * 0.045;
    }
    r.x = THREE.MathUtils.clamp(r.x, -0.2, 0.9);
    if (spin.current) { spin.current.rotation.y = r.y; spin.current.rotation.x = r.x; }
    if (tilt.current) {
      // gentle parallax toward the cursor (off under reduced motion)
      const k = ctl.reduced ? 0 : 1;
      tilt.current.rotation.y = THREE.MathUtils.lerp(tilt.current.rotation.y, ctl.cursor.x * 0.18 * k, 0.05);
      tilt.current.rotation.x = THREE.MathUtils.lerp(tilt.current.rotation.x, -ctl.cursor.y * 0.08 * k, 0.05);
    }
  });

  return (
    <group position={[0, y, z]}>
      <group ref={tilt}>
        <group ref={spin}>
          <mesh material={earthMat}><sphereGeometry args={[radius, 128, 96]} /></mesh>
        </group>
        <mesh material={atmoMat} scale={1.06}><sphereGeometry args={[radius, 96, 64]} /></mesh>
        <Orbit radius={radius} show={showOrbit} reduced={ctl.reduced} />
      </group>
    </group>
  );
}


// ---------------------------------------------------------------- spacecraft context (orbit, Moon, Mars)
/** Small procedural planet texture (equirectangular): base colour + soft dark patches. Deterministic, no downloads. */
function planetTexture(base: string, spot: string, seed: number, n: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = base; g.fillRect(0, 0, 256, 128);
  let s = seed;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < n; i++) {
    const x = r() * 256, y = 10 + r() * 108, rad = 2 + r() ** 2 * 16;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, spot); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fades a group's scale toward 1 (shown) or 0 (hidden). */
function useFade(ref: React.RefObject<THREE.Group>, show: boolean) {
  useFrame((_, dt) => {
    const gr = ref.current;
    if (!gr) return;
    const k = THREE.MathUtils.damp(gr.scale.x, show ? 1 : 0.0001, 4, dt);
    gr.scale.setScalar(k);
    gr.visible = k > 0.002;
  });
}

function Orbit({ radius, show, reduced }: { radius: number; show: boolean; reduced: boolean }) {
  const root = useRef<THREE.Group>(null);
  const station = useRef<THREE.Group>(null);
  const a = useRef(0.6);
  useFade(root, show);
  useFrame((_, dt) => {
    if (!reduced) a.current += Math.min(dt, 0.05) * 0.18;
    const R = radius * 1.075;
    station.current?.position.set(Math.cos(a.current) * R, Math.sin(a.current) * R, 0);
  });
  return (
    // Ring plane faces the camera, tipped back 0.5 rad: its upper half arcs over the visible top of the planet
    // (the globe's centre is far below the screen, so an equatorial ring would be off-screen).
    <group ref={root} rotation={[0.5, 0, 0.14]}>
      <mesh>
        <torusGeometry args={[radius * 1.075, radius * 0.0016, 8, 256]} />
        <meshBasicMaterial color="#7FE7FF" transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <group ref={station}>
        <mesh><sphereGeometry args={[radius * 0.006, 12, 12]} /><meshBasicMaterial color="#FFFFFF" /></mesh>
        <mesh><sphereGeometry args={[radius * 0.02, 16, 16]} />
          <meshBasicMaterial color="#9BEFFF" transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      </group>
    </group>
  );
}

function SkyBody({ kind, show, position, size }: { kind: "moon" | "mars"; show: boolean; position: [number, number, number]; size: number }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const map = useMemo(() => (kind === "moon"
    ? planetTexture("#9a9a96", "rgba(55,55,60,0.75)", 7, 140)
    : planetTexture("#b5532a", "rgba(70,22,8,0.7)", 11, 70)), [kind]);
  useFade(root, show);
  useFrame((_, dt) => { if (body.current) body.current.rotation.y += Math.min(dt, 0.05) * 0.03; });
  return (
    <group ref={root} position={position}>
      <mesh ref={body}>
        <sphereGeometry args={[size, 48, 32]} />
        <meshStandardMaterial map={map} roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

export default function Globe({ radius = 4.6, y = -4.75, z = -3, vehicleId = null }:
  { radius?: number; y?: number; z?: number; vehicleId?: string | null }) {
  // Scene dressing per vehicle preset (ids come from /api/meta.vehicles). Purely visual.
  const v = vehicleId ?? "";
  const showOrbit = v === "iss" || v === "gateway" || v === "";
  const showMoon = v === "lunar" || v === "gateway";
  const showMars = v === "mars_transit";
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const ctl = useRef<GlobeControls>({
    drag: { active: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0 },
    cursor: { x: 0, y: 0 },
    reduced: typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  }).current;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // pause rendering when the hero is scrolled away
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ctl.cursor.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ctl.cursor.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      const d = ctl.drag;
      if (d.active) {
        d.px += (e.clientX - d.x) * 0.005; d.py += (e.clientY - d.y) * 0.003;
        d.x = e.clientX; d.y = e.clientY;
      }
    };
    const onUp = () => { ctl.drag.active = false; el.style.cursor = "grab"; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { io.disconnect(); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [ctl]);

  return (
    <div ref={wrap} className="absolute inset-0 cursor-grab touch-pan-y" aria-label="3D Earth — drag to rotate"
      role="img"
      onPointerDown={(e) => { Object.assign(ctl.drag, { active: true, x: e.clientX, y: e.clientY, px: 0, py: 0, vx: 0, vy: 0 }); e.currentTarget.style.cursor = "grabbing"; }}>
      <Canvas frameloop={visible ? "always" : "never"} dpr={[1, 1.5]} camera={{ fov: 35, position: [0, 0, 5] }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}>
        <Suspense fallback={null}>
          <Earth ctl={ctl} radius={radius} y={y} z={z} showOrbit={showOrbit} />
          <ambientLight intensity={0.12} />
          <directionalLight position={[SUN.x * 10, SUN.y * 10, SUN.z * 10]} intensity={2.4} />
          <SkyBody kind="moon" show={showMoon} position={[2.15, 1.05, -1.5]} size={0.32} />
          <SkyBody kind="mars" show={showMars} position={[-2.9, 1.25, -1.5]} size={0.22} />
        </Suspense>
      </Canvas>
    </div>
  );
}
