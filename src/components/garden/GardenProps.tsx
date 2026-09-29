"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { heightAt } from "@/lib/terrain";
import { BENCHES, LANTERNS, ROCKS } from "@/lib/gardenPlan";
import { MeshBuilder } from "@/lib/meshBuilder";
import { createSoftDiscTexture } from "@/lib/proceduralTextures";
import { createSeededRandom } from "@/lib/random";
import { sceneUniforms } from "@/lib/sceneUniforms";

const dummy = new THREE.Object3D();

// ---------------------------------------------------------------------
// Farol de piedra (tōrō)
// ---------------------------------------------------------------------

/** Altura (local) del centro de la ventana de luz del farol. */
export const LANTERN_LIGHT_Y = 0.97;

function buildLanternStone(): THREE.BufferGeometry {
  const stone = "#9a958c";
  const moss = "#76806a";
  const b = new MeshBuilder();
  b.cylinder(0.34, 0.37, 0.14, 0, 0, 0, moss, 6);
  b.cylinder(0.1, 0.12, 0.56, 0, 0.14, 0, stone, 8);
  b.cylinder(0.27, 0.22, 0.1, 0, 0.7, 0, stone, 6);
  // Caja de luz: cuatro columnitas y dos losas (la luz se ve entre medio).
  for (const [x, z] of [
    [-0.13, -0.13],
    [0.13, -0.13],
    [-0.13, 0.13],
    [0.13, 0.13],
  ]) {
    b.box(0.06, 0.28, 0.06, x, LANTERN_LIGHT_Y, z, stone);
  }
  b.box(0.36, 0.05, 0.36, 0, 0.82, 0, stone);
  b.box(0.36, 0.05, 0.36, 0, 1.12, 0, stone);
  // Techo hexagonal con alero y remate.
  b.cylinder(0.08, 0.46, 0.22, 0, 1.13, 0, stone, 6);
  b.cylinder(0.46, 0.46, 0.03, 0, 1.13, 0, "#8a857c", 6);
  b.sphere(0.075, 0, 1.4, 0, stone, 1, 1.25, 1);
  return b.build();
}

function buildLanternGlow(): THREE.BufferGeometry {
  return new MeshBuilder().box(0.22, 0.24, 0.22, 0, LANTERN_LIGHT_Y, 0, "#ffffff").build();
}

// ---------------------------------------------------------------------
// Banco de madera
// ---------------------------------------------------------------------

function buildBench(): THREE.BufferGeometry {
  const wood = "#93613f";
  const woodLight = "#a8744d";
  const frame = "#3f2c22";
  const b = new MeshBuilder();
  // Asiento de listones (a lo largo de X).
  for (let i = 0; i < 4; i++) {
    b.box(1.6, 0.04, 0.09, 0, 0.45, -0.17 + i * 0.105, i % 2 ? wood : woodLight);
  }
  // Respaldo, levemente reclinado.
  for (let i = 0; i < 2; i++) {
    b.box(1.6, 0.09, 0.035, 0, 0.64 + i * 0.16, -0.25 - i * 0.03, i % 2 ? woodLight : wood, 0, -0.18);
  }
  // Estructura: patas, apoyabrazos y soportes del respaldo.
  for (const x of [-0.68, 0.68]) {
    b.box(0.06, 0.45, 0.06, x, 0.225, 0.14, frame);
    b.box(0.06, 0.9, 0.06, x, 0.45, -0.22, frame, 0, -0.1);
    b.box(0.06, 0.04, 0.44, x, 0.43, -0.03, frame);
    b.box(0.07, 0.035, 0.46, x, 0.66, -0.02, frame);
  }
  b.box(1.4, 0.05, 0.04, 0, 0.18, -0.03, frame);
  return b.build();
}

// ---------------------------------------------------------------------
// Rocas decorativas
// ---------------------------------------------------------------------

function buildRock(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.34, 1);
  const pos = geo.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color("#8e8a82");
  const dark = new THREE.Color("#57534d");
  const moss = new THREE.Color("#6d7d52");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 + 0.18 * Math.sin(x * 9 + z * 4) + 0.1 * Math.sin(y * 11 + x * 3);
    const ny = y * 0.62 * k;
    pos.setXYZ(i, x * k * 1.1, ny, z * k);
    c.copy(dark).lerp(base, Math.min(1, Math.max(0, (ny + 0.15) / 0.3)));
    if (ny > 0.1) c.lerp(moss, Math.min(0.55, (ny - 0.1) * 3));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function Instanced({
  geometry,
  material,
  items,
  lift = 0,
  castShadow = true,
  scaleY = 1,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  items: { x: number; z: number; yaw: number; scale: number }[];
  lift?: number;
  castShadow?: boolean;
  scaleY?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      dummy.position.set(it.x, heightAt(it.x, it.z) + lift * it.scale, it.z);
      dummy.rotation.set(0, it.yaw, 0);
      dummy.scale.set(it.scale, it.scale * scaleY, it.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, lift, scaleY]);
  return (
    <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow />
  );
}

/** Color cálido de la luz de faroles y linternas. */
export const WARM_LIGHT = new THREE.Color("#ffc47a");

/**
 * Faroles de piedra, bancos y rocas del jardín. Cada tipo es una sola
 * malla instanciada (sin luces reales: el brillo de los faroles es un
 * material emisivo más un halo y un charco de luz falsos, que cuestan
 * casi nada en el celular).
 */
