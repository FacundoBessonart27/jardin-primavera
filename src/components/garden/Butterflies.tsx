"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createSeededRandom } from "@/lib/random";
import { createWingTexture } from "@/lib/proceduralTextures";
import { FLOWER_BEDS } from "@/lib/gardenPlan";

interface ButterflyParams {
  color: string;
  radiusX: number;
  radiusZ: number;
  centerX: number;
  centerZ: number;
  baseY: number;
  speed: number;
  phase: number;
}

const BUTTERFLY_COLORS = ["#ffd166", "#f0468a", "#ffffff", "#b399ff"];

function Butterfly({ params }: { params: ButterflyParams }) {
  const groupRef = useRef<THREE.Group>(null);
  const wingLRef = useRef<THREE.Mesh>(null);
  const wingRRef = useRef<THREE.Mesh>(null);
  const texture = useMemo(
    () => createWingTexture(128, params.color),
    [params.color]
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * params.speed + params.phase;
    const x = params.centerX + Math.cos(t) * params.radiusX;
    const z = params.centerZ + Math.sin(t * 1.3) * params.radiusZ;
    const y = params.baseY + Math.sin(t * 2.1) * 0.3;

    if (groupRef.current) {
      groupRef.current.position.set(x, y, z);
      const nextX = params.centerX + Math.cos(t + 0.05) * params.radiusX;
      const nextZ = params.centerZ + Math.sin((t + 0.05) * 1.3) * params.radiusZ;
      groupRef.current.lookAt(nextX, y, nextZ);
    }

    const flap = Math.sin(t * 22) * 0.9;
    if (wingLRef.current) wingLRef.current.rotation.y = flap;
    if (wingRRef.current) wingRRef.current.rotation.y = -flap;
  });

  return (
    <group ref={groupRef} scale={0.26}>
      <mesh ref={wingLRef} position={[0.01, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial
          map={texture}
          alphaMap={texture}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          emissive={params.color}
          emissiveIntensity={0.12}
        />
      </mesh>
      <mesh ref={wingRRef} position={[-0.01, 0, 0]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial
          map={texture}
          alphaMap={texture}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          emissive={params.color}
          emissiveIntensity={0.12}
        />
      </mesh>
    </group>
  );
}

export function Butterflies({ count }: { count: number }) {
  const list = useMemo<ButterflyParams[]>(() => {
    const random = createSeededRandom(3131);
    // Cada mariposa revolotea sobre un cantero, repartidas a lo largo del
    // recorrido (las primeras, cerca de la entrada).
    const step = FLOWER_BEDS.length / Math.max(1, count);
    return Array.from({ length: count }, (_, i) => {
      const bed = FLOWER_BEDS[Math.min(FLOWER_BEDS.length - 1, Math.floor(i * step))];
      return {
        color: BUTTERFLY_COLORS[Math.floor(random() * BUTTERFLY_COLORS.length)],
        radiusX: bed.rx * (0.6 + random() * 0.5),
        radiusZ: bed.rz * (0.6 + random() * 0.5),
        centerX: bed.x,
        centerZ: bed.z,
        baseY: 1.1 + random() * 1.1,
        speed: 0.25 + random() * 0.2,
        phase: random() * Math.PI * 2,
      };
    });
  }, [count]);

  return (
    <>
      {list.map((params, i) => (
        <Butterfly key={i} params={params} />
      ))}
    </>
  );
}
