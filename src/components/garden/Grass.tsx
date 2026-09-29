"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createSeededRandom } from "@/lib/random";
import { sceneUniforms } from "@/lib/sceneUniforms";
import { heightAt } from "@/lib/terrain";
import {
  BOUNDARY,
  FLOWER_BEDS,
  PATHS,
  PLAZA,
  SHRINE,
  bedRadius,
  boundaryRadius,
  pathEdgeDistance,
  pondRadius,
  samplePath,
  streamDistance,
} from "@/lib/gardenPlan";

/** Donde puede crecer un mechón: no sobre los caminos, el agua, la
 * plaza ni el zócalo del santuario, y poco dentro de los canteros. */
function isGrassSpot(x: number, z: number, random: () => number): boolean {
  if (boundaryRadius(x, z) > 1.12) return false;
  if (pathEdgeDistance(x, z) < -0.05) return false;
  if (pondRadius(x, z) < 1.18 || streamDistance(x, z) < 1.35) return false;
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.radius + 0.15) return false;
  if (
    Math.abs(x - SHRINE.x) < SHRINE.plinthW / 2 + 0.2 &&
    Math.abs(z - SHRINE.z) < SHRINE.plinthD / 2 + SHRINE.stepsDepth + 0.2
  ) {
    return false;
  }
  for (const b of FLOWER_BEDS) {
    if (bedRadius(b, x, z) < 0.8 && random() < 0.75) return false;
  }
  return true;
}

const BLADE_HEIGHT = 0.5;

function createBladeGeometry() {
  // Perfil de 4 anillos (base → punta) para que el shader pueda doblar
  // más la punta que la base.
  const heights = [0, 0.18, 0.34, BLADE_HEIGHT];
  const widths = [0.045, 0.035, 0.02, 0.0];
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const base = new THREE.Color("#245c38");
  const tip = new THREE.Color("#6fb35a");

  heights.forEach((h, i) => {
    positions.push(-widths[i], h, 0, widths[i], h, 0);
    const c = base.clone().lerp(tip, Math.pow(h / BLADE_HEIGHT, 0.8));
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
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
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
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
    // Lambert: mismo aspecto mate que antes (rugosidad 1) pero bastante
    // más barato por píxel, que en el pasto se nota.
    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
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

    const pathLengths = PATHS.map((p) => p.length);
    const totalPath = pathLengths.reduce((a, b) => a + b, 0);

    for (let i = 0; i < count; i++) {
      // Dos tercios del pasto acompañan los caminos (donde se camina y
      // se mira de cerca); el resto se reparte por todo el valle.
      let x = 0;
      let z = 0;
      for (let attempt = 0; attempt < 12; attempt++) {
        if (random() < 0.66) {
          let pick = random() * totalPath;
          let pi = 0;
          while (pick > pathLengths[pi] && pi < PATHS.length - 1) pick -= pathLengths[pi++];
          const p = samplePath(PATHS[pi], pick);
          const side = random() < 0.5 ? -1 : 1;
          const off = side * (PATHS[pi].halfWidth + 0.05 + Math.pow(random(), 1.6) * 5);
          x = p.x - p.tz * off;
          z = p.z + p.tx * off;
        } else {
          const radius = Math.sqrt(random()) * 1.1;
          const angle = random() * Math.PI * 2;
          x = BOUNDARY.cx + Math.cos(angle) * radius * BOUNDARY.rx;
          z = BOUNDARY.cz + Math.sin(angle) * radius * BOUNDARY.rz;
        }
        if (isGrassSpot(x, z, random)) break;
      }

      dummy.position.set(x, heightAt(x, z), z);
      dummy.rotation.y = random() * Math.PI * 2;
      const s = 0.7 + random() * 0.8;
      dummy.scale.set(s, s * (0.7 + random() * 0.6), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Variación sutil de tono por mata: evita que todo el pasto se
      // vea de exactamente el mismo verde.
      const tint = 0.82 + random() * 0.36;
      const warmth = 0.94 + random() * 0.18;
      mesh.setColorAt(i, new THREE.Color(tint * warmth, tint, tint * 0.94));

      phases[i] = random() * Math.PI * 2;
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
