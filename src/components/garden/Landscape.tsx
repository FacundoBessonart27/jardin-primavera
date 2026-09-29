"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { heightAt } from "@/lib/terrain";
import { BOUNDARY, boundaryRadius, streamDistance } from "@/lib/gardenPlan";
import { HORIZON_HAZE } from "@/lib/sun";
import { MeshBuilder } from "@/lib/meshBuilder";
import { createCloudTexture } from "@/lib/proceduralTextures";
import { createSeededRandom } from "@/lib/random";
import { sceneUniforms } from "@/lib/sceneUniforms";

const dummy = new THREE.Object3D();

// ---------------------------------------------------------------------
// Bosque que rodea el valle (árboles simples, muy baratos)
// ---------------------------------------------------------------------

function buildRoundTree(canopy: string[]): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.cylinder(0.12, 0.18, 1.6, 0, 0, 0, "#3b2c26", 5);
  const blobs: [number, number, number, number][] = [
    [0, 2.3, 0, 1.25],
    [0.6, 1.9, 0.3, 0.9],
    [-0.55, 2.0, -0.25, 0.95],
    [0.1, 2.95, -0.1, 0.85],
  ];
  blobs.forEach(([x, y, z, r], i) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 0.85, 1)
    );
    b.add(new THREE.IcosahedronGeometry(r, 0), canopy[i % canopy.length], m);
  });
  return b.build();
}

function buildConifer(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.cylinder(0.1, 0.14, 1.0, 0, 0, 0, "#33261f", 5);
  const tiers: [number, number, number, string][] = [
    [0.8, 1.35, 1.6, "#2e5646"],
    [1.7, 1.0, 1.4, "#356150"],
    [2.5, 0.65, 1.2, "#3d6b57"],
  ];
  for (const [y, r, h, c] of tiers) b.cylinder(0.02, r, h, 0, y, 0, c, 7);
  return b.build();
}

interface FarTree {
  x: number;
  z: number;
  scale: number;
  yaw: number;
  kind: 0 | 1 | 2;
}

function farTreePlacements(count: number): FarTree[] {
  const random = createSeededRandom(606);
  const list: FarTree[] = [];
  let attempts = 0;
  while (list.length < count && attempts < count * 20) {
    attempts++;
    const a = random() * Math.PI * 2;
    const e = 1.1 + Math.pow(random(), 1.2) * 1.5;
    const x = BOUNDARY.cx + Math.cos(a) * e * BOUNDARY.rx;
    const z = BOUNDARY.cz + Math.sin(a) * e * BOUNDARY.rz;
    // La vista de la pantalla de apertura (detrás de la entrada) queda libre.
    if (z > 11 && Math.abs(x) < 10 + (z - 11) * 0.6) continue;
    if (streamDistance(x, z) < 2.6) continue;
    if (boundaryRadius(x, z) < 1.08) continue;
    const roll = random();
    list.push({
      x,
      z,
      scale: 1.5 + random() * 1.6 + (e - 1) * 0.6,
      yaw: random() * Math.PI * 2,
      kind: roll < 0.1 ? 2 : roll < 0.55 ? 1 : 0,
    });
  }
  return list;
}

