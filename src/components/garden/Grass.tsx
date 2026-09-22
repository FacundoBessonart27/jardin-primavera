"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createSeededRandom } from "@/lib/random";
import { sceneUniforms } from "@/lib/sceneUniforms";
import { heightAt } from "@/lib/terrain";

const BLADE_HEIGHT = 0.5;

function createBladeGeometry() {
  // Perfil de 4 anillos (base → punta) para que el shader pueda doblar
  // más la punta que la base.
  const heights = [0, 0.18, 0.34, BLADE_HEIGHT];
  const widths = [0.045, 0.035, 0.02, 0.0];
  const positions: number[] = [];
  const indices: number[] = [];

  heights.forEach((h, i) => {
    positions.push(-widths[i], h, 0, widths[i], h, 0);
  });

  for (let i = 0; i < heights.length - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

interface GrassProps {
  count: number;
  windStrength: number;
}

/** Césped instanciado con viento animado por shader (GPU), evita tener
 * que actualizar miles de matrices por frame en el hilo principal. */
export function Grass({ count, windStrength }: GrassProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const timeUniform = useRef({ value: 0 });
  const windUniform = useRef({ value: windStrength });

  const geometry = useMemo(() => createBladeGeometry(), []);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#3f8c5c"),
      roughness: 1,
      side: THREE.DoubleSide,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeUniform.current;
      shader.uniforms.uWindStrength = windUniform.current;

      shader.vertexShader =
        `attribute float aPhase;\nuniform float uTime;\nuniform float uWindStrength;\n` +
        shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float bend = clamp(position.y / ${BLADE_HEIGHT.toFixed(2)}, 0.0, 1.0);
        bend *= bend;
        float sway = sin(uTime * 1.6 + aPhase) * 0.28 * uWindStrength;
        float sway2 = sin(uTime * 3.4 + aPhase * 1.9) * 0.1 * uWindStrength;
        transformed.x += (sway + sway2) * bend;
        transformed.z += cos(uTime * 1.1 + aPhase) * 0.12 * uWindStrength * bend;`
      );
      mat.userData.shader = shader;
    };

    return mat;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const random = createSeededRandom(9911);
    const dummy = new THREE.Object3D();
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const radius = Math.sqrt(random()) * 20;
      const angle = random() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 3;

      dummy.position.set(x, heightAt(x, z), z);
      dummy.rotation.y = random() * Math.PI * 2;
      const s = 0.7 + random() * 0.8;
      dummy.scale.set(s, s * (0.7 + random() * 0.6), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      phases[i] = random() * Math.PI * 2;
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.setAttribute(
      "aPhase",
      new THREE.InstancedBufferAttribute(phases, 1)
    );
  }, [count]);

  useFrame(() => {
    timeUniform.current.value = sceneUniforms.windTime;
    windUniform.current.value = windStrength * sceneUniforms.windStrength;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      frustumCulled={false}
    />
  );
}
