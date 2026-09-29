"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { heightAt } from "@/lib/terrain";
import { MAIN_PATH, PLAZA, SAKURA_TREES, samplePath } from "@/lib/gardenPlan";
import { sceneUniforms } from "@/lib/sceneUniforms";
import { createBlossomDenseTexture, createBlossomTexture } from "@/lib/gardenTextures";
import { createPetalTexture } from "@/lib/proceduralTextures";
import { createSeededRandom } from "@/lib/random";
import { buildSakuraTree, type GeometryArrays, type TreeGeometry } from "./sakuraGeometry";

const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

/** Balanceo suave de la copa en el vertex shader: más arriba, más se
 * mueve; cada árbol con su propia fase. `aWind` = (fase del árbol,
 * altura del vértice sobre la base del árbol). */
function withCanopyWind<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = `attribute vec2 aWind;\nuniform float uTime;\nuniform float uWind;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float phase = aWind.x;
      float reach = smoothstep(1.5, 5.5, aWind.y);
      float gust = 0.7 + 0.3 * sin(uTime * 0.35 + phase);
      transformed.x += sin(uTime * 0.8 + phase + position.z * 0.6) * 0.07 * reach * uWind * gust;
      transformed.z += cos(uTime * 0.65 + phase * 1.3 + position.x * 0.5) * 0.05 * reach * uWind * gust;
      transformed.y += sin(uTime * 1.3 + phase + position.x * 1.7) * 0.015 * reach * uWind;`
    );
  };
  return material;
}

const dummy = new THREE.Object3D();
dummy.rotation.order = "YXZ";

function treeMatrix(index: number, out: THREE.Matrix4): THREE.Matrix4 {
  const t = SAKURA_TREES[index];
  dummy.position.set(t.x, heightAt(t.x, t.z) - 0.05, t.z);
  // Inclinación hacia +X local (el lado que mira al camino) y luego el giro.
  dummy.rotation.set(0, t.yaw, -t.lean);
  const squash = 0.94 + ((index * 37) % 10) / 80;
  dummy.scale.set(t.scale, t.scale * squash, t.scale);
  dummy.updateMatrix();
  return out.copy(dummy.matrix);
}

const treeSeed = (index: number) => 9001 + index * 7919;

/** Árboles repartidos en tres zonas del recorrido (entrada y lazos,
 * túnel, santuario): cada zona es su propio grupo de mallas, así la
 * cámara descarta las zonas que no ve y cada una elige su detalle. */
const GROUP_COUNT = 3;
function treeGroups(): number[][] {
  const order = SAKURA_TREES.map((_, i) => i).sort((a, b) => SAKURA_TREES[b].z - SAKURA_TREES[a].z);
  const size = Math.ceil(order.length / GROUP_COUNT);
  return Array.from({ length: GROUP_COUNT }, (_, g) => order.slice(g * size, (g + 1) * size)).filter(
    (g) => g.length > 0
  );
}

interface BakedLod {
  trunk: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
  cards: THREE.BufferGeometry;
}

const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();

/** Une las piezas de varios árboles (ya ubicados en el mundo) en una
 * sola geometría indexada, con el atributo de viento de cada árbol. */
