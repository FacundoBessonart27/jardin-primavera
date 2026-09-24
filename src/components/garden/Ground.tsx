"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { heightAt, GARDEN_CENTER_Z } from "@/lib/terrain";

interface GroundProps {
  shadows: boolean;
}

const RINGS = 26;
const SEGMENTS = 72;
const RADIUS = 26;

// Ruido de color propio y liviano, sólo para pintar el pasto (no toca
// terrain.heightAt, que usa la cámara en primera persona, para no
// arriesgar nada del movimiento existente).
function tintHash(x: number, y: number): number {
  const s = Math.sin(x * 91.7 + y * 53.3) * 24634.6345;
  return s - Math.floor(s);
}
function tintNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sxf = xf * xf * (3 - 2 * xf);
  const syf = yf * yf * (3 - 2 * yf);
  const a = tintHash(xi, yi);
  const b = tintHash(xi + 1, yi);
  const c = tintHash(xi, yi + 1);
  const d = tintHash(xi + 1, yi + 1);
  const top = a + (b - a) * sxf;
  const bottom = c + (d - c) * sxf;
  return top + (bottom - top) * syf;
}

/** Terreno del jardín: un disco con relieve sutil (ver lib/terrain) en
 * vez de un plano perfectamente chato, con un degradé radial y manchas
 * suaves de distintos verdes (ni uniforme ni con patrón evidente),
 * para que los bordes se fundan con la niebla. */
function buildGroundGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const inner = new THREE.Color("#2c6b47");
  const outer = new THREE.Color("#16351f");
  const dryPatch = new THREE.Color("#4a7a3c");
  const lushPatch = new THREE.Color("#1f5236");

  const tintAt = (x: number, z: number, base: THREE.Color) => {
    const n1 = tintNoise(x * 0.11, z * 0.11);
    const n2 = tintNoise(x * 0.37 + 12, z * 0.37 + 5);
    const patch = n1 * 0.7 + n2 * 0.3;
    const c = base.clone();
    if (patch > 0.58) return c.lerp(dryPatch, (patch - 0.58) * 0.5);
    if (patch < 0.4) return c.lerp(lushPatch, (0.4 - patch) * 0.55);
    return c;
  };

  positions.push(0, heightAt(0, GARDEN_CENTER_Z), GARDEN_CENTER_Z);
  const centerColor = tintAt(0, GARDEN_CENTER_Z, inner);
  colors.push(centerColor.r, centerColor.g, centerColor.b);

  for (let ring = 1; ring <= RINGS; ring++) {
    const r = (ring / RINGS) * RADIUS;
    for (let seg = 0; seg < SEGMENTS; seg++) {
      const theta = (seg / SEGMENTS) * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = GARDEN_CENTER_Z + Math.sin(theta) * r;
      positions.push(x, heightAt(x, z), z);
      const radial = inner.clone().lerp(outer, Math.min(1, r / 22));
      const c = tintAt(x, z, radial);
      colors.push(c.r, c.g, c.b);
    }
  }

  for (let seg = 0; seg < SEGMENTS; seg++) {
    indices.push(0, 1 + seg, 1 + ((seg + 1) % SEGMENTS));
  }
  for (let ring = 1; ring < RINGS; ring++) {
    const startA = 1 + (ring - 1) * SEGMENTS;
    const startB = 1 + ring * SEGMENTS;
    for (let seg = 0; seg < SEGMENTS; seg++) {
      const a = startA + seg;
      const b = startA + ((seg + 1) % SEGMENTS);
      const c = startB + seg;
      const d = startB + ((seg + 1) % SEGMENTS);
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function Ground({ shadows }: GroundProps) {
  const geometry = useMemo(() => buildGroundGeometry(), []);

  return (
    <mesh geometry={geometry} receiveShadow={shadows}>
      <meshStandardMaterial
        vertexColors
        roughness={1}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
