import { useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { daylight, kelvinToHex, skyColor, temperatureToHex } from '../../core/color';
import type { AromaType, EnvValues, Soundscape } from '../../core/types';

/*
 * Habitación de hospital individual, vista como maqueta (sin techo ni pared frontal).
 * Coordenadas en metros: x ∈ [-3, 3] (izquierda → derecha), z ∈ [-2.5, 2.5] (fondo → frente),
 * y = altura (techo a 2,8 m). La cabecera de la cama está contra la pared del fondo.
 */

const W = 6;
const D = 5;
const H = 2.8;

const C = {
  floor: '#c7d0d6',
  wall: '#eef1f2',
  accent: '#d3e5e1',
  skirting: '#7c8b95',
  rail: '#b8c4cc',
  frame: '#d9dee3',
  metal: '#9aa6b2',
  dark: '#334155',
  laminate: '#e6d6bd',
  laminateEdge: '#c7b08d',
  mattress: '#4c7aa3',
  sheet: '#f8fafc',
  blanket: '#bcd3e6',
  gown: '#9cc3c4',
  skin: '#e5bea0',
  hair: '#5b4636',
  upholstery: '#3f8a8a',
  curtain: '#b7d3e3',
  blind: '#ece6d8',
} as const;

const AROMA_COLORS: Record<AromaType, string> = {
  lavanda: '#a78bfa',
  citrico: '#fb923c',
  eucalipto: '#34d399',
};

/** Pulsos por segundo del altavoz según el paisaje sonoro. */
const SOUND_SPEED: Record<Soundscape, number> = {
  silencio: 0,
  lluvia: 1.6,
  bosque: 0.9,
  olas: 0.45,
  pajaros: 2.2,
  respiracion: 0.2,
  ruido_blanco: 1.2,
};

type Vec3 = [number, number, number];

/** Caja con material estándar: el ladrillo básico de toda la escena. */
function Box({
  size,
  position,
  color,
  rotation,
  roughness = 0.8,
  metalness = 0,
  emissive,
  emissiveIntensity,
  opacity,
}: {
  size: Vec3;
  position: Vec3;
  color: string;
  rotation?: Vec3;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissiveIntensity ?? 0}
        transparent={opacity !== undefined}
        opacity={opacity ?? 1}
      />
    </mesh>
  );
}

