"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createSeededRandom } from "@/lib/random";
import { heightAt } from "@/lib/terrain";
import { sceneUniforms } from "@/lib/sceneUniforms";
import {
  BOUNDARY,
  FLOWER_BEDS,
  OBSTACLES,
  PLAZA,
  POND,
  SHRINE,
  SPAWN,
  boundaryRadius,
  pathEdgeDistance,
  pondRadius,
  streamDistance,
} from "@/lib/gardenPlan";

/** Lugar apto para un arbusto: fuera de caminos, agua, plaza, santuario
 * y props; siempre con un poco de aire alrededor del camino. */
function isShrubSpot(x: number, z: number): boolean {
  if (pathEdgeDistance(x, z) < 0.45) return false;
  if (pondRadius(x, z) < 1.35 || streamDistance(x, z) < 1.8) return false;
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.radius + 0.6) return false;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 1.6) return false;
  if (
    Math.abs(x - SHRINE.x) < SHRINE.plinthW / 2 + 0.3 &&
    Math.abs(z - SHRINE.z) < SHRINE.plinthD / 2 + SHRINE.stepsDepth + 0.3
  ) {
    return false;
  }
  for (const o of OBSTACLES) {
    if (Math.hypot(x - o.x, z - o.z) < o.r + 0.45) return false;
  }
  return true;
}

/** Un arbustito bajo: tres bochas achatadas superpuestas con un leve
 * degradé (más oscuro abajo, más claro arriba), para que el jardín no
 * se sienta vacío entre una flor y otra sin competir con ellas. */
function buildBushGeometry(): THREE.BufferGeometry {
  const blobs: { x: number; y: number; z: number; r: number }[] = [
    { x: 0, y: 0.14, z: 0, r: 0.2 },
    { x: 0.13, y: 0.1, z: 0.05, r: 0.15 },
    { x: -0.11, y: 0.11, z: -0.06, r: 0.16 },
    { x: 0.02, y: 0.22, z: -0.08, r: 0.13 },
  ];

  const dark = new THREE.Color("#1f4a2c");
  const light = new THREE.Color("#5c9a5e");

  let vertexCount = 0;
  const geos = blobs.map((b) => {
    const g = new THREE.SphereGeometry(b.r, 7, 6);
    g.scale(1, 0.72, 1);
    g.translate(b.x, b.y, b.z);
    vertexCount += g.getAttribute("position").count;
    return g;
  });

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  let offset = 0;

  geos.forEach((g) => {
    g.computeVertexNormals();
    const pos = g.getAttribute("position");
    const norm = g.getAttribute("normal");
    positions.set(pos.array as Float32Array, offset * 3);
    normals.set(norm.array as Float32Array, offset * 3);
    for (let i = 0; i < pos.count; i++) {
      const heightFactor = THREE.MathUtils.clamp((pos.getY(i) + 0.1) / 0.35, 0, 1);
      const c = dark.clone().lerp(light, heightFactor);
      colors[(offset + i) * 3] = c.r;
      colors[(offset + i) * 3 + 1] = c.g;
      colors[(offset + i) * 3 + 2] = c.b;
    }
    offset += pos.count;
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

const dummy = new THREE.Object3D();

/** Vegetación secundaria (arbustos bajos) para que el jardín se sienta
 * lleno entre una flor y otra. Una sola InstancedMesh, sin animación
 * por frame salvo un vaivén de viento muy sutil ya calculado igual
 * que en las flores. */
export function Shrubs({ count }: { count: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => buildBushGeometry(), []);
  const time = useRef({ value: 0 });
  const wind = useRef({ value: 1 });
  const material = useMemo(() => {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // Vaivén de viento en el shader (antes se recalculaban todas las
    // matrices en cada frame): la parte alta del arbusto se mece apenas.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time.current;
      shader.uniforms.uWind = wind.current;
      shader.vertexShader = `uniform float uTime;\nuniform float uWind;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float shrubPhase = instanceMatrix[3][0] * 0.71 + instanceMatrix[3][2] * 0.43;
        float sway = sin(uTime * 0.9 + shrubPhase) * 0.02 * uWind;
        transformed.z += sway * position.y;
        transformed.x += sway * 0.6 * position.y;`
      );
    };
    return mat;
  }, []);

  const placements = useMemo(() => {
    const random = createSeededRandom(4242017);
    const list: { x: number; y: number; z: number; scale: number; rot: number; phase: number }[] = [];
    const add = (x: number, z: number, scale: number) => {
      if (!isShrubSpot(x, z)) return;
      list.push({
        x,
        // Altura del terreno calculada una sola vez (no en cada frame).
        y: heightAt(x, z),
        z,
        scale,
        rot: random() * Math.PI * 2,
        phase: random() * Math.PI * 2,
      });
    };
    // Un tercio enmarca el valle: una franja de arbustos en el borde del
    // jardín, donde el terreno empieza a subir hacia las colinas.
    const rim = Math.round(count * 0.34);
    for (let i = 0; i < rim; i++) {
      const a = random() * Math.PI * 2;
      const e = 0.96 + random() * 0.12;
      add(BOUNDARY.cx + Math.cos(a) * e * BOUNDARY.rx, BOUNDARY.cz + Math.sin(a) * e * BOUNDARY.rz, 0.9 + random() * 1.1);
    }
    // Otro tercio bordea los canteros (como en un jardín cuidado).
    const edges = Math.round(count * 0.4);
    for (let i = 0; i < edges; i++) {
      const b = FLOWER_BEDS[Math.floor(random() * FLOWER_BEDS.length)];
      const a = random() * Math.PI * 2;
      const r = 1.02 + random() * 0.22;
      const lx = Math.cos(a) * b.rx * r;
      const lz = Math.sin(a) * b.rz * r;
      const c = Math.cos(b.rot);
      const sn = Math.sin(b.rot);
      add(b.x + lx * c - lz * sn, b.z + lx * sn + lz * c, 0.6 + random() * 0.6);
    }
    // El resto, sueltos por los prados y junto al estanque.
    while (list.length < count * 0.92) {
      const before = list.length;
      if (random() < 0.2) {
        const a = random() * Math.PI * 2;
        const r = 1.45 + random() * 0.5;
        add(POND.x + Math.cos(a) * POND.rx * r, POND.z + Math.sin(a) * POND.rz * r, 0.7 + random() * 0.7);
      } else {
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(random()) * 0.92;
        const x = BOUNDARY.cx + Math.cos(a) * r * BOUNDARY.rx;
        const z = BOUNDARY.cz + Math.sin(a) * r * BOUNDARY.rz;
        if (boundaryRadius(x, z) < 0.93) add(x, z, 0.6 + random() * 0.8);
      }
      if (list.length === before && random() < 0.02) break;
    }
    return list;
  }, [count]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const random = createSeededRandom(909);
    placements.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const tint = 0.85 + random() * 0.3;
      mesh.setColorAt(i, new THREE.Color(tint, tint, tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [placements]);

  useFrame(() => {
    time.current.value = sceneUniforms.windTime;
    wind.current.value = sceneUniforms.windStrength;
  });

  if (placements.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, placements.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}
