"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { heightAt, PLAZA_LEVEL } from "@/lib/terrain";
import { PATHS, PLAZA, samplePath, streamDistance, type GardenPath } from "@/lib/gardenPlan";
import { createPathTexture, createPlazaTexture } from "@/lib/gardenTextures";
import { createSeededRandom } from "@/lib/random";

/** Cuánto sobresale la cinta del camino por encima del terreno. */
const LIFT = 0.03;

function noise1(x: number): number {
  return Math.sin(x * 1.7) * 0.5 + Math.sin(x * 0.63 + 1.3) * 0.35 + Math.sin(x * 3.1 + 0.4) * 0.15;
}

/**
 * Cinta de camino apoyada sobre el relieve: cinco vértices a lo ancho
 * (para seguir la curvatura del terreno) con bordes que se funden en el
 * césped mediante alfa por vértice, y un ancho que respira apenas a lo
 * largo del recorrido para que no parezca trazado con regla.
 * Se corta donde cruza el arroyo (ahí va el puente).
 */
function buildRibbon(path: GardenPath): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const across = [-1, -0.62, 0, 0.62, 1];
  const alpha = [0, 1, 1, 1, 0];
  let prevRow = -1;
  const step = 0.4;

  for (let s = 0; s <= path.length + 0.001; s += step) {
    const p = samplePath(path, s);
    const nx = -p.tz;
    const nz = p.tx;
    const wobble = 1 + 0.12 * noise1(s * 0.35 + path.halfWidth * 10);
    const outer = path.halfWidth * wobble + 0.38;
    const inner = path.halfWidth * wobble - 0.12;
    const underBridge = streamDistance(p.x, p.z) < 2.0;
    if (underBridge) {
      prevRow = -1;
      continue;
    }
    // Los extremos se desvanecen (los secundarios se funden con el
    // principal donde se unen).
    const endFade = Math.min(1, s / 1.2, (path.length - s) / 1.2);
    const row = positions.length / 3;
    across.forEach((k, j) => {
      const offset = Math.abs(k) === 1 ? outer * Math.sign(k) : inner * k;
      const x = p.x + nx * offset;
      const z = p.z + nz * offset;
      positions.push(x, heightAt(x, z) + LIFT, z);
      colors.push(1, 1, 1, alpha[j] * Math.max(0, endFade));
      uvs.push((offset / 1.4) * 0.5 + 0.5, s / 2.8);
    });
    if (prevRow >= 0) {
      for (let j = 0; j < across.length - 1; j++) {
        const a = prevRow + j;
        const b = prevRow + j + 1;
        const c = row + j;
        const d = row + j + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
    prevRow = row;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makePathMaterial(kind: "earth" | "gravel"): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    map: createPathTexture(kind),
    color: kind === "earth" ? "#e6d2bd" : "#ece2d4",
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/** Piedra chata e irregular (laja) para pasaderas y bordes. */
function buildFlatStoneGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.5, 0.56, 0.12, 9, 1);
  const pos = geo.getAttribute("position");
  const random = createSeededRandom(6161);
  const jitter = Array.from({ length: 9 }, () => 0.82 + random() * 0.3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = jitter[Math.round(((a + Math.PI) / (Math.PI * 2)) * 9) % 9];
    pos.setXYZ(i, x * k, pos.getY(i) + (pos.getY(i) > 0 ? Math.sin(x * 7 + z * 5) * 0.012 : 0), z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

interface StonePlacement {
  x: number;
  z: number;
  yaw: number;
  sx: number;
  sz: number;
  tone: number;
}

function stonePlacements(): StonePlacement[] {
  const random = createSeededRandom(3131);
  const list: StonePlacement[] = [];
  for (const path of PATHS) {
    if (path.kind === "main") {
      // Pasaderas (tobi-ishi) alternadas por el centro del camino.
      let side = 1;
      for (let s = 1.2; s < path.length - 0.8; s += 0.95 + random() * 0.25) {
        const p = samplePath(path, s);
        if (streamDistance(p.x, p.z) < 2.2) continue;
        const off = side * (0.18 + random() * 0.14);
        side = -side;
        list.push({
          x: p.x - p.tz * off,
          z: p.z + p.tx * off,
          yaw: Math.atan2(p.tx, p.tz) + (random() - 0.5) * 0.5,
          sx: 0.62 + random() * 0.2,
          sz: 0.46 + random() * 0.14,
          tone: 0.85 + random() * 0.25,
        });
      }
    } else {
      // Piedritas de borde, alternando lados.
      for (let s = 0.8; s < path.length - 0.6; s += 1.25 + random() * 0.8) {
        const p = samplePath(path, s);
        if (streamDistance(p.x, p.z) < 2.2) continue;
        const side = random() < 0.5 ? 1 : -1;
        const off = side * (path.halfWidth + 0.12 + random() * 0.12);
        const size = 0.22 + random() * 0.18;
        list.push({
          x: p.x - p.tz * off,
          z: p.z + p.tx * off,
          yaw: random() * Math.PI * 2,
          sx: size,
          sz: size * (0.7 + random() * 0.3),
          tone: 0.75 + random() * 0.3,
        });
      }
    }
  }
  return list;
}

const dummy = new THREE.Object3D();

function PathStones() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => buildFlatStoneGeometry(), []);
  const material = useMemo(
    () => new THREE.MeshLambertMaterial({ color: "#b3a592" }),
    []
  );
  const stones = useMemo(() => stonePlacements(), []);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const color = new THREE.Color();
    stones.forEach((s, i) => {
      dummy.position.set(s.x, heightAt(s.x, s.z) + 0.02, s.z);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.set(s.sx, 1, s.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setRGB(s.tone, s.tone * 0.98, s.tone * 0.94));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [stones]);

  return <instancedMesh ref={ref} args={[geometry, material, stones.length]} receiveShadow />;
}

/** Empedrado circular de la plaza, con el centro de tierra donde crece
 * el círculo de flores. */
function Plaza() {
  const geometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(PLAZA.radius + 0.35, 72, 0, Math.PI * 2);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute("position");
    const colors: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      const edge = 1 - Math.min(1, Math.max(0, (r - PLAZA.radius) / 0.35));
      colors.push(1, 1, 1, edge);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
    return geo;
  }, []);
  const material = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        map: createPlazaTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    []
  );
  const soil = useMemo(() => {
    const geo = new THREE.CircleGeometry(PLAZA.bedRadius + 0.1, 40);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  return (
    <group position={[PLAZA.x, PLAZA_LEVEL + LIFT, PLAZA.z]}>
      <mesh geometry={geometry} material={material} receiveShadow renderOrder={1} />
      {/* Borde de piedra y tierra oscura del cantero central. */}
      <mesh geometry={soil} position={[0, 0.012, 0]} receiveShadow renderOrder={2}>
        <meshLambertMaterial color="#4a3326" polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <torusGeometry args={[PLAZA.bedRadius + 0.12, 0.07, 6, 48]} />
        <meshLambertMaterial color="#a89a88" />
      </mesh>
    </group>
  );
}

/** Caminos del jardín: el principal de tierra con pasaderas de piedra,
 * los secundarios de grava con piedritas de borde, y la plaza. */
export function GardenPaths() {
  const ribbons = useMemo(
    () =>
      PATHS.map((path) => ({
        id: path.id,
        kind: path.kind === "main" ? ("earth" as const) : ("gravel" as const),
        geometry: buildRibbon(path),
      })),
    []
  );
  const materials = useMemo(
    () => ({ earth: makePathMaterial("earth"), gravel: makePathMaterial("gravel") }),
    []
  );

  return (
    <group>
      {ribbons.map((r) => (
        <mesh key={r.id} geometry={r.geometry} material={materials[r.kind]} receiveShadow renderOrder={1} />
      ))}
      <PathStones />
      <Plaza />
    </group>
  );
}