function TreeInstances({ geometry, trees }: { geometry: THREE.BufferGeometry; trees: FarTree[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const color = new THREE.Color();
    const random = createSeededRandom(trees.length + 11);
    trees.forEach((t, i) => {
      dummy.position.set(t.x, heightAt(t.x, t.z) - 0.2, t.z);
      dummy.rotation.set(0, t.yaw, 0);
      dummy.scale.set(t.scale, t.scale * (0.9 + random() * 0.3), t.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setScalar(0.8 + random() * 0.35));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [trees]);
  if (trees.length === 0) return null;
  return <instancedMesh ref={ref} args={[geometry, material, trees.length]} />;
}

// ---------------------------------------------------------------------
// Siluetas del horizonte
// ---------------------------------------------------------------------

/** Anillo de silueta (línea de árboles o montañas) alrededor del valle. */
function buildSilhouetteRing(
  radius: number,
  segments: number,
  profile: (angle: number) => number,
  base: (x: number, z: number) => number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = BOUNDARY.cx + Math.cos(a) * radius;
    const z = BOUNDARY.cz + Math.sin(a) * radius;
    const y0 = base(x, z);
    positions.push(x, y0 - 6, z, x, y0 + profile(a), z);
    if (i > 0) {
      const k = (i - 1) * 2;
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

function treeLineProfile(a: number): number {
  // Copas: jorobas redondeadas de distintos tamaños, como un bosque visto de lejos.
  const crowns = Math.abs(Math.sin(a * 61)) * 2.2 + Math.abs(Math.sin(a * 37 + 1.3)) * 2.8 + Math.abs(Math.sin(a * 17 + 0.4)) * 2.4;
  return 6 + crowns + Math.sin(a * 5 + 1) * 3;
}

function mountainProfile(a: number): number {
  return 22 + Math.sin(a * 3 + 0.6) * 12 + Math.sin(a * 7 + 2.2) * 6 + Math.sin(a * 13 + 0.3) * 2.5;
}

function Horizon() {
  const treeLine = useMemo(
    () => buildSilhouetteRing(118, 360, treeLineProfile, (x, z) => heightAt(x, z)),
    []
  );
  const mountains = useMemo(() => buildSilhouetteRing(230, 240, mountainProfile, () => 4), []);
  const materials = useMemo(
    () => ({
      // Con niebla: a 120 m queda como una franja azulada y brumosa.
      treeLine: new THREE.MeshBasicMaterial({ color: "#2f443d", side: THREE.DoubleSide }),
      // Sin niebla (está más allá de su alcance): se precalcula un tono
      // lila apenas más oscuro que la bruma del horizonte.
      mountains: new THREE.MeshBasicMaterial({
        color: HORIZON_HAZE.clone().lerp(new THREE.Color("#7a5a86"), 0.42),
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
      }),
    }),
    []
  );
  return (
    <>
      <mesh geometry={mountains} material={materials.mountains} renderOrder={-5} />
      <mesh geometry={treeLine} material={materials.treeLine} />
    </>
  );
}

// ---------------------------------------------------------------------
// Nubes del atardecer
// ---------------------------------------------------------------------

function SunsetClouds() {
  const texture = useMemo(() => createCloudTexture(), []);
  const groupRef = useRef<THREE.Group>(null);
  const clouds = useMemo(() => {
    const random = createSeededRandom(4242);
    const tints = ["#ffc7a8", "#f7a7b8", "#ffd6b0", "#e9a2c4", "#fbb89c"];
    return Array.from({ length: 13 }, () => {
      const a = random() * Math.PI * 2;
      const d = 160 + random() * 110;
      return {
        a,
        d,
        y: 40 + random() * 70,
        w: 60 + random() * 70,
        h: 18 + random() * 16,
        opacity: 0.45 + random() * 0.35,
        tint: tints[Math.floor(random() * tints.length)],
      };
    });
  }, []);

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group) return;
    // Deriva muy lenta alrededor del valle; siempre centrada en la cámara.
    group.position.set(camera.position.x, 0, camera.position.z);
    group.rotation.y = sceneUniforms.windTime * 0.0035;
  });

  return (
    <group ref={groupRef}>
      {clouds.map((c, i) => (
        <sprite key={i} position={[Math.cos(c.a) * c.d, c.y, Math.sin(c.a) * c.d]} scale={[c.w, c.h, 1]}>
          <spriteMaterial
            map={texture}
            color={c.tint}
            transparent
            opacity={c.opacity}
            depthWrite={false}
            fog={false}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------
// Aves lejanas
// ---------------------------------------------------------------------

function buildBirdGeometry(): THREE.BufferGeometry {
  // Cuerpo en el centro y dos alas; aWing marca las puntas que aletean.
  const positions = [
    0, 0, 0.18, 0, 0, -0.18, -0.8, 0.05, -0.05,
    0, 0, -0.18, 0, 0, 0.18, 0.8, 0.05, -0.05,
  ];
  const wing = [0, 0, 1, 0, 0, 1];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aWing", new THREE.Float32BufferAttribute(wing, 1));
  geo.computeVertexNormals();
  return geo;
}

function Birds({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => buildBirdGeometry(), []);
  const time = useRef({ value: 0 });
  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: "#3b2b3d", side: THREE.DoubleSide, toneMapped: false });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time.current;
      shader.vertexShader = `attribute float aWing;\nuniform float uTime;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float birdPhase = instanceMatrix[3][0] * 0.37 + instanceMatrix[3][2] * 0.21;
        transformed.y += sin(uTime * 7.0 + birdPhase) * 0.55 * aWing;`
      );
    };
    return m;
  }, []);
  const birds = useMemo(() => {
    const random = createSeededRandom(1919);
    return Array.from({ length: count }, () => ({
      radius: 45 + random() * 45,
      y: 20 + random() * 16,
      speed: (0.03 + random() * 0.03) * (random() < 0.5 ? 1 : -1),
      phase: random() * Math.PI * 2,
      scale: 1 + random() * 0.6,
    }));
  }, [count]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = sceneUniforms.windTime;
    time.current.value = t;
    birds.forEach((b, i) => {
      const a = b.phase + t * b.speed;
      const x = BOUNDARY.cx + Math.cos(a) * b.radius;
      const z = BOUNDARY.cz - 10 + Math.sin(a) * b.radius * 0.8;
      dummy.position.set(x, b.y + Math.sin(t * 0.3 + b.phase) * 2, z);
      // Mira hacia donde vuela (tangente del círculo).
      dummy.rotation.set(0, Math.atan2(-Math.sin(a) * b.speed, Math.cos(a) * b.speed * 0.8) + Math.PI / 2, 0);
      dummy.scale.setScalar(b.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;
  return <instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} />;
}

/**
 * El paisaje alrededor del jardín: bosque en las colinas que rodean el
 * valle (algunos cerezos entre medio), una línea de árboles brumosa en
 * el horizonte, montañas lilas más allá, nubes teñidas por el sol y
 * unas pocas aves. Todo muy barato: 3 mallas instanciadas, 2 anillos de
 * silueta, 13 sprites y un puñado de triángulos para las aves.
 */
export function Landscape({ farTreeCount, birdCount }: { farTreeCount: number; birdCount: number }) {
  const round = useMemo(() => buildRoundTree(["#3f6a45", "#4a7a4c", "#365f43"]), []);
  const blossom = useMemo(() => buildRoundTree(["#e6a2b8", "#f0b7c7", "#d98ea9"]), []);
  const conifer = useMemo(() => buildConifer(), []);
  const trees = useMemo(() => farTreePlacements(farTreeCount), [farTreeCount]);
  const byKind = useMemo(
    () => [0, 1, 2].map((k) => trees.filter((t) => t.kind === k)),
    [trees]
  );

  return (
    <group>
      <TreeInstances geometry={round} trees={byKind[0]} />
      <TreeInstances geometry={conifer} trees={byKind[1]} />
      <TreeInstances geometry={blossom} trees={byKind[2]} />
      <Horizon />
      <SunsetClouds />
      <Birds count={birdCount} />
    </group>
  );
}
