// Commander Nova: a stylised 3D astronaut built in code (no downloads), rendered with studio reflections,
// a gold mirror visor and a cyan rim light. Jointed arms so it can really wave.
//   wave     — upper arm raised, forearm swinging at the elbow, head tilt (greeting / hover)
//   thinking — hand to helmet, head tilted, three glowing dots orbiting the helmet
//   talking  — gentle bob, glowing visor, left hand gesturing
//   idle     — zero-g drift, turns a little toward the cursor
// Static pose under prefers-reduced-motion.
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type Mood = "idle" | "wave" | "thinking" | "talking";

/** Studio reflections generated in code (no HDRI download) — this is what makes the visor and suit look real. */
export function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
}

function useMaterials() {
  return useMemo(() => ({
    suit: new THREE.MeshPhysicalMaterial({ color: "#F5F7FB", roughness: 0.55, sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color("#DCE6FF"), clearcoat: 0.2 }),
    shell: new THREE.MeshPhysicalMaterial({ color: "#FFFFFF", roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }),
    trim: new THREE.MeshPhysicalMaterial({ color: "#B9C3D3", roughness: 0.35, metalness: 0.6 }),
    dark: new THREE.MeshPhysicalMaterial({ color: "#232B3D", roughness: 0.4, metalness: 0.3 }),
    visor: new THREE.MeshPhysicalMaterial({ color: "#E2A94A", metalness: 1, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02,
      emissive: new THREE.Color("#FF9A1F"), emissiveIntensity: 0.05, envMapIntensity: 1.8 }),
    orange: new THREE.MeshPhysicalMaterial({ color: "#FF8A1F", roughness: 0.4, emissive: new THREE.Color("#FF6A1A"), emissiveIntensity: 0.2 }),
    stripe: new THREE.MeshPhysicalMaterial({ color: "#2D6BFF", roughness: 0.4 }),
    glowCyan: new THREE.MeshBasicMaterial({ color: "#5FE6FF" }),
    glowRed: new THREE.MeshBasicMaterial({ color: "#FF4B4B" }),
    glowAmber: new THREE.MeshBasicMaterial({ color: "#FFC83D" }),
  }), []);
}

const cap = (r: number, len: number) => <capsuleGeometry args={[r, len, 8, 20]} />;

/** Shoulder pivot → upper arm → elbow pivot → forearm → glove with thumb. */
function Arm({ side, shoulder, elbow, m }: {
  side: 1 | -1; shoulder: React.RefObject<THREE.Group>; elbow: React.RefObject<THREE.Group>; m: ReturnType<typeof useMaterials>;
}) {
  return (
    <group ref={shoulder} position={[0.36 * side, 0.2, 0]}>
      <mesh material={m.suit} position={[0, -0.13, 0]}>{cap(0.105, 0.16)}</mesh>
      <mesh material={m.stripe} position={[0, -0.1, 0]}><torusGeometry args={[0.108, 0.018, 8, 24]} /></mesh>
      <group ref={elbow} position={[0, -0.27, 0]}>
        <mesh material={m.trim}><sphereGeometry args={[0.09, 16, 12]} /></mesh>
        <mesh material={m.suit} position={[0, -0.13, 0]}>{cap(0.095, 0.13)}</mesh>
        <mesh material={m.trim} position={[0, -0.24, 0]}><cylinderGeometry args={[0.1, 0.1, 0.05, 20]} /></mesh>
        {/* glove + thumb */}
        <mesh material={m.shell} position={[0, -0.33, 0]} scale={[1, 1.1, 0.8]}><sphereGeometry args={[0.1, 20, 16]} /></mesh>
        <mesh material={m.shell} position={[0.07 * -side, -0.3, 0.04]} rotation={[0, 0, 0.6 * side]}>{cap(0.03, 0.05)}</mesh>
      </group>
    </group>
  );
}