function Cylinder({
  radius,
  height,
  position,
  color,
  rotation,
  metalness = 0.4,
  roughness = 0.4,
}: {
  radius: number;
  height: number;
  position: Vec3;
  color: string;
  rotation?: Vec3;
  metalness?: number;
  roughness?: number;
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <cylinderGeometry args={[radius, radius, height, 20]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Envolvente: suelo vinílico, paredes, zócalo y pasamanos              */
/* ------------------------------------------------------------------ */

function Floor() {
  // Juntas del suelo vinílico en losetas de 1 m.
  const seams = useMemo(() => {
    const lines: { pos: Vec3; size: Vec3 }[] = [];
    for (let x = -2; x <= 2; x += 1) lines.push({ pos: [x, 0.002, 0], size: [0.008, 0.001, D] });
    for (let z = -2; z <= 2; z += 1) lines.push({ pos: [0, 0.002, z], size: [W, 0.001, 0.008] });
    return lines;
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color={C.floor} roughness={0.55} />
      </mesh>
      {seams.map((s, i) => (
        <Box key={i} size={s.size} position={s.pos} color="#b4bec6" />
      ))}
      {/* Techo: solo se ve desde dentro (mira hacia abajo). */}
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
    </group>
  );
}

interface WallProps {
  /** Centro de la pared (a media altura). */
  center: Vec3;
  /** Giro del plano para que su cara mire hacia dentro de la habitación. */
  rotationY: number;
  /** Normal hacia el interior. */
  normal: Vec3;
  width: number;
  children?: ReactNode;
}

/**
 * Pared con todo lo que va colgado de ella. Cuando la cámara queda por fuera, la pared
 * desaparece junto con sus elementos: así la maqueta se ve siempre por dentro y nada flota.
 */
function Wall({ center, rotationY, normal, width, children }: WallProps) {
  const group = useRef<THREE.Group>(null);
  const n = useMemo(() => new THREE.Vector3(...normal), [normal]);
  const p = useMemo(() => new THREE.Vector3(...center), [center]);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    if (group.current) group.current.visible = tmp.copy(camera.position).sub(p).dot(n) > 0;
  });

  return (
    <group ref={group}>
      <mesh position={center} rotation={[0, rotationY, 0]}>
        <planeGeometry args={[width, H]} />
        <meshStandardMaterial color={C.wall} roughness={0.95} />
      </mesh>
      {/* Zócalo sanitario (media caña) */}
      <mesh
        position={[center[0] + normal[0] * 0.012, 0.05, center[2] + normal[2] * 0.012]}
        rotation={[0, rotationY, 0]}
      >
        <boxGeometry args={[width, 0.1, 0.02]} />
        <meshStandardMaterial color={C.skirting} />
      </mesh>
      {children}
    </group>
  );
}

const BACK_WALL = { center: [0, H / 2, -D / 2] as Vec3, normal: [0, 0, 1] as Vec3 };
const LEFT_WALL = { center: [-W / 2, H / 2, 0] as Vec3, normal: [1, 0, 0] as Vec3 };
const RIGHT_WALL = { center: [W / 2, H / 2, 0] as Vec3, normal: [-1, 0, 0] as Vec3 };
const FRONT_WALL = { center: [0, H / 2, D / 2] as Vec3, normal: [0, 0, -1] as Vec3 };

/** Puerta de entrada desde el pasillo, con mirilla y placa de la habitación. */
function EntranceDoor() {
  return (
    <group position={[-1.6, 0, D / 2 - 0.01]} rotation={[0, Math.PI, 0]}>
      <Box size={[1.35, 2.15, 0.04]} position={[0, 1.075, 0.02]} color="#b9c6cf" />
      <Box size={[1.25, 2.08, 0.03]} position={[0, 1.04, 0.045]} color="#d8c3a0" roughness={0.6} />
      <Box size={[0.18, 0.5, 0.01]} position={[0.3, 1.45, 0.062]} color="#cfe3ee" roughness={0.1} />
      <Box
        size={[0.16, 0.025, 0.04]}
        position={[-0.45, 1.0, 0.08]}
        color={C.metal}
        metalness={0.8}
        roughness={0.2}
      />
      {/* Barra protectora inferior */}
      <Box size={[1.25, 0.25, 0.012]} position={[0, 0.2, 0.065]} color="#cbd5e1" metalness={0.5} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Ventana con persiana enrollable                                      */
/* ------------------------------------------------------------------ */

const WIN = { x: 1.75, y: 1.5, w: 1.8, h: 1.35 };

function HospitalWindow({ hour, blindsPct }: { hour: number; blindsPct: number }) {
  const sky = skyColor(hour);
  const closed = 1 - Math.min(100, Math.max(0, blindsPct)) / 100;
  const blindH = Math.max(0.02, WIN.h * closed);
  const z = -D / 2;
  return (
    <group position={[WIN.x, WIN.y, z]}>
      <mesh position={[0, 0, 0.005]}>
        <planeGeometry args={[WIN.w, WIN.h]} />
        <meshBasicMaterial color={sky} toneMapped={false} />
      </mesh>
      {/* Marco de aluminio y montante central */}
      <Box
        size={[WIN.w + 0.1, 0.06, 0.08]}
        position={[0, WIN.h / 2 + 0.03, 0.04]}
        color={C.frame}
        metalness={0.3}
        roughness={0.4}
      />
      <Box
        size={[WIN.w + 0.1, 0.06, 0.08]}
        position={[0, -WIN.h / 2 - 0.03, 0.04]}
        color={C.frame}
        metalness={0.3}
        roughness={0.4}
      />
      <Box
        size={[0.06, WIN.h, 0.08]}
        position={[-WIN.w / 2 - 0.02, 0, 0.04]}
        color={C.frame}
        metalness={0.3}
        roughness={0.4}
      />
      <Box
        size={[0.06, WIN.h, 0.08]}
        position={[WIN.w / 2 + 0.02, 0, 0.04]}
        color={C.frame}
        metalness={0.3}
        roughness={0.4}
      />
      <Box
        size={[0.04, WIN.h, 0.06]}
        position={[0, 0, 0.03]}
        color={C.frame}
        metalness={0.3}
        roughness={0.4}
      />
      {/* Alféizar */}
      <Box
        size={[WIN.w + 0.3, 0.04, 0.22]}
        position={[0, -WIN.h / 2 - 0.08, 0.11]}
        color="#f1f5f9"
      />
      {/* Cajón y tela de la persiana */}
      <Box
        size={[WIN.w + 0.16, 0.12, 0.14]}
        position={[0, WIN.h / 2 + 0.1, 0.09]}
        color="#f8fafc"
      />
      <Box
        size={[WIN.w, blindH, 0.01]}
        position={[0, WIN.h / 2 - blindH / 2, 0.1]}
        color={C.blind}
        roughness={1}
      />
      <Box
        size={[WIN.w + 0.02, 0.025, 0.03]}
        position={[0, WIN.h / 2 - blindH, 0.1]}
        color="#cbd5e1"
        metalness={0.4}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Cabecero técnico: gases medicinales, tomas, luz indirecta y llamada  */
/* ------------------------------------------------------------------ */

function Headwall({ lightPct, kelvin }: { lightPct: number; kelvin: number }) {
  const z = -D / 2 + 0.05;
  const lamp = kelvinToHex(kelvin);
  const k = lightPct / 100;
  return (
    <group position={[-0.95, 0, z]}>
      {/* Carril horizontal */}
      <Box size={[2.1, 0.3, 0.08]} position={[0, 1.5, 0]} color="#f8fafc" roughness={0.4} />
      <Box
        size={[2.1, 0.03, 0.085]}
        position={[0, 1.36, 0]}
        color={C.metal}
        metalness={0.5}
        roughness={0.3}
      />
      {/* Luz indirecta hacia el techo */}
      <Box
        size={[2.0, 0.025, 0.06]}
        position={[0, 1.66, 0.01]}
        color="#ffffff"
        emissive={lamp}
        emissiveIntensity={0.3 + k * 2.2}
      />
      {/* Tomas de gases: O₂ (blanco/verde), aire (negro/blanco), vacío (amarillo) */}
      {(
        [
          [-0.7, '#16a34a'],
          [-0.55, '#111827'],
          [-0.4, '#eab308'],
        ] as const
      ).map(([x, color]) => (
        <group key={x} position={[x, 1.5, 0.05]}>
          <Cylinder
            radius={0.035}
            height={0.03}
            position={[0, 0, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            color="#e5e7eb"
          />
          <Cylinder
            radius={0.018}
            height={0.035}
            position={[0, 0, 0.01]}
            rotation={[Math.PI / 2, 0, 0]}
            color={color}
            metalness={0.1}
          />
        </group>
      ))}
      {/* Caudalímetro de oxígeno colgado de la toma */}
      <Cylinder
        radius={0.025}
        height={0.14}
        position={[-0.7, 1.36, 0.08]}
        color="#e0f2fe"
        metalness={0.1}
      />
      {/* Enchufes */}
      {[0.35, 0.5, 0.65].map((x) => (
        <Box
          key={x}
          size={[0.09, 0.09, 0.02]}
          position={[x, 1.5, 0.05]}
          color="#ffffff"
          roughness={0.3}
        />
      ))}
      {/* Pulsador de llamada a enfermería */}
      <Box size={[0.08, 0.08, 0.02]} position={[0.85, 1.5, 0.05]} color="#ffffff" />
      <Cylinder
        radius={0.022}
        height={0.02}
        position={[0.85, 1.5, 0.065]}
        rotation={[Math.PI / 2, 0, 0]}
        color="#dc2626"
        metalness={0}
      />
      {/* Lámpara de lectura articulada */}
      <Box size={[0.04, 0.04, 0.3]} position={[0.55, 1.95, 0.15]} color={C.metal} metalness={0.5} />
      <mesh position={[0.55, 1.92, 0.32]} rotation={[0.4, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 0.07, 20]} />
        <meshStandardMaterial
          color="#f8fafc"
          emissive={lamp}
          emissiveIntensity={k > 0.05 ? 0.4 + k : 0}
        />
      </mesh>
      <pointLight
        position={[0, 1.75, 0.25]}
        color={lamp}
        intensity={k * 2.5}
        distance={3.5}
        decay={1.6}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Cama hospitalaria articulada                                         */
/* ------------------------------------------------------------------ */

const BED = { x: -0.95, headZ: -D / 2 + 0.22, width: 0.92, length: 2.05, deckY: 0.5 };
/** Largo del respaldo, desde la cabecera hasta la bisagra. */
const BACK_LEN = 0.8;

function Caster({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <Cylinder radius={0.012} height={0.08} position={[0, 0.11, 0]} color={C.metal} />
      <Cylinder
        radius={0.05}
        height={0.035}
        position={[0, 0.05, 0]}
        rotation={[0, 0, Math.PI / 2]}
        color="#1f2937"
        metalness={0.1}
        roughness={0.7}
      />
    </group>
  );
}

function SideRail({ x, length }: { x: number; length: number }) {
  return (
    <group position={[x, 0.2, -length / 2 - 0.05]}>
      <Box size={[0.025, 0.03, length]} position={[0, 0.12, 0]} color="#e5e7eb" roughness={0.4} />
      <Box
        size={[0.02, 0.025, length - 0.08]}
        position={[0, 0.02, 0]}
        color="#e5e7eb"
        roughness={0.4}
      />
      {[-length / 2 + 0.06, length / 2 - 0.06].map((z) => (
        <Box
          key={z}
          size={[0.02, 0.13, 0.03]}
          position={[0, 0.07, z]}
          color={C.metal}
          metalness={0.4}
        />
      ))}
    </group>
  );
}

function HospitalBed({ occupied, bedDeg }: { occupied: boolean; bedDeg: number }) {
  const back = useRef<THREE.Group>(null);
  const goal = (Math.max(0, Math.min(70, bedDeg)) * Math.PI) / 180;

  // Suaviza el movimiento entre ticks del reloj simulado.
  useFrame((_, delta) => {
    const g = back.current;
    if (!g) return;
    g.rotation.x += (goal - g.rotation.x) * Math.min(1, delta * 4);
  });

  const legLen = BED.length - BACK_LEN - 0.1;
  const hingeZ = 0.1 + BACK_LEN;
  const mattressH = 0.14;
  const halfW = BED.width / 2;

  return (
    <group position={[BED.x, 0, BED.headZ]}>
      {/* Bastidor, columnas elevadoras y ruedas */}
      <Box
        size={[BED.width - 0.1, 0.08, BED.length - 0.2]}
        position={[0, 0.2, BED.length / 2]}
        color={C.metal}
        metalness={0.5}
        roughness={0.35}
      />
      <Box size={[0.22, 0.24, 0.22]} position={[0, 0.32, 0.45]} color="#cbd5e1" roughness={0.4} />
      <Box
        size={[0.22, 0.24, 0.22]}
        position={[0, 0.32, BED.length - 0.45]}
        color="#cbd5e1"
        roughness={0.4}
      />
      {[
        [-halfW + 0.08, 0.15],
        [halfW - 0.08, 0.15],
        [-halfW + 0.08, BED.length - 0.15],
        [halfW - 0.08, BED.length - 0.15],
      ].map(([x, z]) => (
        <Caster key={`${x}-${z}`} position={[x ?? 0, 0, z ?? 0]} />
      ))}
      {/* Somier */}
      <Box
        size={[BED.width, 0.05, BED.length - 0.06]}
        position={[0, BED.deckY - 0.04, BED.length / 2]}
        color="#94a3b8"
        metalness={0.4}
        roughness={0.4}
      />

      {/* Cabecero y piecero de laminado claro */}
      <Box
        size={[BED.width + 0.08, 0.6, 0.05]}
        position={[0, 0.78, 0.02]}
        color="#f1f5f9"
        roughness={0.35}
      />
      <Box
        size={[BED.width + 0.08, 0.06, 0.07]}
        position={[0, 1.08, 0.02]}
        color={C.upholstery}
        roughness={0.5}
      />
      <Box
        size={[BED.width + 0.08, 0.5, 0.05]}
        position={[0, 0.72, BED.length + 0.01]}
        color="#f1f5f9"
        roughness={0.35}
      />
      <Box
        size={[BED.width + 0.08, 0.06, 0.07]}
        position={[0, 0.97, BED.length + 0.01]}
        color={C.upholstery}
        roughness={0.5}
      />
      {/* Mando del piecero */}
      <Box
        size={[0.36, 0.14, 0.02]}
        position={[0, 0.78, BED.length + 0.045]}
        color="#1e293b"
        roughness={0.3}
      />
      <Box
        size={[0.08, 0.04, 0.005]}
        position={[-0.1, 0.8, BED.length + 0.056]}
        color="#22d3ee"
        emissive="#22d3ee"
        emissiveIntensity={0.8}
      />

      {/* Tramo de piernas: colchón, sábana y manta */}
      <group position={[0, BED.deckY, hingeZ + legLen / 2]}>
        <Box
          size={[BED.width - 0.04, mattressH, legLen]}
          position={[0, mattressH / 2, 0]}
          color={C.mattress}
          roughness={0.6}
        />
        <Box
          size={[BED.width - 0.02, 0.012, legLen + 0.01]}
          position={[0, mattressH + 0.006, 0]}
          color={C.sheet}
          roughness={0.9}
        />
        {occupied && (
          <>
            {/* Piernas bajo la manta */}
            <Box
              size={[0.36, 0.13, legLen - 0.2]}
              position={[0, mattressH + 0.07, -0.05]}
              color={C.blanket}
              roughness={1}
            />
            <Box
              size={[0.18, 0.16, 0.12]}
              position={[0, mattressH + 0.09, legLen / 2 - 0.22]}
              color={C.blanket}
              roughness={1}
            />
          </>
        )}
        <Box
          size={[BED.width + 0.02, 0.04, legLen * 0.75]}
          position={[0, mattressH + (occupied ? 0.15 : 0.03), legLen * 0.1]}
          color={C.blanket}
          roughness={1}
        />
        {/* Faldón de la manta a los lados */}
        <Box
          size={[0.01, 0.2, legLen * 0.75]}
          position={[-halfW - 0.01, mattressH - 0.04, legLen * 0.1]}
          color={C.blanket}
          roughness={1}
        />
        <Box
          size={[0.01, 0.2, legLen * 0.75]}
          position={[halfW + 0.01, mattressH - 0.04, legLen * 0.1]}
          color={C.blanket}
          roughness={1}
        />
      </group>

      {/* Respaldo articulado: gira sobre la bisagra; las barandillas de cabecera van con él */}
      <group ref={back} position={[0, BED.deckY, hingeZ]}>
        <Box
          size={[BED.width - 0.04, mattressH, BACK_LEN]}
          position={[0, mattressH / 2, -BACK_LEN / 2]}
          color={C.mattress}
          roughness={0.6}
        />
        <Box
          size={[BED.width - 0.02, 0.012, BACK_LEN]}
          position={[0, mattressH + 0.006, -BACK_LEN / 2]}
          color={C.sheet}
          roughness={0.9}
        />
        {/* Almohada */}
        <mesh position={[0, mattressH + 0.07, -BACK_LEN + 0.17]} scale={[1, 0.38, 0.55]}>
          <sphereGeometry args={[0.3, 24, 16]} />
          <meshStandardMaterial color="#ffffff" roughness={1} />
        </mesh>
        {occupied && (
          <>
            {/* Torso con bata y brazos sobre la manta */}
            <Box
              size={[0.42, 0.16, 0.55]}
              position={[0, mattressH + 0.09, -0.3]}
              color={C.gown}
              roughness={0.9}
            />
            <Box
              size={[0.09, 0.08, 0.45]}
              position={[-0.27, mattressH + 0.08, -0.22]}
              color={C.gown}
              roughness={0.9}
            />
            <Box
              size={[0.09, 0.08, 0.45]}
              position={[0.27, mattressH + 0.08, -0.22]}
              color={C.gown}
              roughness={0.9}
            />
            {/* Cabeza y pelo */}
            <mesh position={[0, mattressH + 0.17, -BACK_LEN + 0.2]}>
              <sphereGeometry args={[0.115, 24, 20]} />
              <meshStandardMaterial color={C.skin} roughness={0.8} />
            </mesh>
            <mesh position={[0, mattressH + 0.15, -BACK_LEN + 0.15]} scale={[1, 0.9, 0.8]}>
              <sphereGeometry args={[0.12, 20, 16]} />
              <meshStandardMaterial color={C.hair} roughness={1} />
            </mesh>
          </>
        )}
        {/* Embozo de la sábana sobre el pecho */}
        <Box
          size={[BED.width + 0.02, 0.035, 0.22]}
          position={[0, mattressH + (occupied ? 0.17 : 0.03), -0.08]}
          color={C.sheet}
          roughness={1}
        />
        <SideRail x={-halfW - 0.02} length={BACK_LEN - 0.1} />
        <SideRail x={halfW + 0.02} length={BACK_LEN - 0.1} />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Monitor de constantes en brazo de pared                              */
/* ------------------------------------------------------------------ */

const ECG = (() => {
  const pts: number[] = [];
  for (let i = 0; i <= 120; i += 1) {
    const x = i / 120;
    const beat = (x * 3) % 1;
    let y = 0;
    if (beat > 0.3 && beat < 0.34) y = 0.25;
    else if (beat >= 0.34 && beat < 0.37) y = -0.9;
    else if (beat >= 0.37 && beat < 0.4) y = 1;
    else if (beat >= 0.4 && beat < 0.43) y = -0.3;
    else if (beat > 0.55 && beat < 0.65) y = 0.25 * Math.sin(((beat - 0.55) / 0.1) * Math.PI);
    pts.push(x, y, 0);
  }
  return new Float32Array(pts);
})();

const PLETH = (() => {
  const pts: number[] = [];
  for (let i = 0; i <= 120; i += 1) {
    const x = i / 120;
    const p = (x * 3) % 1;
    pts.push(x, Math.sin(p * Math.PI) ** 3 * 0.9 - 0.3 + 0.2 * Math.sin(p * Math.PI * 2), 0);
  }
  return new Float32Array(pts);
})();

function Trace({
  data,
  color,
  y,
  scaleY,
}: {
  data: Float32Array;
  color: string;
  y: number;
  scaleY: number;
}) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data, 3));
    const material = new THREE.LineBasicMaterial({ color, toneMapped: false });
    return new THREE.Line(geometry, material);
  }, [data, color]);
  return <primitive object={line} position={[-0.17, y, 0.002]} scale={[0.3, scaleY, 1]} />;
}

function PatientMonitor({ on, alarm }: { on: boolean; alarm: boolean }) {
  const sweep = useRef<THREE.Mesh>(null);
  const led = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const tt = clock.elapsedTime;
    if (sweep.current) sweep.current.position.x = -0.17 + ((tt * 0.12) % 1) * 0.3;
    if (led.current) {
      const blink = alarm ? Math.sin(tt * 10) > 0 : Math.sin(tt * 7.5) > 0.85;
      led.current.color.set(
        alarm ? (blink ? '#ef4444' : '#450a0a') : blink ? '#22c55e' : '#052e16',
      );
    }
  });

  return (
    <group position={[-2.3, 1.85, -D / 2 + 0.28]} rotation={[0, 0.5, 0]}>
      {/* Brazo de pared */}
      <Box size={[0.05, 0.05, 0.26]} position={[0, -0.05, -0.15]} color={C.metal} metalness={0.5} />
      {/* Carcasa */}
      <Box size={[0.46, 0.34, 0.07]} position={[0, 0, 0]} color="#e2e8f0" roughness={0.4} />
      <group position={[0, 0.01, 0.036]}>
        <mesh>
          <planeGeometry args={[0.4, 0.27]} />
          <meshBasicMaterial color={on ? '#020617' : '#0f172a'} toneMapped={false} />
        </mesh>
        {on && (
          <>
            <Trace data={ECG} color="#22c55e" y={0.07} scaleY={0.035} />
            <Trace data={PLETH} color="#22d3ee" y={0} scaleY={0.03} />
            <Trace data={PLETH} color="#facc15" y={-0.07} scaleY={0.02} />
            <mesh ref={sweep} position={[0, 0, 0.003]}>
              <planeGeometry args={[0.02, 0.24]} />
              <meshBasicMaterial color="#020617" toneMapped={false} />
            </mesh>
            {/* Columna de valores numéricos (bloques de color, sin tipografía) */}
            {[
              [0.07, '#22c55e'],
              [0.0, '#22d3ee'],
              [-0.07, '#facc15'],
            ].map(([y, color]) => (
              <mesh key={String(y)} position={[0.16, Number(y), 0.003]}>
                <planeGeometry args={[0.05, 0.035]} />
                <meshBasicMaterial
                  color={String(color)}
                  toneMapped={false}
                  transparent
                  opacity={0.85}
                />
              </mesh>
            ))}
          </>
        )}
      </group>
      <mesh position={[0.19, -0.15, 0.037]}>
        <circleGeometry args={[0.009, 12]} />
        <meshBasicMaterial ref={led} color="#052e16" toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Gotero, mesita, mesa de cama y sillón                                */
/* ------------------------------------------------------------------ */

function IvPole({ occupied }: { occupied: boolean }) {
  return (
    <group position={[-0.25, 0, -D / 2 + 0.55]}>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <group key={i} rotation={[0, a, 0]}>
            <Box
              size={[0.26, 0.02, 0.025]}
              position={[0.13, 0.07, 0]}
              color={C.metal}
              metalness={0.6}
              roughness={0.3}
            />
            <Cylinder radius={0.02} height={0.03} position={[0.25, 0.03, 0]} color="#1f2937" />
          </group>
        );
      })}
      <Cylinder
        radius={0.014}
        height={1.95}
        position={[0, 1.04, 0]}
        color="#cbd5e1"
        metalness={0.8}
        roughness={0.2}
      />
      <Box
        size={[0.3, 0.012, 0.012]}
        position={[0, 2.0, 0]}
        color="#cbd5e1"
        metalness={0.8}
        roughness={0.2}
      />
      {/* Bomba de infusión */}
      <Box size={[0.16, 0.2, 0.12]} position={[0, 1.15, 0.06]} color="#f1f5f9" roughness={0.4} />
      <Box
        size={[0.1, 0.06, 0.005]}
        position={[0, 1.19, 0.123]}
        color="#0f172a"
        emissive="#38bdf8"
        emissiveIntensity={occupied ? 0.6 : 0}
      />
      {occupied && (
        <>
          <mesh position={[0.12, 1.83, 0]}>
            <boxGeometry args={[0.11, 0.2, 0.035]} />
            <meshStandardMaterial color="#e0f2fe" transparent opacity={0.75} roughness={0.2} />
          </mesh>
          <Cylinder
            radius={0.004}
            height={0.6}
            position={[0.12, 1.43, 0]}
            color="#e2e8f0"
            metalness={0}
          />
        </>
      )}
    </group>
  );
}

function BedsideCabinet() {
  return (
    <group position={[-2.15, 0, -D / 2 + 0.4]}>
      <Box size={[0.5, 0.76, 0.46]} position={[0, 0.42, 0]} color={C.laminate} roughness={0.6} />
      <Box
        size={[0.52, 0.03, 0.48]}
        position={[0, 0.815, 0]}
        color={C.laminateEdge}
        roughness={0.5}
      />
      {/* Cajón y puerta */}
      <Box size={[0.46, 0.005, 0.005]} position={[0, 0.62, 0.232]} color={C.laminateEdge} />
      <Box size={[0.16, 0.02, 0.02]} position={[0, 0.7, 0.24]} color={C.metal} metalness={0.6} />
      <Box
        size={[0.02, 0.14, 0.02]}
        position={[0.18, 0.42, 0.24]}
        color={C.metal}
        metalness={0.6}
      />
      {/* Zócalo con ruedas */}
      <Box size={[0.44, 0.04, 0.4]} position={[0, 0.03, 0]} color="#475569" />
      {/* Vaso y jarra */}
      <Cylinder
        radius={0.035}
        height={0.1}
        position={[-0.15, 0.88, 0.1]}
        color="#e0f2fe"
        metalness={0}
        roughness={0.1}
      />
    </group>
  );
}

function OverbedTable() {
  return (
    <group position={[-0.45, 0, -0.9]}>
      {/* Base en H con ruedas, fuera de la cama */}
      <Box size={[0.06, 0.04, 0.5]} position={[0.32, 0.06, 0]} color={C.metal} metalness={0.5} />
      <Box size={[0.4, 0.04, 0.06]} position={[0.14, 0.06, 0]} color={C.metal} metalness={0.5} />
      <Cylinder radius={0.025} height={0.04} position={[0.32, 0.02, 0.22]} color="#1f2937" />
      <Cylinder radius={0.025} height={0.04} position={[0.32, 0.02, -0.22]} color="#1f2937" />
      {/* Columna y tablero en voladizo sobre la cama */}
      <Box
        size={[0.05, 0.9, 0.05]}
        position={[0.32, 0.5, 0]}
        color="#cbd5e1"
        metalness={0.5}
        roughness={0.3}
      />
      <Box
        size={[0.85, 0.03, 0.42]}
        position={[-0.05, 0.96, 0]}
        color={C.laminate}
        roughness={0.5}
      />
      <Box size={[0.86, 0.015, 0.43]} position={[-0.05, 0.94, 0]} color={C.laminateEdge} />
      {/* Bandeja y vaso */}
      <Box size={[0.32, 0.015, 0.24]} position={[-0.2, 0.983, 0]} color="#f1f5f9" />
      <Cylinder
        radius={0.03}
        height={0.09}
        position={[0.15, 1.02, 0.08]}
        color="#bae6fd"
        metalness={0}
        roughness={0.1}
      />
    </group>
  );
}

function Recliner() {
  return (
    <group position={[1.75, 0, -0.95]} rotation={[0, -0.75, 0]}>
      <Box size={[0.7, 0.14, 0.7]} position={[0, 0.42, 0]} color={C.upholstery} roughness={0.55} />
      <Box
        size={[0.7, 0.72, 0.16]}
        position={[0, 0.78, -0.33]}
        color={C.upholstery}
        roughness={0.55}
        rotation={[-0.15, 0, 0]}
      />
      <Box size={[0.1, 0.22, 0.66]} position={[-0.38, 0.56, 0]} color="#e2e8f0" roughness={0.4} />
      <Box size={[0.1, 0.22, 0.66]} position={[0.38, 0.56, 0]} color="#e2e8f0" roughness={0.4} />
      <Box
        size={[0.66, 0.3, 0.66]}
        position={[0, 0.2, 0]}
        color="#94a3b8"
        metalness={0.3}
        roughness={0.5}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Cortina de privacidad, lavabo, puerta del baño, TV y reloj           */
/* ------------------------------------------------------------------ */

function PrivacyCurtain() {
  const folds = 9;
  return (
    <group>
      {/* Tramo de riel sobre la cortina recogida (el resto va por el techo) */}
      <Box
        size={[0.03, 0.03, 0.5]}
        position={[0.2, H - 0.03, -D / 2 + 0.3]}
        color={C.metal}
        metalness={0.6}
      />
      {/* Cortina recogida junto a la pared */}
      {Array.from({ length: folds }, (_, i) => (
        <Box
          key={i}
          size={[0.05, 2.2, 0.06]}
          position={[
            0.2 + (i % 2 === 0 ? 0.025 : -0.025),
            H - 0.04 - 1.1,
            -D / 2 + 0.12 + i * 0.045,
          ]}
          color={i % 2 === 0 ? C.curtain : '#a5c6d8'}
          roughness={1}
        />
      ))}
    </group>
  );
}

function Washbasin() {
  return (
    <group position={[W / 2 - 0.02, 0, 1.75]} rotation={[0, -Math.PI / 2, 0]}>
      <Box size={[0.55, 0.16, 0.42]} position={[0, 0.82, 0.21]} color="#ffffff" roughness={0.2} />
      <Box size={[0.42, 0.04, 0.3]} position={[0, 0.89, 0.22]} color="#e2e8f0" roughness={0.2} />
      <Cylinder
        radius={0.015}
        height={0.2}
        position={[0, 0.98, 0.06]}
        color="#cbd5e1"
        metalness={0.9}
        roughness={0.15}
      />
      <Box
        size={[0.02, 0.02, 0.12]}
        position={[0, 1.07, 0.11]}
        color="#cbd5e1"
        metalness={0.9}
        roughness={0.15}
      />
      {/* Espejo */}
      <Box
        size={[0.5, 0.65, 0.015]}
        position={[0, 1.55, 0.01]}
        color="#dbe8ef"
        metalness={0}
        roughness={0.1}
      />
      {/* Dispensadores de gel, jabón y guantes; contenedor de punzantes */}
      <Box size={[0.1, 0.18, 0.08]} position={[0.42, 1.25, 0.04]} color="#f8fafc" />
      <Box size={[0.06, 0.03, 0.04]} position={[0.42, 1.14, 0.07]} color="#0ea5e9" />
      <Box size={[0.24, 0.12, 0.09]} position={[-0.45, 1.3, 0.045]} color="#dbeafe" />
      <Box size={[0.18, 0.22, 0.14]} position={[-0.45, 1.0, 0.07]} color="#facc15" />
      <Box size={[0.18, 0.04, 0.14]} position={[-0.45, 1.13, 0.07]} color="#dc2626" />
    </group>
  );
}

function BathroomDoor() {
  return (
    <group position={[-W / 2 + 0.01, 0, 1.25]} rotation={[0, Math.PI / 2, 0]}>
      <Box size={[1.0, 2.1, 0.04]} position={[0, 1.05, 0.02]} color="#b9c6cf" />
      <Box size={[0.9, 2.04, 0.03]} position={[0, 1.02, 0.045]} color="#d8c3a0" roughness={0.6} />
      <Box
        size={[0.14, 0.025, 0.04]}
        position={[0.32, 1.0, 0.08]}
        color={C.metal}
        metalness={0.8}
        roughness={0.2}
      />
      {/* Barra de apoyo y señal */}
      <Box size={[0.12, 0.12, 0.01]} position={[0, 1.65, 0.065]} color="#0f766e" />
    </group>
  );
}

function WallTv() {
  return (
    <group position={[W / 2 - 0.08, 1.85, -0.75]} rotation={[0, -Math.PI / 2 + 0.25, 0]}>
      <Box size={[0.08, 0.08, 0.12]} position={[0, 0, -0.08]} color={C.dark} />
      <Box size={[0.82, 0.48, 0.04]} position={[0, 0, 0]} color="#111827" roughness={0.3} />
      <mesh position={[0, 0, 0.021]}>
        <planeGeometry args={[0.78, 0.44]} />
        <meshStandardMaterial color="#0b1220" roughness={0.15} metalness={0.4} />
      </mesh>
    </group>
  );
}

function WallClock({ hour }: { hour: number }) {
  const h = hour % 12;
  const m = (hour % 1) * 60;
  const hourA = -(h / 12) * Math.PI * 2;
  const minA = -(m / 60) * Math.PI * 2;
  return (
    <group position={[0.55, 2.3, -D / 2 + 0.02]}>
      {/* Aro (cilindro tumbado hacia la habitación) y esfera */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.03, 40]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[0, 0, 0.016]}>
        <circleGeometry args={[0.145, 40]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Agujas: giran sobre el centro y apuntan hacia arriba a las 12 */}
      <group position={[0, 0, 0.02]} rotation={[0, 0, hourA]}>
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[0.012, 0.08, 0.004]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
      </group>
      <group position={[0, 0, 0.024]} rotation={[0, 0, minA]}>
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[0.008, 0.12, 0.004]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Actuadores del entorno: difusor, altavoz, clima y luz general        */
/* ------------------------------------------------------------------ */

const PARTICLES = 90;

function Diffuser({ on, pct, type }: { on: boolean; pct: number; type: AromaType }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(PARTICLES * 3);
    for (let i = 0; i < PARTICLES; i += 1) {
      arr[i * 3] = (Math.random() - 0.5) * 0.12;
      arr[i * 3 + 1] = Math.random() * 1.0;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
    }
    return arr;
  }, []);
  const color = AROMA_COLORS[type];
  const active = on && pct > 0;

  useFrame(({ clock }, delta) => {
    const p = points.current;
    if (!p || !active) return;
    const attr = p.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const speed = 0.2 + (pct / 100) * 0.5;
    for (let i = 0; i < PARTICLES; i += 1) {
      const y = (arr[i * 3 + 1] ?? 0) + delta * speed;
      if (y > 1.0) {
        arr[i * 3] = (Math.random() - 0.5) * 0.1;
        arr[i * 3 + 1] = 0;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
      } else {
        arr[i * 3 + 1] = y;
        arr[i * 3] = (arr[i * 3] ?? 0) + Math.sin(clock.elapsedTime * 1.3 + i) * 0.0015;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <group position={[-2.0, 0.83, -D / 2 + 0.32]}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.06, 0.075, 0.12, 24]} />
        <meshStandardMaterial
          color="#f1f5f9"
          emissive={active ? color : '#000000'}
          emissiveIntensity={active ? 0.6 : 0}
        />
      </mesh>
      <points ref={points} position={[0, 0.13, 0]} visible={active}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={color}
          size={0.035}
          transparent
          opacity={0.25 + (pct / 100) * 0.6}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

function Speaker({ pct, soundscape }: { pct: number; soundscape: Soundscape }) {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const active = pct > 0.5 && soundscape !== 'silencio';

  useFrame(({ clock }) => {
    const speed = SOUND_SPEED[soundscape];
    rings.current.forEach((mesh, i) => {
      if (!mesh) return;
      const phase = (clock.elapsedTime * speed + i / 3) % 1;
      const scale = 1 + phase * (1 + (pct / 100) * 2.5);
      mesh.scale.set(scale, scale, scale);
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = active ? (1 - phase) * 0.7 * (0.3 + pct / 100) : 0;
    });
  });

  return (
    <group position={[W / 2 - 0.02, 2.4, 0.4]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.04, 32]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[0, 0, 0.022]}>
        <circleGeometry args={[0.1, 32]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            rings.current[i] = el;
          }}
          position={[0, 0, 0.03]}
        >
          <ringGeometry args={[0.12, 0.135, 48]} />
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Rejilla lineal de climatización y termostato de pared, teñidos según la temperatura. */
function Climate({ tempC }: { tempC: number }) {
  const color = temperatureToHex(tempC);
  return (
    <group>
      <group position={[-W / 2 + 0.02, 2.5, -0.2]} rotation={[0, Math.PI / 2, 0]}>
        <Box size={[1.2, 0.16, 0.03]} position={[0, 0, 0]} color="#f8fafc" />
        {[-0.04, 0, 0.04].map((y) => (
          <Box
            key={y}
            size={[1.12, 0.018, 0.01]}
            position={[0, y, 0.02]}
            color={color}
            emissive={color}
            emissiveIntensity={0.9}
          />
        ))}
      </group>
      <group position={[-W / 2 + 0.02, 1.4, 0.45]} rotation={[0, Math.PI / 2, 0]}>
        <Box size={[0.12, 0.12, 0.025]} position={[0, 0, 0]} color="#f8fafc" />
        <Box
          size={[0.08, 0.05, 0.005]}
          position={[0, 0.015, 0.014]}
          color="#0f172a"
          emissive={color}
          emissiveIntensity={0.7}
        />
      </group>
    </group>
  );
}

/** Luminaria empotrada en el techo (solo visible desde abajo) y su luz. */
function CeilingLight({ lightPct, kelvin }: { lightPct: number; kelvin: number }) {
  const color = kelvinToHex(kelvin);
  const k = lightPct / 100;
  return (
    <group position={[-0.3, H - 0.005, -0.4]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.6, 0.6]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive={color}
          emissiveIntensity={0.2 + k * 2}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        position={[0, -0.3, 0]}
        color={color}
        intensity={k * 8}
        distance={0}
        decay={1.4}
      />
    </group>
  );
}

export interface Room3DProps {
  values: EnvValues;
  hour: number;
  occupied: boolean;
  /** Ángulo actual del respaldo de la cama (grados). */
  bedDeg: number;
  /** Alarma clínica activa: el monitor parpadea en rojo. */
  alarm?: boolean;
}

export default function Room3D({ values, hour, occupied, bedDeg, alarm = false }: Room3DProps) {
  const sun = daylight(hour) * (values.blindsPct / 100);
  return (
    <Canvas camera={{ position: [2.3, 3.2, 4.9], fov: 50 }} dpr={[1, 2]}>
      <color attach="background" args={['#0f172a']} />
      <hemisphereLight args={['#f8fafc', '#64748b', 0.25 + sun * 0.35]} />
      <ambientLight intensity={0.12 + sun * 0.2} />
      <directionalLight position={[WIN.x, 2.4, -6]} intensity={sun * 1.6} color="#fff4e0" />
      <Floor />
      <Wall {...BACK_WALL} rotationY={0} width={W}>
        {/* Paño de color tras la cama */}
        <Box
          size={[2.3, H - 0.1, 0.01]}
          position={[-0.95, H / 2, -D / 2 + 0.006]}
          color={C.accent}
          roughness={0.95}
        />
        <HospitalWindow hour={hour} blindsPct={values.blindsPct} />
        <Headwall lightPct={values.lightPct} kelvin={values.kelvin} />
        <PatientMonitor on={occupied} alarm={alarm} />
        <PrivacyCurtain />
        <WallClock hour={hour} />
      </Wall>
      <Wall {...LEFT_WALL} rotationY={Math.PI / 2} width={D}>
        <Box
          size={[0.04, 0.12, 1.4]}
          position={[-W / 2 + 0.03, 0.9, -0.3]}
          color={C.rail}
          roughness={0.5}
        />
        <BathroomDoor />
        <Climate tempC={values.tempC} />
      </Wall>
      <Wall {...RIGHT_WALL} rotationY={-Math.PI / 2} width={D}>
        <Box
          size={[0.04, 0.12, 1.6]}
          position={[W / 2 - 0.03, 0.9, 0.5]}
          color={C.rail}
          roughness={0.5}
        />
        <Washbasin />
        <WallTv />
        <Speaker pct={values.soundPct} soundscape={values.soundscape} />
      </Wall>
      <Wall {...FRONT_WALL} rotationY={Math.PI} width={W}>
        <EntranceDoor />
      </Wall>
      <HospitalBed occupied={occupied} bedDeg={bedDeg} />
      <IvPole occupied={occupied} />
      <BedsideCabinet />
      <OverbedTable />
      <Recliner />
      <Diffuser on={values.aromaOn} pct={values.aromaPct} type={values.aromaType} />
      <CeilingLight lightPct={values.lightPct} kelvin={values.kelvin} />
      <OrbitControls
        target={[-0.2, 0.9, -0.9]}
        enablePan={false}
        minDistance={2.5}
        maxDistance={9}
        maxPolarAngle={Math.PI / 2.1}
      />
    </Canvas>
  );
}
