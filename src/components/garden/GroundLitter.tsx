"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createSeededRandom } from "@/lib/random";
import { heightAt, GARDEN_BOUNDARY_RADIUS, GARDEN_CENTER_Z } from "@/lib/terrain";
import { CAMERA_POSITIONS } from "@/lib/cameraController";

const CLEAR_RADIUS = 1.1;
const SPAWN_X = CAMERA_POSITIONS.gardenHome.x;
const SPAWN_Z = CAMERA_POSITIONS.gardenHome.z;

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

interface Placement {
  x: number;
  z: number;
  rotY: number;
  tilt: number;
  scale: number;
  color: THREE.Color;
}

function scatter(count: number, seed: number): { x: number; z: number }[] {
  const random = createSeededRandom(seed);
  const radius = GARDEN_BOUNDARY_RADIUS - 0.4;
  const list: { x: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * radius;
    const x = Math.cos(angle) * r;
    const z = GARDEN_CENTER_Z + Math.sin(angle) * r;
    if (Math.hypot(x - SPAWN_X, z - SPAWN_Z) < CLEAR_RADIUS) continue;
    list.push({ x, z });
  }
  return list;
}

const LEAF_TONES = ["#c97a3f", "#d99a3d", "#9c5b2e", "#b5482f"];

/** Piedras y hojas caídas apoyadas sobre el terreno: detalles chicos
 * pero que rompen la sensación de "plano de pasto uniforme" entre
 * una flor y otra. Todo estático (no requiere animación por frame). */
export function GroundLitter({ count }: { count: number }) {
  const rockMeshRef = useRef<THREE.InstancedMesh>(null);
  const leafMeshRef = useRef<THREE.InstancedMesh>(null);

  const rockGeometry = useMemo(() => buildRockGeometry(), []);
  const leafGeometry = useMemo(() => buildLeafLitterGeometry(), []);
  const rockMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    []
  );
  const leafMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
        side: THREE.DoubleSide,
      }),
    []
  );

  const rockPlacements = useMemo<Placement[]>(() => {
    const random = createSeededRandom(5151);
    return scatter(Math.round(count * 0.35), 6262).map((p) => ({
      ...p,
      rotY: random() * Math.PI * 2,
      tilt: (random() - 0.5) * 0.3,
      scale: 0.55 + random() * 0.9,
      color: new THREE.Color(1, 1, 1),
    }));
  }, [count]);

  const leafPlacements = useMemo<Placement[]>(() => {
    const random = createSeededRandom(8181);
    return scatter(Math.round(count * 0.65), 9292).map((p) => ({
      ...p,
      rotY: random() * Math.PI * 2,
      tilt: (random() - 0.5) * 0.35,
      scale: 0.7 + random() * 0.8,
      color: new THREE.Color(LEAF_TONES[Math.floor(random() * LEAF_TONES.length)]),
    }));
  }, [count]);

  useEffect(() => {
    const mesh = rockMeshRef.current;
    if (!mesh) return;
    rockPlacements.forEach((p, i) => {
      dummy.position.set(p.x, heightAt(p.x, p.z), p.z);
      dummy.rotation.set(p.tilt, p.rotY, p.tilt * 0.7);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [rockPlacements]);

  useEffect(() => {
    const mesh = leafMeshRef.current;
    if (!mesh) return;
    leafPlacements.forEach((p, i) => {
      dummy.position.set(p.x, heightAt(p.x, p.z) + 0.006, p.z);
      dummy.rotation.set(Math.PI / 2 + p.tilt * 0.3, p.rotY, p.tilt);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, p.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [leafPlacements]);

  return (
    <>
      {rockPlacements.length > 0 && (
        <instancedMesh
          ref={rockMeshRef}
          args={[rockGeometry, rockMaterial, rockPlacements.length]}
          receiveShadow
          frustumCulled={false}
        />
      )}
      {leafPlacements.length > 0 && (
        <instancedMesh
          ref={leafMeshRef}
          args={[leafGeometry, leafMaterial, leafPlacements.length]}
          receiveShadow
          frustumCulled={false}
        />
      )}
    </>
  );
}