export function GardenProps({ shadows }: { shadows: boolean }) {
  const lanternStone = useMemo(() => buildLanternStone(), []);
  const lanternGlow = useMemo(() => buildLanternGlow(), []);
  const bench = useMemo(() => buildBench(), []);
  const rock = useMemo(() => buildRock(), []);

  const materials = useMemo(
    () => ({
      stone: new THREE.MeshLambertMaterial({ vertexColors: true }),
      glow: new THREE.MeshBasicMaterial({ color: WARM_LIGHT.clone().multiplyScalar(1.15), toneMapped: false }),
      wood: new THREE.MeshLambertMaterial({ vertexColors: true }),
      rock: new THREE.MeshLambertMaterial({ vertexColors: true }),
    }),
    []
  );

  const rocks = useMemo(
    () => ROCKS.map((r) => ({ ...r, scale: r.scale * 0.8 })),
    []
  );

  return (
    <group>
      <Instanced geometry={lanternStone} material={materials.stone} items={LANTERNS} castShadow={shadows} />
      <Instanced geometry={lanternGlow} material={materials.glow} items={LANTERNS} castShadow={false} />
      <Instanced geometry={bench} material={materials.wood} items={BENCHES} castShadow={shadows} />
      <Instanced geometry={rock} material={materials.rock} items={rocks} lift={0.05} castShadow={shadows} />
      <LanternHalos />
    </group>
  );
}

// ---------------------------------------------------------------------
// Halos y charcos de luz
// ---------------------------------------------------------------------

export interface GlowPoint {
  x: number;
  y: number;
  z: number;
}

/** Halos aditivos (un único Points) con un parpadeo suave de llama. */
export function GlowSprites({
  points,
  size,
  color = WARM_LIGHT,
  opacity = 0.75,
}: {
  points: GlowPoint[];
  size: number;
  color?: THREE.Color;
  opacity?: number;
}) {
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const texture = useMemo(() => createSoftDiscTexture(64, "#ffffff"), []);
  const positions = useMemo(() => {
    const arr = new Float32Array(points.length * 3);
    points.forEach((p, i) => arr.set([p.x, p.y, p.z], i * 3));
    return arr;
  }, [points]);

  useFrame(() => {
    const m = materialRef.current;
    if (!m) return;
    const t = sceneUniforms.windTime;
    m.opacity = opacity * (0.9 + 0.06 * Math.sin(t * 7.3) + 0.04 * Math.sin(t * 13.1));
  });

  if (points.length === 0) return null;
  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        size={size}
        map={texture}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
        toneMapped={false}
        fog={false}
      />
    </points>
  );
}

/** Charcos de luz cálida sobre el suelo (quads aditivos). */
export function LightPools({ pools }: { pools: { x: number; z: number; radius: number; strength: number }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(2, 2);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: createSoftDiscTexture(128, "#ffffff"),
        color: WARM_LIGHT,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        toneMapped: false,
      }),
    []
  );

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const color = new THREE.Color();
    pools.forEach((p, i) => {
      dummy.position.set(p.x, heightAt(p.x, p.z) + 0.08, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(p.radius, 1, p.radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setScalar(p.strength));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pools]);

  if (pools.length === 0) return null;
  return <instancedMesh ref={ref} args={[geometry, material, pools.length]} renderOrder={3} />;
}

function LanternHalos() {
  const glows = useMemo<GlowPoint[]>(
    () =>
      LANTERNS.map((l) => ({
        x: l.x,
        y: heightAt(l.x, l.z) + LANTERN_LIGHT_Y * l.scale,
        z: l.z,
      })),
    []
  );
  const pools = useMemo(
    () => LANTERNS.map((l) => ({ x: l.x, z: l.z, radius: 1.5, strength: 1 })),
    []
  );
  return (
    <>
      <GlowSprites points={glows} size={0.95} opacity={0.8} />
      <LightPools pools={pools} />
    </>
  );
}

// ---------------------------------------------------------------------
// Luciérnagas en la zona del santuario
// ---------------------------------------------------------------------

export function Fireflies({
  count,
  centerX,
  centerZ,
  radius,
}: {
  count: number;
  centerX: number;
  centerZ: number;
  radius: number;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const texture = useMemo(() => createSoftDiscTexture(64, "#ffffff"), []);
  const data = useMemo(() => {
    const random = createSeededRandom(8080);
    const seeds = Array.from({ length: count }, () => {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * radius;
      const x = centerX + Math.cos(a) * r;
      const z = centerZ + Math.sin(a) * r;
      return {
        x,
        z,
        y: heightAt(x, z) + 0.5 + random() * 1.8,
        speed: 0.2 + random() * 0.35,
        phase: random() * Math.PI * 2,
        blink: 0.6 + random() * 1.4,
      };
    });
    return {
      seeds,
      positions: new Float32Array(count * 3),
      colors: new Float32Array(count * 3),
    };
  }, [count, centerX, centerZ, radius]);

  useFrame(() => {
    const points = pointsRef.current;
    if (!points) return;
    const t = sceneUniforms.windTime;
    const { seeds, positions, colors } = data;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      const w = t * s.speed + s.phase;
      positions[i * 3] = s.x + Math.sin(w) * 0.8 + Math.sin(w * 2.3) * 0.25;
      positions[i * 3 + 1] = s.y + Math.sin(w * 1.7) * 0.35;
      positions[i * 3 + 2] = s.z + Math.cos(w * 0.9) * 0.8;
      const pulse = Math.max(0, Math.sin(t * s.blink + s.phase * 3));
      const k = 0.15 + 0.85 * pulse * pulse;
      colors[i * 3] = 1 * k;
      colors[i * 3 + 1] = 0.86 * k;
      colors[i * 3 + 2] = 0.48 * k;
    }
    points.geometry.getAttribute("position").needsUpdate = true;
    points.geometry.getAttribute("color").needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.11}
        map={texture}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  );
}
