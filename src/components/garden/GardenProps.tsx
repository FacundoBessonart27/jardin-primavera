"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { heightAt } from "@/lib/terrain";
import { BENCHES, LANTERNS, ROCKS } from "@/lib/gardenPlan";
import { MeshBuilder, createGlowLambert } from "@/lib/meshBuilder";
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
  const b = new MeshBuilder();
  addLanternStone(b);
  addLanternGlow(b);
  return b.build();
}

function addLanternStone(b: MeshBuilder) {
  const stone = "#9a958c";
  const moss = "#76806a";
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
}

/** La ventana encendida del farol (brilla con luz propia). */
function addLanternGlow(b: MeshBuilder) {
  b.add(new THREE.BoxGeometry(0.22, 0.24, 0.22), "#ffffff", new THREE.Matrix4().makeTranslation(0, LANTERN_LIGHT_Y, 0), 1);
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


/** Color cálido de la luz de faroles y linternas. */
export const WARM_LIGHT = new THREE.Color("#ffc47a");

/**
 * Faroles de piedra, bancos y rocas del jardín. Cada tipo es una sola
 * malla instanciada (sin luces reales: el brillo de los faroles es un
 * material emisivo más un halo y un charco de luz falsos, que cuestan
 * casi nada en el celular).
 */
export function GardenProps({ shadows }: { shadows: boolean }) {
  // Faroles (piedra + ventana encendida), bancos y rocas horneados en UNA
  // malla estática con color por vértice: un solo draw call (y uno en el
  // pase de sombras) para todos los props del jardín.
  const geometry = useMemo(() => {
    const lantern = buildLanternStone();
    const bench = buildBench();
    const rock = buildRock();
    const b = new MeshBuilder();
    const m = new THREE.Matrix4();
    const place = (it: { x: number; z: number; yaw: number; scale: number }, lift = 0) =>
      m.compose(
        new THREE.Vector3(it.x, heightAt(it.x, it.z) + lift * it.scale, it.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.yaw),
        new THREE.Vector3(it.scale, it.scale, it.scale)
      );
    for (const l of LANTERNS) b.addWithColors(lantern, { matrix: place(l) });
    for (const bench0 of BENCHES) b.addWithColors(bench, { matrix: place(bench0) });
    for (const r of ROCKS) b.addWithColors(rock, { matrix: place({ ...r, scale: r.scale * 0.8 }, 0.05) });
    return b.build();
  }, []);
  const material = useMemo(() => createGlowLambert(WARM_LIGHT.clone().multiplyScalar(1.5)), []);

  return <mesh geometry={geometry} material={material} castShadow={shadows} receiveShadow />;
}

// ---------------------------------------------------------------------
// Halos y charcos de luz
// ---------------------------------------------------------------------

export interface GlowSpec {
  x: number;
  y: number;
  z: number;
  /** Tamaño del halo (m). */
  size: number;
  color: THREE.Color;
  opacity: number;
}

const glowVertex = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  uniform float uFlicker;
  varying vec4 vColor;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * uScale / -mvPosition.z;
    vColor = vec4(aColor.rgb, aColor.a * uFlicker);
  }
`;

const glowFragment = /* glsl */ `
  uniform sampler2D uMap;
  varying vec4 vColor;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vColor.a;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor.rgb, a);
    #include <colorspace_fragment>
  }
`;

/**
 * Todos los halos cálidos (faroles, faroles de papel, shoji) en un único
 * Points con tamaño y color propios por halo: un solo draw call, con un
 * parpadeo suave de llama.
 */
export function WarmGlows({ glows }: { glows: GlowSpec[] }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(glows.flatMap((g) => [g.x, g.y, g.z]), 3));
    geo.setAttribute("aSize", new THREE.Float32BufferAttribute(glows.map((g) => g.size), 1));
    geo.setAttribute(
      "aColor",
      new THREE.Float32BufferAttribute(glows.flatMap((g) => [g.color.r, g.color.g, g.color.b, g.opacity]), 4)
    );
    return geo;
  }, [glows]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
        uniforms: {
          uMap: { value: createSoftDiscTexture(64, "#ffffff") },
          uScale: { value: 400 },
          uFlicker: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  useFrame(({ size, viewport }) => {
    const t = sceneUniforms.windTime;
    material.uniforms.uFlicker.value = 0.9 + 0.06 * Math.sin(t * 7.3) + 0.04 * Math.sin(t * 13.1);
    // Mismo criterio que PointsMaterial con sizeAttenuation.
    material.uniforms.uScale.value = (size.height * viewport.dpr) / 2;
  });

  if (glows.length === 0) return null;
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

export interface LightPool {
  x: number;
  z: number;
  radius: number;
  strength: number;
}

/** Charcos de luz cálida sobre el suelo (quads aditivos). */
export function LightPools({ pools }: { pools: LightPool[] }) {
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

/** Halos y charcos de luz de los faroles de piedra. */
export function lanternLights(): { glows: GlowSpec[]; pools: LightPool[] } {
  return {
    glows: LANTERNS.map((l) => ({
      x: l.x,
      y: heightAt(l.x, l.z) + LANTERN_LIGHT_Y * l.scale,
      z: l.z,
      size: 0.95,
      color: WARM_LIGHT,
      opacity: 0.8,
    })),
    pools: LANTERNS.map((l) => ({ x: l.x, z: l.z, radius: 1.5, strength: 1 })),
  };
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

  useFrame(({ camera }) => {
    const points = pointsRef.current;
    if (!points) return;
    // Sólo existen cerca del santuario: de lejos ni se ven ni se animan.
    const near = Math.hypot(camera.position.x - centerX, camera.position.z - centerZ) < radius + 30;
    if (points.visible !== near) points.visible = near;
    if (!near) return;
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
