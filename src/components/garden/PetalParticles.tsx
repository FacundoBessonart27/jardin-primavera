"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createPetalTexture } from "@/lib/proceduralTextures";
import { createSeededRandom } from "@/lib/random";
import { sceneUniforms } from "@/lib/sceneUniforms";

interface PetalParticlesProps {
  count: number;
}

const PETAL_COLORS = ["#ffd6e8", "#ffe9b8", "#ffffff", "#ffb3c6"];

/** Pétalos flotando lentamente en el aire, cayendo y meciéndose. */
export function PetalParticles({ count }: PetalParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const texture = useMemo(() => createPetalTexture(96, "#ffffff"), []);

  const { positions, seeds, colors } = useMemo(() => {
    const random = createSeededRandom(7777);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (random() - 0.5) * 34;
      positions[i * 3 + 1] = random() * 14;
      positions[i * 3 + 2] = (random() - 0.5) * 34 - 4;

      seeds[i * 3] = random() * Math.PI * 2; // fase de caída
      seeds[i * 3 + 1] = 0.25 + random() * 0.4; // velocidad de caída
      seeds[i * 3 + 2] = 0.5 + random() * 1.2; // amplitud de vaivén

      const c = new THREE.Color(
        PETAL_COLORS[Math.floor(random() * PETAL_COLORS.length)]
      );
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    return { positions, seeds, colors };
  }, [count]);

  useFrame((_, delta) => {
    const points = pointsRef.current;
    if (!points) return;
    const posAttr = points.geometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;

    for (let i = 0; i < count; i++) {
      const fallSpeed = seeds[i * 3 + 1];
      const swayAmp = seeds[i * 3 + 2];
      const phase = seeds[i * 3] + sceneUniforms.windTime * 0.6;

      let y = posAttr.getY(i) - fallSpeed * delta;
      if (y < -0.5) y = 13 + Math.random() * 2;

      const baseX = ((i * 37) % 34) - 17;
      const sway = Math.sin(phase) * swayAmp * 0.15;

      posAttr.setY(i, y);
      posAttr.setX(i, posAttr.getX(i) + sway * delta);
      if (Math.abs(posAttr.getX(i) - baseX) > 6) posAttr.setX(i, baseX);
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.22}
        map={texture}
        transparent
        opacity={0.85}
        vertexColors
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
