"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { createSeededRandom } from "@/lib/random";
import { MeshBuilder } from "@/lib/meshBuilder";
import { heightAt } from "@/lib/terrain";
import {
  BOUNDARY,
  PLAZA,
  SPAWN,
  pathEdgeDistance,
  pondRadius,
  streamDistance,
} from "@/lib/gardenPlan";

const CLEAR_RADIUS = 1.1;

const dummy = new THREE.Object3D();

function buildRockGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.09, 0);
  geo.scale(1, 0.62, 1);
  const pos = geo.getAttribute("position");
  // Irregulariza un poco los vértices para que no se vea un poliedro
  // perfecto: cada roca queda con una silueta levemente distinta.
  const random = createSeededRandom(7331);
  for (let i = 0; i < pos.count; i++) {
    const n = 1 + (random() - 0.5) * 0.3;
    pos.setXYZ(i, pos.getX(i) * n, pos.getY(i) * n, pos.getZ(i) * n);
  }
  geo.computeVertexNormals();

  const base = new THREE.Color("#8a8378");
  const dark = new THREE.Color("#4d463d");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const shade = THREE.MathUtils.clamp((pos.getY(i) + 0.06) / 0.12, 0, 1);
    const c = dark.clone().lerp(base, shade);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

function buildLeafLitterGeometry(): THREE.BufferGeometry {
  // Una hojita caída, chata, apoyada sobre el suelo: una forma simple
  // tipo almendra hecha con pocos triángulos.
  const positions = [
    0, 0, -0.09,
    0.055, 0, -0.01,
    0.03, 0, 0.07,
    0, 0, 0.1,
    -0.03, 0, 0.07,
    -0.055, 0, -0.01,
  ];
  const indices = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function scatter(count: number, seed: number): { x: number; z: number }[] {
  const random = createSeededRandom(seed);
  const list: { x: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * 0.95;
    const x = BOUNDARY.cx + Math.cos(angle) * r * BOUNDARY.rx;
    const z = BOUNDARY.cz + Math.sin(angle) * r * BOUNDARY.rz;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < CLEAR_RADIUS) continue;
    if (pathEdgeDistance(x, z) < 0.1) continue;
    if (pondRadius(x, z) < 1.2 || streamDistance(x, z) < 1.4) continue;
    if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.radius + 0.3) continue;
    list.push({ x, z });
  }
  return list;
}

const LEAF_TONES = ["#c97a3f", "#d99a3d", "#9c5b2e", "#b5482f"];

/** Piedras y hojas caídas apoyadas sobre el terreno: detalles chicos
 * pero que rompen la sensación de "plano de pasto uniforme" entre
 * una flor y otra. Todo estático (no requiere animación por frame). */
export function GroundLitter({ count }: { count: number }) {
  // Piedritas y hojas caídas horneadas en UNA malla estática (antes, dos
  // mallas instanciadas): el color de cada hoja queda en sus vértices.
  const geometry = useMemo(() => {
    const rock = buildRockGeometry();
    const leaf = buildLeafLitterGeometry();
    leaf.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(new Float32Array(leaf.getAttribute("position").count * 3).fill(1), 3)
    );
    const b = new MeshBuilder();
    const rockRandom = createSeededRandom(5151);
    for (const p of scatter(Math.round(count * 0.35), 6262)) {
      dummy.position.set(p.x, heightAt(p.x, p.z), p.z);
      const tilt = (rockRandom() - 0.5) * 0.3;
      dummy.rotation.set(tilt, rockRandom() * Math.PI * 2, tilt * 0.7);
      dummy.scale.setScalar(0.55 + rockRandom() * 0.9);
      dummy.updateMatrix();
      b.addWithColors(rock, { matrix: dummy.matrix.clone() });
    }
    const leafRandom = createSeededRandom(8181);
    for (const p of scatter(Math.round(count * 0.65), 9292)) {
      // La hoja ya está modelada acostada (plano XZ): sólo una leve
      // inclinación, no un giro de 90° que la dejaba parada.
      const rotY = leafRandom() * Math.PI * 2;
      const tilt = (leafRandom() - 0.5) * 0.35;
      const scale = 0.7 + leafRandom() * 0.8;
      const tint = new THREE.Color(LEAF_TONES[Math.floor(leafRandom() * LEAF_TONES.length)]);
      dummy.position.set(p.x, heightAt(p.x, p.z) + 0.01, p.z);
      dummy.rotation.set(tilt * 0.3, rotY, tilt * 0.3);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      b.addWithColors(leaf, { matrix: dummy.matrix.clone(), tint });
    }
    return b.isEmpty ? null : b.build();
  }, [count]);
  const material = useMemo(
    () => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    []
  );

  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} receiveShadow />;
}
