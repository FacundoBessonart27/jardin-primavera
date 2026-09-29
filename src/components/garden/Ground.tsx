"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { heightAt } from "@/lib/terrain";
import {
  BOUNDARY,
  PLAZA,
  SAKURA_TREES,
  SHRINE,
  bedMask,
  boundaryRadius,
  pondRadius,
  queryPaths,
  streamDistance,
} from "@/lib/gardenPlan";
import { createGrassDetailTexture } from "@/lib/gardenTextures";

interface GroundProps {
  shadows: boolean;
}

/** Anillos cada 0.7 m hasta cubrir todo el jardín; más afuera, cada vez
 * más espaciados (las colinas lejanas no necesitan tanto detalle). */
function ringRadii(): number[] {
  const radii: number[] = [];
  let r = 0.7;
  while (r < 44) {
    radii.push(r);
    r += 0.7;
  }
  while (r < 165) {
    radii.push(r);
    r *= 1.11;
  }
  radii.push(170);
  return radii;
}
const SEGMENTS = 240;

// Ruido de color propio y liviano, sólo para pintar el pasto.
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

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const LUSH = new THREE.Color("#3b7644");
const DRY = new THREE.Color("#6f8c42");
const DEEP = new THREE.Color("#245738");
const HILL = new THREE.Color("#35603c");
const HILL_TOP = new THREE.Color("#5f7f45");
const WORN = new THREE.Color("#8d8a58");
const SOIL = new THREE.Color("#4b3527");
const DAMP = new THREE.Color("#344a2b");
const STONE_DUST = new THREE.Color("#8a7f6e");

const _c = new THREE.Color();

/** Color del suelo en (x, z): césped con manchas, pasto gastado junto a
 * los caminos, tierra de cantero, orillas húmedas, sombra bajo los
 * árboles y colinas más oscuras afuera del jardín. */
function groundColor(x: number, z: number, h: number, out: THREE.Color): THREE.Color {
  const n1 = tintNoise(x * 0.11, z * 0.11);
  const n2 = tintNoise(x * 0.37 + 12, z * 0.37 + 5);
  const patch = n1 * 0.7 + n2 * 0.3;
  out.copy(LUSH);
  if (patch > 0.56) out.lerp(DRY, (patch - 0.56) * 1.1);
  else if (patch < 0.42) out.lerp(DEEP, (0.42 - patch) * 1.4);

  const e = boundaryRadius(x, z);
  if (e > 0.95) {
    // Colinas: verde más profundo en los valles, más claro en las lomas.
    const hill = smoothstep(0.95, 1.5, e);
    _c.copy(HILL).lerp(HILL_TOP, smoothstep(1, 9, h) * 0.8);
    out.lerp(_c, hill);
    return out;
  }

  const path = queryPaths(x, z);
  if (path.edge < 0.9) out.lerp(WORN, (1 - smoothstep(-0.1, 0.9, path.edge)) * 0.55);

  const bed = bedMask(x, z);
  if (bed > 0) out.lerp(SOIL, bed * 0.72);

  const shore = Math.min(
    smoothstep(2.6, 1.2, streamDistance(x, z)),
    1
  );
  const pond = smoothstep(1.8, 1.1, pondRadius(x, z));
  const wet = Math.max(shore, pond);
  if (wet > 0) out.lerp(DAMP, wet * 0.7);

  const plaza = Math.hypot(x - PLAZA.x, z - PLAZA.z);
  const shrineEdge = Math.max(
    Math.abs(x - SHRINE.x) - SHRINE.plinthW / 2,
    Math.abs(z - SHRINE.z) - SHRINE.plinthD / 2
  );
  const dust = Math.max(smoothstep(6.4, 4.4, plaza), smoothstep(1.6, 0, shrineEdge));
  if (dust > 0) out.lerp(STONE_DUST, dust * 0.6);

  // Sombra suave (oclusión) bajo cada copa de sakura.
  let shade = 0;
  for (const t of SAKURA_TREES) {
    const dx = x - t.x;
    const dz = z - t.z;
    const r = 2.4 * t.scale;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) shade = Math.max(shade, 1 - Math.sqrt(d2) / r);
  }
  if (shade > 0) out.multiplyScalar(1 - shade * 0.28);
  return out;
}

/** Terreno: un disco grande con el relieve de lib/terrain (el valle
 * del jardín y las colinas que lo rodean), coloreado por vértice y con
 * una textura de detalle que se repite. */
function buildGroundGeometry(): THREE.BufferGeometry {
  const radii = ringRadii();
  const cx = BOUNDARY.cx;
  const cz = BOUNDARY.cz;
  const vertexCount = 1 + radii.length * SEGMENTS;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];
  const color = new THREE.Color();

  const setVertex = (i: number, x: number, z: number) => {
    const y = heightAt(x, z);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    groundColor(x, z, y, color);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    uvs[i * 2] = x / 2.4;
    uvs[i * 2 + 1] = z / 2.4;
  };

  setVertex(0, cx, cz);
  radii.forEach((r, ring) => {
    for (let seg = 0; seg < SEGMENTS; seg++) {
      const theta = (seg / SEGMENTS) * Math.PI * 2;
      setVertex(1 + ring * SEGMENTS + seg, cx + Math.cos(theta) * r, cz + Math.sin(theta) * r);
    }
  });

  for (let seg = 0; seg < SEGMENTS; seg++) {
    indices.push(0, 1 + ((seg + 1) % SEGMENTS), 1 + seg);
  }
  for (let ring = 1; ring < radii.length; ring++) {
    const startA = 1 + (ring - 1) * SEGMENTS;
    const startB = 1 + ring * SEGMENTS;
    for (let seg = 0; seg < SEGMENTS; seg++) {
      const a = startA + seg;
      const b = startA + ((seg + 1) % SEGMENTS);
      const c = startB + seg;
      const d = startB + ((seg + 1) % SEGMENTS);
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function Ground({ shadows }: GroundProps) {
  const geometry = useMemo(() => buildGroundGeometry(), []);
  const material = useMemo(
    () =>
      // Lambert: el suelo ocupa media pantalla y no necesita reflejos;
      // es bastante más barato por píxel que un material físico.
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        map: createGrassDetailTexture(),
      }),
    []
  );

  return <mesh geometry={geometry} material={material} receiveShadow={shadows} />;
}
