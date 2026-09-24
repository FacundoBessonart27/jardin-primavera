"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createSeededRandom } from "@/lib/random";
import { heightAt, GARDEN_BOUNDARY_RADIUS, GARDEN_CENTER_Z } from "@/lib/terrain";
import { sceneUniforms } from "@/lib/sceneUniforms";
import { CAMERA_POSITIONS } from "@/lib/cameraController";

const CLEAR_RADIUS = 1.4;
const SPAWN_X = CAMERA_POSITIONS.gardenHome.x;
const SPAWN_Z = CAMERA_POSITIONS.gardenHome.z;

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
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0,
      }),
    []
  );

  const placements = useMemo(() => {
    const random = createSeededRandom(4242017);
    const radius = GARDEN_BOUNDARY_RADIUS - 0.6;
    const list: { x: number; z: number; scale: number; rot: number; phase: number }[] = [];
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * radius;
      const x = Math.cos(angle) * r;
      const z = GARDEN_CENTER_Z + Math.sin(angle) * r;
      if (Math.hypot(x - SPAWN_X, z - SPAWN_Z) < CLEAR_RADIUS) continue;
      list.push({
        x,
        z,
        scale: 0.65 + random() * 0.9,
        rot: random() * Math.PI * 2,
        phase: random() * Math.PI * 2,
      });
    }
    return list;
  }, [count]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const random = createSeededRandom(909);
    placements.forEach((p, i) => {
      dummy.position.set(p.x, heightAt(p.x, p.z), p.z);
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
    const mesh = meshRef.current;
    if (!mesh) return;
    placements.forEach((p, i) => {
      const sway =
        Math.sin(sceneUniforms.windTime * 0.9 + p.phase) * 0.02 * sceneUniforms.windStrength;
      dummy.position.set(p.x, heightAt(p.x, p.z), p.z);
      dummy.rotation.set(sway, p.rot, sway * 0.6);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
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
