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
import { getSakuraVariant, SAKURA_VARIANT_COUNT } from "./sakuraGeometry";

const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

/** Balanceo suave de la copa en el vertex shader: más arriba, más se
 * mueve; cada árbol con su propia fase (tomada de su posición). */
function withCanopyWind<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = `uniform float uTime;\nuniform float uWind;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 treeXZ = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 treeXZ = vec2(0.0);
      #endif
      float phase = dot(treeXZ, vec2(0.37, 0.61));
      float reach = smoothstep(1.5, 5.5, position.y);
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

/**
 * Cerezos en flor a los lados del camino principal (y un túnel donde
 * las copas se juntan por encima), más algunos en los lazos y el gran
 * "árbol madre" junto al santuario. Todos los árboles comparten tres
 * variantes de geometría, dibujadas con InstancedMesh: 3 piezas × 3
 * variantes = 9 draw calls para toda la arboleda.
 */
export function SakuraGrove({ detail, shadows }: { detail: number; shadows: boolean }) {
  const variants = useMemo(
    () => Array.from({ length: SAKURA_VARIANT_COUNT }, (_, i) => getSakuraVariant(i, detail)),
    [detail]
  );
  const byVariant = useMemo(
    () =>
      Array.from({ length: SAKURA_VARIANT_COUNT }, (_, v) =>
        SAKURA_TREES.map((t, i) => ({ t, i })).filter(({ t }) => t.variant === v).map(({ i }) => i)
      ),
    []
  );

  const materials = useMemo(
    () => ({
      trunk: new THREE.MeshLambertMaterial({ vertexColors: true }),
      blobs: withCanopyWind(
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

  useFrame(() => {
    windUniforms.uTime.value = sceneUniforms.windTime;
    windUniforms.uWind.value = sceneUniforms.windStrength;
  });

  return (
    <group>
      {variants.map((variant, v) => (
        <VariantInstances
          key={`${v}-${detail}`}
          indices={byVariant[v]}
          trunk={variant.trunk}
          blobs={variant.blobs}
          cards={variant.cards}
          materials={materials}
          shadows={shadows}
        />
      ))}
    </group>
  );
}

function VariantInstances({
  indices,
  trunk,
  blobs,
  cards,
  materials,
  shadows,
}: {
  indices: number[];
  trunk: THREE.BufferGeometry;
  blobs: THREE.BufferGeometry;
  cards: THREE.BufferGeometry;
  materials: { trunk: THREE.Material; blobs: THREE.Material; cards: THREE.Material };
  shadows: boolean;
}) {
  const refs = [
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
  ];

  useEffect(() => {
    const m = new THREE.Matrix4();
    for (const ref of refs) {
      const mesh = ref.current;
      if (!mesh) continue;
      indices.forEach((treeIndex, i) => mesh.setMatrixAt(i, treeMatrix(treeIndex, m)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 1.5;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indices, trunk, blobs, cards]);

  if (indices.length === 0) return null;
  return (
    <>
      <instancedMesh ref={refs[0]} args={[trunk, materials.trunk, indices.length]} castShadow={shadows} receiveShadow />
      <instancedMesh ref={refs[1]} args={[blobs, materials.blobs, indices.length]} castShadow={shadows} receiveShadow />
      <instancedMesh ref={refs[2]} args={[cards, materials.cards, indices.length]} receiveShadow />
    </>
  );
}

/** Puntos (en el mundo) de donde nacen los pétalos: los racimos de cada
 * copa. Se calculan una sola vez. */
function blossomWorldPoints(): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const m = new THREE.Matrix4();
  SAKURA_TREES.forEach((t, i) => {
    const variant = getSakuraVariant(t.variant, 1);
    treeMatrix(i, m);
    for (const c of variant.clusters) points.push(c.clone().applyMatrix4(m));
  });
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
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.045);
  shape.bezierCurveTo(0.04, -0.03, 0.035, 0.03, 0.008, 0.045);
  shape.lineTo(-0.008, 0.045);
  shape.bezierCurveTo(-0.035, 0.03, -0.04, -0.03, 0, -0.045);
  const geo = new THREE.ShapeGeometry(shape, 3);
  geo.rotateX(-Math.PI / 2);
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