export function Suit({ mood, reduced, cursor }: { mood: Mood; reduced: boolean; cursor: React.MutableRefObject<{ x: number; y: number }> }) {
  const m = useMaterials();
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const shR = useRef<THREE.Group>(null), elR = useRef<THREE.Group>(null);
  const shL = useRef<THREE.Group>(null), elL = useRef<THREE.Group>(null);
  const legs = useRef<THREE.Group>(null);
  const dots = useRef<THREE.Group>(null);
  const antenna = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.05);
    if (!reduced) t.current += dt;
    const s = t.current;
    const d = (cur: number, to: number, l = 6) => THREE.MathUtils.damp(cur, to, l, dt);
    const wave = mood === "wave", think = mood === "thinking", talk = mood === "talking";

    if (root.current) {
      root.current.position.y = Math.sin(s * 1.25) * 0.06 + (talk ? Math.abs(Math.sin(s * 7)) * 0.025 : 0);
      root.current.rotation.z = d(root.current.rotation.z, Math.sin(s * 0.9) * 0.05);
    }
    if (body.current) {
      // three-quarter view, turning a little toward the cursor
      body.current.rotation.y = d(body.current.rotation.y, -0.35 + cursor.current.x * 0.35 + (think ? 0.2 : 0), 3);
      body.current.rotation.x = d(body.current.rotation.x, 0.06 + cursor.current.y * 0.08, 3);
    }
    if (head.current) {
      head.current.rotation.z = d(head.current.rotation.z, wave ? 0.16 + Math.sin(s * 4.5) * 0.06 : think ? -0.22 : Math.sin(s * 0.8) * 0.05);
      head.current.rotation.x = d(head.current.rotation.x, talk ? Math.sin(s * 7) * 0.07 : think ? 0.1 : 0);
    }
    // right arm: wave = raised with the forearm swinging; think = hand to helmet; else relaxed float
    if (shR.current && elR.current) {
      shR.current.rotation.z = d(shR.current.rotation.z, wave ? 2.55 : think ? 2.25 : 0.3 + Math.sin(s * 1.1) * 0.06, 8);
      shR.current.rotation.x = d(shR.current.rotation.x, think ? -0.5 : 0, 8);
      elR.current.rotation.z = d(elR.current.rotation.z, wave ? 0.35 + Math.sin(s * 10) * 0.55 : think ? 1.9 : 0.25, 10);
    }
    if (shL.current && elL.current) {
      shL.current.rotation.z = d(shL.current.rotation.z, talk ? -0.9 + Math.sin(s * 5) * 0.15 : -0.3 + Math.sin(s * 1.2 + 1) * 0.06, 8);
      elL.current.rotation.z = d(elL.current.rotation.z, talk ? -0.9 + Math.sin(s * 5 + 1) * 0.25 : -0.25, 8);
    }
    if (legs.current) legs.current.rotation.x = Math.sin(s * 1.0) * 0.1;
    if (dots.current) {
      dots.current.visible = think;
      dots.current.rotation.y = s * 3;
      dots.current.children.forEach((c, i) => { c.position.y = Math.sin(s * 6 + i * 2) * 0.04; });
    }
    if (antenna.current) (antenna.current.material as THREE.MeshBasicMaterial).color.set(Math.sin(s * (think ? 12 : 3)) > 0 ? "#FF4B1A" : "#5A1A0A");
    m.visor.emissiveIntensity = d(m.visor.emissiveIntensity, talk ? 0.45 + Math.sin(s * 8) * 0.15 : think ? 0.2 : 0.05, 8);
  });

  return (
    <group ref={root}>
      <group ref={body}>
        {/* backpack (PLSS) with status lights */}
        <mesh material={m.shell} position={[0, 0.05, -0.34]}><boxGeometry args={[0.6, 0.7, 0.26]} /></mesh>
        <mesh material={m.trim} position={[0, 0.42, -0.34]}><boxGeometry args={[0.5, 0.06, 0.22]} /></mesh>
        <mesh material={m.glowCyan} position={[-0.18, -0.2, -0.47]}><sphereGeometry args={[0.025, 10, 10]} /></mesh>
        <mesh material={m.glowAmber} position={[-0.1, -0.2, -0.47]}><sphereGeometry args={[0.025, 10, 10]} /></mesh>

        {/* torso */}
        <mesh material={m.suit}>{cap(0.34, 0.36)}</mesh>
        <mesh material={m.trim} position={[0, -0.3, 0]}><torusGeometry args={[0.32, 0.04, 10, 40]} /></mesh>
        {/* chest control box with glowing buttons */}
        <group position={[0, 0.02, 0.33]} rotation={[-0.12, 0, 0]}>
          <mesh material={m.dark}><boxGeometry args={[0.32, 0.18, 0.08]} /></mesh>
          <mesh material={m.glowRed} position={[-0.09, 0.03, 0.045]}><boxGeometry args={[0.05, 0.035, 0.01]} /></mesh>
          <mesh material={m.glowCyan} position={[0, 0.03, 0.045]}><boxGeometry args={[0.05, 0.035, 0.01]} /></mesh>
          <mesh material={m.glowAmber} position={[0.09, 0.03, 0.045]}><boxGeometry args={[0.05, 0.035, 0.01]} /></mesh>
          <mesh material={m.trim} position={[0, -0.045, 0.045]}><boxGeometry args={[0.22, 0.02, 0.01]} /></mesh>
        </group>
        {/* shoulder mission patch */}
        <mesh material={m.orange} position={[-0.3, 0.2, 0.15]} rotation={[0, -1.0, 0]}><cylinderGeometry args={[0.07, 0.07, 0.015, 24]} /></mesh>

        {/* helmet: big glossy shell, gold mirror visor, collar ring, antenna */}
        <group ref={head} position={[0, 0.66, 0]}>
          <mesh material={m.shell}><sphereGeometry args={[0.46, 48, 36]} /></mesh>
          {/* visor ellipsoid pokes out of the helmet front (front at z≈0.49 vs shell 0.46) to form the face plate */}
          <mesh material={m.visor} position={[0, -0.02, 0.22]} scale={[1, 0.82, 0.75]}><sphereGeometry args={[0.36, 48, 36]} /></mesh>
          {/* visor highlight streak */}
          <mesh position={[-0.12, 0.1, 0.47]} rotation={[0, 0, 0.5]}><capsuleGeometry args={[0.022, 0.12, 4, 10]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={0.75} /></mesh>
          <mesh material={m.trim} position={[0, -0.4, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.27, 0.05, 12, 40]} /></mesh>
          <mesh material={m.trim} position={[0.26, 0.4, -0.08]} rotation={[0, 0, -0.4]}><cylinderGeometry args={[0.012, 0.012, 0.2, 8]} /></mesh>
          <mesh ref={antenna} position={[0.31, 0.49, -0.08]}><sphereGeometry args={[0.035, 12, 12]} /><meshBasicMaterial color="#FF4B1A" /></mesh>
          {/* thinking dots orbiting the helmet */}
          <group ref={dots} position={[0, 0.62, 0]} visible={false}>
            {[0, 1, 2].map((i) => (
              <mesh key={i} material={m.glowCyan} position={[Math.cos((i * Math.PI * 2) / 3) * 0.22, 0, Math.sin((i * Math.PI * 2) / 3) * 0.22]}>
                <sphereGeometry args={[0.04, 12, 12]} />
              </mesh>
            ))}
          </group>
        </group>

        <Arm side={1} shoulder={shR} elbow={elR} m={m} />
        <Arm side={-1} shoulder={shL} elbow={elL} m={m} />

        {/* legs with knee pads and boots */}
        <group ref={legs} position={[0, -0.42, 0]}>
          {[-0.15, 0.15].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh material={m.suit} position={[0, -0.2, 0]}>{cap(0.125, 0.24)}</mesh>
              <mesh material={m.shell} position={[0, -0.2, 0.11]} scale={[1, 1, 0.5]}><sphereGeometry args={[0.08, 16, 12]} /></mesh>
              <mesh material={m.dark} position={[0, -0.43, 0.04]} scale={[1, 0.7, 1.35]}><sphereGeometry args={[0.13, 20, 14]} /></mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

export default function Astronaut3D({ mood, size }: { mood: Mood; size: number }) {
  const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const cursor = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      cursor.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      cursor.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return (
    <div style={{ width: size, height: size }} aria-hidden>
      <Canvas dpr={[1, 1.5]} camera={{ fov: 30, position: [0, 0.25, 4.6] }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
        <Environment />
        <ambientLight intensity={0.2} />
        <directionalLight position={[3, 4, 5]} intensity={2.2} color="#FFF4E6" />
        <directionalLight position={[-4, 2, -3]} intensity={4} color="#3DD9FF" />
        <pointLight position={[0, -2.2, 2]} intensity={7} distance={6} color="#FF9A1F" />
        <Suit mood={mood} reduced={reduced} cursor={cursor} />
      </Canvas>
    </div>
  );
}
