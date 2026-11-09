import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { daylight, kelvinToHex, skyColor, temperatureToHex } from '../../core/color';
import type { AromaType, EnvValues, Soundscape } from '../../core/types';

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

const WALL = '#e7e5e4';

function Shell() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 5]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      <mesh position={[0, 1.4, -2.5]}>
        <planeGeometry args={[6, 2.8]} />
        <meshStandardMaterial color={WALL} />
      </mesh>
      <mesh position={[-3, 1.4, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[5, 2.8]} />
        <meshStandardMaterial color={WALL} />
      </mesh>
      <mesh position={[3, 1.4, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[5, 2.8]} />
        <meshStandardMaterial color={WALL} />
      </mesh>
      {/* Puerta del baño */}
      <mesh position={[-2.99, 1, 1.3]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.9, 2]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      <mesh position={[-2.97, 1, 1.0]}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshStandardMaterial color="#64748b" metalness={0.6} />
      </mesh>
    </group>
  );
}

function WindowPane({ hour }: { hour: number }) {
  const sky = skyColor(hour);
  return (
    <group position={[1.4, 1.6, -2.49]}>
      <mesh>
        <planeGeometry args={[1.6, 1.1]} />
        <meshBasicMaterial color={sky} toneMapped={false} />
      </mesh>
      {[
        [0, 0.58, 1.72, 0.06],
        [0, -0.58, 1.72, 0.06],
        [-0.83, 0, 0.06, 1.2],
        [0.83, 0, 0.06, 1.2],
        [0, 0, 0.04, 1.1],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x ?? 0, y ?? 0, 0.01]}>
          <planeGeometry args={[w ?? 0, h ?? 0]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      ))}
    </group>
  );
}

function Bed({ occupied }: { occupied: boolean }) {
  return (
    <group position={[-0.8, 0, -1.4]}>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[1.05, 0.36, 2.1]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.98, 0.16, 2.0]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[0, 0.82, -1.05]}>
        <boxGeometry args={[1.05, 0.7, 0.06]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[0, 0.69, -0.78]}>
        <boxGeometry args={[0.62, 0.12, 0.34]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      {occupied && (
        <>
          <mesh position={[0, 0.83, -0.78]}>
            <sphereGeometry args={[0.13, 24, 24]} />
            <meshStandardMaterial color="#e0b49a" />
          </mesh>
          <mesh position={[0, 0.72, 0.1]}>
            <boxGeometry args={[0.46, 0.14, 1.1]} />
            <meshStandardMaterial color="#93c5fd" />
          </mesh>
        </>
      )}
      <mesh position={[0, 0.66, 0.25]}>
        <boxGeometry args={[1.0, 0.06, 1.35]} />
        <meshStandardMaterial color="#93c5fd" />
      </mesh>
    </group>
  );
}

function Chair() {
  return (
    <group position={[1.9, 0, 0.5]} rotation={[0, -0.6, 0]}>
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[0.75, 0.44, 0.75]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[0, 0.7, 0.32]}>
        <boxGeometry args={[0.75, 0.6, 0.14]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[0, 0.46, -0.02]}>
        <boxGeometry args={[0.62, 0.08, 0.62]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
    </group>
  );
}

const PARTICLES = 90;

function Diffuser({ on, pct, type }: { on: boolean; pct: number; type: AromaType }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(PARTICLES * 3);
    for (let i = 0; i < PARTICLES; i += 1) {
      arr[i * 3] = (Math.random() - 0.5) * 0.12;
      arr[i * 3 + 1] = Math.random() * 1.2;
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
      if (y > 1.25) {
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
    <group position={[0.45, 0, -2.15]}>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.55, 0.6, 0.45]} />
        <meshStandardMaterial color="#d6b88f" />
      </mesh>
      <mesh position={[0, 0.68, 0]}>
        <cylinderGeometry args={[0.07, 0.09, 0.16, 24]} />
        <meshStandardMaterial
          color="#f1f5f9"
          emissive={active ? color : '#000000'}
          emissiveIntensity={active ? 0.5 : 0}
        />
      </mesh>
      <points ref={points} position={[0, 0.78, 0]} visible={active}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={color}
          size={0.04}
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
    <group position={[2.93, 1.9, -0.6]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh>
        <boxGeometry args={[0.36, 0.5, 0.12]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0, -0.08, 0.065]}>
        <circleGeometry args={[0.11, 32]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            rings.current[i] = el;
          }}
          position={[0, -0.08, 0.08]}
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

function Vent({ tempC }: { tempC: number }) {
  const color = temperatureToHex(tempC);
  return (
    <group position={[-2.95, 2.35, -0.4]} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <boxGeometry args={[0.9, 0.3, 0.06]} />
        <meshStandardMaterial color="#334155" emissive={color} emissiveIntensity={0.25} />
      </mesh>
      {[-0.09, -0.03, 0.03, 0.09].map((y) => (
        <mesh key={y} position={[0, y, 0.04]}>
          <boxGeometry args={[0.82, 0.025, 0.02]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.9}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function CeilingLamp({ lightPct, kelvin }: { lightPct: number; kelvin: number }) {
  const color = kelvinToHex(kelvin);
  const k = lightPct / 100;
  return (
    <group position={[-0.4, 2.72, -0.6]}>
      <mesh>
        <cylinderGeometry args={[0.38, 0.42, 0.08, 40]} />
        <meshStandardMaterial
          color="#f8fafc"
          emissive={color}
          emissiveIntensity={0.15 + k * 2}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        position={[0, -0.2, 0]}
        color={color}
        intensity={k * 9}
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
}

export default function Room3D({ values, hour, occupied }: Room3DProps) {
  const sun = daylight(hour);
  return (
    <Canvas camera={{ position: [3.6, 3.1, 4.6], fov: 50 }} dpr={[1, 2]}>
      <color attach="background" args={['#0f172a']} />
      <ambientLight intensity={0.28 + sun * 0.35} />
      <directionalLight position={[1.4, 2.4, -4]} intensity={sun * 1.4} color="#fff7e6" />
      <Shell />
      <WindowPane hour={hour} />
      <Bed occupied={occupied} />
      <Chair />
      <Diffuser on={values.aromaOn} pct={values.aromaPct} type={values.aromaType} />
      <Speaker pct={values.soundPct} soundscape={values.soundscape} />
      <Vent tempC={values.tempC} />
      <CeilingLamp lightPct={values.lightPct} kelvin={values.kelvin} />
      <OrbitControls
        target={[0, 0.9, -0.8]}
        enablePan={false}
        minDistance={2.5}
        maxDistance={9}
        maxPolarAngle={Math.PI / 2.1}
      />
    </Canvas>
  );
}
