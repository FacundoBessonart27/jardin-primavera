"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createSeededRandom } from "@/lib/random";
import { createWingTexture } from "@/lib/proceduralTextures";

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
    return Array.from({ length: count }, () => ({
      color: BUTTERFLY_COLORS[Math.floor(random() * BUTTERFLY_COLORS.length)],
      radiusX: 2 + random() * 3,
      radiusZ: 2 + random() * 3,
      centerX: (random() - 0.5) * 12,
      centerZ: -2 - random() * 8,
      baseY: 1.1 + random() * 1.2,
      speed: 0.25 + random() * 0.2,
      phase: random() * Math.PI * 2,
    }));
  }, [count]);

  return (
    <>
      {list.map((params, i) => (
        <Butterfly key={i} params={params} />
      ))}
    </>
  );
}
