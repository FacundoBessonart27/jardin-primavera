"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createSeededRandom } from "@/lib/random";
import { createWingTexture } from "@/lib/proceduralTextures";
import { FLOWER_BEDS } from "@/lib/gardenPlan";

interface ButterflyParams {
  colorIndex: number;
  radiusX: number;
  radiusZ: number;
  centerX: number;
  centerZ: number;
  baseY: number;
  speed: number;
  phase: number;
}

const BUTTERFLY_COLORS = ["#ffd166", "#f0468a", "#ffffff", "#b399ff"];

/** Las cuatro alas de color en una sola textura (atlas horizontal). */
function createWingAtlas(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size * BUTTERFLY_COLORS.length;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  BUTTERFLY_COLORS.forEach((color, i) => {
    const wing = createWingTexture(size, color).image as HTMLCanvasElement;
    ctx.drawImage(wing, i * size, 0);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Dos alas (una a cada lado del cuerpo). `aSide` = -1 izquierda, +1
 * derecha: el shader las hace aletear girando alrededor del cuerpo. */
function buildWingsGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const side: number[] = [];
  const indices: number[] = [];
  for (const s of [-1, 1]) {
    const base = positions.length / 3;
    // El ala va desde el cuerpo (x = 0) hacia afuera; la textura tiene
    // la raíz del ala a la izquierda.
    const corners = [
      [0, -0.5, 0, 0],
      [s, -0.5, 1, 0],
      [s, 0.5, 1, 1],
      [0, 0.5, 0, 1],
    ];
    for (const [x, y, u, v] of corners) {
      positions.push(x * 0.5, y * 0.5, 0);
      uvs.push(u, v);
      side.push(s);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const dummy = new THREE.Object3D();

/**
 * Mariposas revoloteando sobre los canteros. Todas juntas son una sola
 * malla instanciada (antes eran dos mallas por mariposa): el aleteo lo
 * hace el shader y cada mariposa elige su color en un atlas de alas.
 */
export function Butterflies({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => buildWingsGeometry(), []);
  const time = useRef({ value: 0 });

  const list = useMemo<ButterflyParams[]>(() => {
    const random = createSeededRandom(3131);
    // Cada mariposa revolotea sobre un cantero, repartidas a lo largo del
    // recorrido (las primeras, cerca de la entrada).
    const step = FLOWER_BEDS.length / Math.max(1, count);
    return Array.from({ length: count }, (_, i) => {
      const bed = FLOWER_BEDS[Math.min(FLOWER_BEDS.length - 1, Math.floor(i * step))];
      return {
        colorIndex: Math.floor(random() * BUTTERFLY_COLORS.length),
        radiusX: bed.rx * (0.6 + random() * 0.5),
        radiusZ: bed.rz * (0.6 + random() * 0.5),
        centerX: bed.x,
        centerZ: bed.z,
        baseY: 1.1 + random() * 1.1,
        speed: 0.25 + random() * 0.2,
        phase: random() * Math.PI * 2,
      };
    });
  }, [count]);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: createWingAtlas(),
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
      emissive: new THREE.Color("#ffffff"),
      emissiveIntensity: 0.12,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time.current;
      shader.vertexShader = `attribute float aSide;\nattribute vec3 aWing;\nuniform float uTime;\n${shader.vertexShader}`
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          // Aleteo: cada ala gira alrededor del cuerpo (eje Y local).
          float flap = sin((uTime * aWing.x + aWing.y) * 22.0) * 0.9 * aSide;
          float c = cos(flap);
          float s = sin(flap);
          transformed = vec3(transformed.x * c, transformed.y, -transformed.x * s);`
        )
        .replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>
          #ifdef USE_MAP
            vMapUv.x = (vMapUv.x + aWing.z) * ${(1 / BUTTERFLY_COLORS.length).toFixed(4)};
          #endif`
        );
    };
    return m;
  }, []);

  useEffect(() => {
    // Velocidad, fase y color de cada mariposa (fijos).
    const wing = new Float32Array(count * 3);
    list.forEach((p, i) => wing.set([p.speed, p.phase, p.colorIndex], i * 3));
    geometry.setAttribute("aWing", new THREE.InstancedBufferAttribute(wing, 3));
  }, [geometry, list, count]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const elapsed = clock.getElapsedTime();
    time.current.value = elapsed;
    list.forEach((params, i) => {
      const t = elapsed * params.speed + params.phase;
      const x = params.centerX + Math.cos(t) * params.radiusX;
      const z = params.centerZ + Math.sin(t * 1.3) * params.radiusZ;
      const y = params.baseY + Math.sin(t * 2.1) * 0.3;
      dummy.position.set(x, y, z);
      const nextX = params.centerX + Math.cos(t + 0.05) * params.radiusX;
      const nextZ = params.centerZ + Math.sin((t + 0.05) * 1.3) * params.radiusZ;
      dummy.lookAt(nextX, y, nextZ);
      dummy.scale.setScalar(0.26);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;
  return <instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} />;
}
