"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createCloudTexture } from "@/lib/proceduralTextures";
import { createSeededRandom } from "@/lib/random";

interface CloudData {
  position: [number, number, number];
  scale: number;
  speed: number;
  opacity: number;
}

/** Nubes suaves y lentas, hechas con sprites de textura procedural. */
export function Clouds({ count = 7 }: { count?: number }) {
  const texture = useMemo(() => createCloudTexture(), []);
  const groupRef = useRef<THREE.Group>(null);

  const clouds = useMemo<CloudData[]>(() => {
    const random = createSeededRandom(4242);
    return Array.from({ length: count }, () => ({
      position: [
        (random() - 0.5) * 60,
        10 + random() * 8,
        -20 - random() * 30,
      ] as [number, number, number],
      scale: 8 + random() * 10,
      speed: 0.15 + random() * 0.25,
      opacity: 0.35 + random() * 0.3,
    }));
  }, [count]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.children.forEach((child, i) => {
      child.position.x += clouds[i].speed * delta;
      if (child.position.x > 45) child.position.x = -45;
    });
  });

  return (
    <group ref={groupRef}>
      {clouds.map((cloud, i) => (
        <sprite key={i} position={cloud.position} scale={cloud.scale}>
          <spriteMaterial
            map={texture}
            transparent
            opacity={cloud.opacity}
            depthWrite={false}
            fog={false}
          />
        </sprite>
      ))}
    </group>
  );
}
