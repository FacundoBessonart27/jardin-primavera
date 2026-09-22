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

/** Terreno del jardín: un disco con relieve sutil (ver lib/terrain) en
 * vez de un plano perfectamente chato, con un degradé radial horneado
 * por vértice para que los bordes se fundan con la niebla. */
function buildGroundGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const inner = new THREE.Color("#2c6b47");
  const outer = new THREE.Color("#16351f");

  positions.push(0, heightAt(0, GARDEN_CENTER_Z), GARDEN_CENTER_Z);
  colors.push(inner.r, inner.g, inner.b);

  for (let ring = 1; ring <= RINGS; ring++) {
    const r = (ring / RINGS) * RADIUS;
    for (let seg = 0; seg < SEGMENTS; seg++) {
      const theta = (seg / SEGMENTS) * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = GARDEN_CENTER_Z + Math.sin(theta) * r;
      positions.push(x, heightAt(x, z), z);
      const c = inner.clone().lerp(outer, Math.min(1, r / 22));
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