function bake(indices: number[], pick: (t: TreeGeometry) => GeometryArrays, trees: TreeGeometry[], withUv: boolean) {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const wind: number[] = [];
  const index: number[] = [];
  indices.forEach((treeIndex, k) => {
    const arrays = pick(trees[k]);
    const t = SAKURA_TREES[treeIndex];
    treeMatrix(treeIndex, _m);
    _nm.getNormalMatrix(_m);
    const base = positions.length / 3;
    const phase = t.x * 0.37 + t.z * 0.61;
    for (let i = 0; i < arrays.positions.length; i += 3) {
      _v.set(arrays.positions[i], arrays.positions[i + 1], arrays.positions[i + 2]);
      const localHeight = _v.y * t.scale;
      _v.applyMatrix4(_m);
      positions.push(_v.x, _v.y, _v.z);
      _v.set(arrays.normals[i], arrays.normals[i + 1], arrays.normals[i + 2]).applyMatrix3(_nm).normalize();
      normals.push(_v.x, _v.y, _v.z);
      colors.push(arrays.colors[i], arrays.colors[i + 1], arrays.colors[i + 2]);
      wind.push(phase, localHeight);
    }
    if (withUv) uvs.push(...arrays.uvs);
    for (const i of arrays.indices) index.push(base + i);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  if (withUv) geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("aWind", new THREE.Float32BufferAttribute(wind, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius += 0.5;
  return geo;
}

function bakeGroup(indices: number[], detail: number, lod: "near" | "far"): BakedLod {
  const trees = indices.map((i) => buildSakuraTree(treeSeed(i), detail, lod));
  return {
    trunk: bake(indices, (t) => t.trunk, trees, false),
    canopy: bake(indices, (t) => t.canopy, trees, true),
    cards: bake(indices, (t) => t.cards, trees, true),
  };
}

/**
 * Cerezos en flor a los lados del camino principal (y un túnel donde
 * las copas se juntan por encima), más algunos en los lazos y el gran
 * "árbol madre" junto al santuario. Cada árbol es único; se hornean por
 * zona en 3 mallas (tronco, copa, tarjetas) con dos niveles de detalle,
 * y cada zona usa la versión liviana cuando la cámara está lejos.
 */
export function SakuraGrove({
  detail,
  shadows,
  lodDistance,
  cardShadows,
}: {
  detail: number;
  shadows: boolean;
  lodDistance: number;
  /** Si las tarjetas de flores reciben sombra (sólo en calidad alta). */
  cardShadows: boolean;
}) {
  const groups = useMemo(() => {
    return treeGroups().map((indices) => {
      const xs = indices.map((i) => SAKURA_TREES[i].x);
      const zs = indices.map((i) => SAKURA_TREES[i].z);
      return {
        indices,
        near: bakeGroup(indices, detail, "near"),
        far: bakeGroup(indices, detail, "far"),
        box: {
          minX: Math.min(...xs) - 3,
          maxX: Math.max(...xs) + 3,
          minZ: Math.min(...zs) - 3,
          maxZ: Math.max(...zs) + 3,
        },
      };
    });
  }, [detail]);

  useEffect(
    () => () => {
      for (const g of groups) {
        for (const lod of [g.near, g.far]) Object.values(lod).forEach((geo) => geo.dispose());
      }
    },
    [groups]
  );

  const materials = useMemo(
    () => ({
      trunk: new THREE.MeshLambertMaterial({ vertexColors: true }),
      canopy: withCanopyWind(
        new THREE.MeshLambertMaterial({
          map: createBlossomDenseTexture(),
          vertexColors: true,
          emissive: new THREE.Color("#4a1c2c"),
          emissiveIntensity: 0.3,
        })
      ),
      cards: withCanopyWind(
        new THREE.MeshLambertMaterial({
          map: createBlossomTexture(),
          vertexColors: true,
          alphaTest: 0.45,
          side: THREE.DoubleSide,
          emissive: new THREE.Color("#6b2a40"),
          emissiveIntensity: 0.3,
        })
      ),
    }),
    []
  );

  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const farState = useRef<boolean[]>([]);
  // Mallas nuevas (cambió la calidad): vuelven a elegir su detalle.
  useEffect(() => {
    farState.current = [];
  }, [groups]);

  useFrame(({ camera }) => {
    windUniforms.uTime.value = sceneUniforms.windTime;
    windUniforms.uWind.value = sceneUniforms.windStrength;
    groups.forEach((g, gi) => {
      const dx = Math.max(g.box.minX - camera.position.x, 0, camera.position.x - g.box.maxX);
      const dz = Math.max(g.box.minZ - camera.position.z, 0, camera.position.z - g.box.maxZ);
      const d = Math.hypot(dx, dz);
      const wasFar = farState.current[gi] ?? false;
      const far = wasFar ? d > lodDistance - 3 : d > lodDistance;
      if (far === wasFar && farState.current[gi] !== undefined) return;
      farState.current[gi] = far;
      const lod = far ? g.far : g.near;
      const [trunk, canopy, cards] = [0, 1, 2].map((k) => meshRefs.current[gi * 3 + k]);
      if (trunk) trunk.geometry = lod.trunk;
      if (canopy) canopy.geometry = lod.canopy;
      if (cards) cards.geometry = lod.cards;
    });
  });

  return (
    <group>
      {groups.map((g, gi) => (
        <group key={`${gi}-${detail}`}>
          <mesh
            ref={(m) => {
              meshRefs.current[gi * 3] = m;
            }}
            geometry={g.near.trunk}
            material={materials.trunk}
            castShadow={shadows}
            receiveShadow
          />
          <mesh
            ref={(m) => {
              meshRefs.current[gi * 3 + 1] = m;
            }}
            geometry={g.near.canopy}
            material={materials.canopy}
            castShadow={shadows}
            receiveShadow
          />
          <mesh
            ref={(m) => {
              meshRefs.current[gi * 3 + 2] = m;
            }}
            geometry={g.near.cards}
            material={materials.cards}
            receiveShadow={cardShadows}
          />
        </group>
      ))}
    </group>
  );
}

/** Puntos (en el mundo) de donde nacen los pétalos: los racimos de cada
 * copa. Se calculan una sola vez. */
let blossomPoints: THREE.Vector3[] | null = null;
function blossomWorldPoints(): THREE.Vector3[] {
  if (blossomPoints) return blossomPoints;
  const points: THREE.Vector3[] = [];
  const m = new THREE.Matrix4();
  SAKURA_TREES.forEach((_, i) => {
    const tree = buildSakuraTree(treeSeed(i), 0.35, "far");
    treeMatrix(i, m);
    for (const c of tree.clusters) points.push(c.clone().applyMatrix4(m));
  });
  blossomPoints = points;
  return points;
}

const PETAL_TONES = ["#ffd3e1", "#ffc0d3", "#fff0f5", "#f7a8c0"];

/**
 * Pétalos de sakura que se desprenden de las copas y caen meciéndose.
 * Nacen sobre todo en los árboles cercanos a la cámara (los lejanos no
 * se verían), así el mismo presupuesto de partículas rinde mucho más.
 */
export function SakuraPetalFall({ count }: { count: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const texture = useMemo(() => createPetalTexture(64, "#ffffff"), []);
  const sources = useMemo(() => blossomWorldPoints(), []);

  const state = useMemo(() => {
    const random = createSeededRandom(1717);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    const phase = new Float32Array(count);
    const floor = new Float32Array(count);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const s = sources[Math.floor(random() * sources.length)];
      positions[i * 3] = s.x + (random() - 0.5) * 2;
      positions[i * 3 + 1] = s.y - random() * s.y;
      positions[i * 3 + 2] = s.z + (random() - 0.5) * 2;
      floor[i] = heightAt(s.x, s.z);
      speed[i] = 0.32 + random() * 0.35;
      phase[i] = random() * Math.PI * 2;
      color.set(PETAL_TONES[Math.floor(random() * PETAL_TONES.length)]);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    return { positions, colors, speed, phase, floor, random };
  }, [count, sources]);

  useFrame(({ camera }, rawDelta) => {
    const points = pointsRef.current;
    if (!points) return;
    const delta = Math.min(rawDelta, 1 / 20);
    const { positions, speed, phase, floor, random } = state;
    const t = sceneUniforms.windTime;
    const wind = sceneUniforms.windStrength;
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      positions[k + 1] -= speed[i] * delta;
      positions[k] += (Math.sin(t * 1.3 + phase[i]) * 0.35 + 0.18) * delta * wind;
      positions[k + 2] += Math.cos(t * 1.1 + phase[i] * 1.7) * 0.25 * delta * wind;
      if (positions[k + 1] < floor[i]) {
        // Renace en un racimo cercano a la cámara (probando unas veces).
        let s = sources[Math.floor(random() * sources.length)];
        for (let tries = 0; tries < 6; tries++) {
          if (Math.hypot(s.x - camera.position.x, s.z - camera.position.z) < 26) break;
          s = sources[Math.floor(random() * sources.length)];
        }
        positions[k] = s.x + (random() - 0.5) * 1.6;
        positions[k + 1] = s.y + (random() - 0.3) * 0.8;
        positions[k + 2] = s.z + (random() - 0.5) * 1.6;
        floor[i] = heightAt(positions[k], positions[k + 2]);
      }
    }
    points.geometry.getAttribute("position").needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[state.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[state.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.085}
        map={texture}
        vertexColors
        transparent
        alphaTest={0.2}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

/** Pétalo chato para la alfombra del suelo. */
function buildGroundPetalGeometry(): THREE.BufferGeometry {
  // Seis vértices alcanzan para la silueta de un pétalo a esta escala
  // (antes, una curva de ~14 vértices por pétalo × cientos de pétalos).
  const pts = [
    [0, -0.045],
    [0.032, -0.018],
    [0.03, 0.02],
    [0.006, 0.045],
    [-0.03, 0.02],
    [-0.032, -0.018],
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts.flatMap(([x, z]) => [x, 0, z]), 3));
  geo.setIndex([0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4]);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Pétalos caídos: una alfombra rosada bajo las copas, sobre el camino
 * del túnel y en la plaza. Estática (una sola malla instanciada).
 */
export function GroundPetals({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => buildGroundPetalGeometry(), []);
  const material = useMemo(
    () => new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, emissive: "#40202a", emissiveIntensity: 0.4 }),
    []
  );

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const random = createSeededRandom(2468);
    const color = new THREE.Color();
    const place = (i: number, x: number, z: number) => {
      dummy.position.set(x, heightAt(x, z) + 0.055, z);
      dummy.rotation.set((random() - 0.5) * 0.4, random() * Math.PI * 2, (random() - 0.5) * 0.4);
      const s = 0.8 + random() * 0.7;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(PETAL_TONES[Math.floor(random() * PETAL_TONES.length)]);
      mesh.setColorAt(i, color);
    };
    for (let i = 0; i < count; i++) {
      const roll = random();
      let x: number;
      let z: number;
      if (roll < 0.62) {
        // Bajo una copa: más denso cerca del borde de la sombra.
        const t = SAKURA_TREES[Math.floor(random() * SAKURA_TREES.length)];
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(random()) * 3 * t.scale;
        x = t.x + Math.cos(a) * r + Math.cos(t.yaw) * 0.8;
        z = t.z + Math.sin(a) * r - Math.sin(t.yaw) * 0.8;
      } else if (roll < 0.88) {
        // Sobre el camino principal, sobre todo en el túnel.
        const s = 26 + random() * (MAIN_PATH.length - 26);
        const p = samplePath(MAIN_PATH, s);
        const off = (random() - 0.5) * 2.6;
        x = p.x - p.tz * off;
        z = p.z + p.tx * off;
      } else {
        const a = random() * Math.PI * 2;
        const r = PLAZA.bedRadius + 0.2 + random() * (PLAZA.radius - PLAZA.bedRadius);
        x = PLAZA.x + Math.cos(a) * r;
        z = PLAZA.z + Math.sin(a) * r;
      }
      place(i, x, z);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [count]);

  return <instancedMesh ref={ref} args={[geometry, material, count]} receiveShadow />;
}
