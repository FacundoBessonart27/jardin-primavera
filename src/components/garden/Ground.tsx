"use client";

import { useMemo } from "react";
import * as THREE from "three";

interface GroundProps {
  shadows: boolean;
}

/** Terreno del jardín: un disco verde con un leve degradé radial
 * horneado por vértice, para que los bordes se funden con la niebla. */
export function Ground({ shadows }: GroundProps) {
  const geometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(26, 64);
    const positions = geo.getAttribute("position");
    const colors = new Float32Array(positions.count * 3);
    const inner = new THREE.Color("#2c6b47");
    const outer = new THREE.Color("#16351f");

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const dist = Math.min(1, Math.hypot(x, y) / 22);
      const c = inner.clone().lerp(outer, dist);
      colors.set([c.r, c.g, c.b], i * 3);
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow={shadows} position={[0, 0, -3]}>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  );
}
