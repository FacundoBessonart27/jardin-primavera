"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { regularFlowerSpecies, specialFlower, type FlowerVisual } from "@/data/flowers";
import { getFlowerGeometry } from "@/components/flowers/flowerGeometryCache";
import { generateFieldLayout, type FlowerPlacement } from "./fieldLayout";
import { useExperienceStore } from "@/store/experienceStore";
import { sceneUniforms } from "@/lib/sceneUniforms";
import { clamp, easeOutBack } from "@/lib/easing";
import { createSeededRandom } from "@/lib/random";
import { heightAt } from "@/lib/terrain";
import { playerState } from "@/lib/playerState";
import { registerFlowerMesh, unregisterFlowerMesh, trySelectPlacement } from "@/lib/flowerRegistry";

interface SpeciesGroupProps {
  speciesId: string;
  visual: FlowerVisual;
  placements: FlowerPlacement[];
  isSpecial: boolean;
  bloom: number;
}

const dummy = new THREE.Object3D();
const _color = new THREE.Color();

// Dirección (normalizada) de la luz clave de la escena (ver
// GardenScene: directionalLight en [6, 9, 4]) y su color cálido,
// reutilizados para una simulación liviana de subsuperficie en los
// pétalos (ver material más abajo).
const SSS_LIGHT_DIR = new THREE.Vector3(6, 9, 4).normalize();
const SSS_LIGHT_COLOR = new THREE.Color("#ffcf8a");

/** Distancia (en el plano) a la que una flor empieza a "notar" al
 * jugador que se acerca caminando. */
const PROXIMITY_RADIUS = 1.7;

const windUniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 1 },
};

let sharedFlowerMaterial: THREE.MeshPhysicalMaterial | null = null;

/**
 * Material ÚNICO para todas las flores del campo (un solo programa de
 * shader para todas las especies y variantes):
 *  - MeshPhysicalMaterial con un "sheen" suave (el brillo aterciopelado
 *    de los pétalos reales) y un clearcoat muy leve, en vez del aspecto
 *    plástico de un material mate plano.
 *  - Subsuperficie liviana: a contraluz, el pétalo deja pasar un poco de
 *    su propio color.
 *  - Rugosidad levemente distinta por pieza (atributo horneado).
 *  - Viento por vértice: el tallo se flexiona con una fase propia de cada
 *    planta (tomada de su posición, así ninguna se mueve sincronizada con
 *    la vecina), ráfagas lentas que recorren el campo, y un aleteo sutil
 *    de pétalos y hojas que mueve las puntas sin despegar las bases.
 */
function getFlowerMaterial(): THREE.MeshPhysicalMaterial {
  if (sharedFlowerMaterial) return sharedFlowerMaterial;

  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.52,
    metalness: 0.02,
    clearcoat: 0.12,
    clearcoatRoughness: 0.45,
    sheen: 0.35,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color("#fff0f5"),
    side: THREE.DoubleSide,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSssLightDir = { value: SSS_LIGHT_DIR };
    shader.uniforms.uSssColor = { value: SSS_LIGHT_COLOR };
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;

    shader.vertexShader =
      `attribute float aWindPhase;\nattribute float aRoughOffset;\n` +
      `attribute float aFlex;\nattribute float aBend;\nvarying float vRoughOffset;\n` +
      `uniform float uTime;\nuniform float uWindStrength;\n` +
      shader.vertexShader;
    // Un único reemplazo de `#include <begin_vertex>` (encadenar dos
    // sobre el mismo token haría que el segundo no encuentre nada).
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vRoughOffset = aRoughOffset;
      #ifdef USE_INSTANCING
        vec2 plantXZ = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 plantXZ = vec2(0.0);
      #endif
      float plantPhase = dot(plantXZ, vec2(0.61, 0.43));
      float gust = 0.6 + 0.4 * sin(uTime * 0.45 - dot(plantXZ, vec2(0.22, 0.14)));
      float windAmp = uWindStrength * gust;
      float sway = sin(uTime * 1.15 + plantPhase) * 0.03 + sin(uTime * 2.3 + plantPhase * 1.7) * 0.012;
      transformed.x += sway * windAmp * aBend;
      transformed.z += cos(uTime * 0.95 + plantPhase * 0.8) * 0.018 * windAmp * aBend;
      float flutterPhase = aWindPhase + plantPhase;
      transformed.y += sin(uTime * 3.1 + flutterPhase) * 0.016 * windAmp * aFlex;
      transformed.x += sin(uTime * 2.4 + flutterPhase * 1.3) * 0.01 * windAmp * aFlex;
      transformed.z += cos(uTime * 2.7 + flutterPhase * 0.7) * 0.008 * windAmp * aFlex;`
    );

    shader.fragmentShader =
      `varying float vRoughOffset;\nuniform vec3 uSssLightDir;\nuniform vec3 uSssColor;\n` +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + vRoughOffset, 0.05, 1.0);`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <output_fragment>",
      `float sssBack = max(0.0, -dot(normalize(normal), uSssLightDir));
      float sssTerm = pow(sssBack, 1.6) * 0.4;
      outgoingLight += sssTerm * diffuseColor.rgb * uSssColor;
      #include <output_fragment>`
    );
  };

  sharedFlowerMaterial = mat;
  return mat;
}

function SpeciesGroup({ speciesId, visual, placements, isSpecial, bloom }: SpeciesGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(
    () => getFlowerGeometry(speciesId, visual, "field", bloom),
    [speciesId, visual, bloom]
  );
  const material = useMemo(() => getFlowerMaterial(), []);

  const bumpRef = useRef<Float32Array>(new Float32Array(placements.length).fill(1));
  /** Brillo cálido por flor (0..1): apuntada/seleccionada o cercana. */
  const glowRef = useRef<Float32Array>(new Float32Array(placements.length));
  /** Color base de cada instancia (variación natural de tono). */
  const baseColorsRef = useRef<Float32Array>(new Float32Array(placements.length * 3));

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const random = createSeededRandom(speciesId.length * 97 + placements.length);

    // Cuanto mayor `colorVariance` tenga la especie, más se nota la
    // diferencia de tono entre flores vecinas (más "natural", menos
    // flores clonadas idénticas una al lado de la otra).
    const variance = 0.08 + visual.colorVariance * 0.5;
    const baseColors = new Float32Array(placements.length * 3);

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const [x, , z] = p.position;
      dummy.position.set(x, heightAt(x, z), z);
      dummy.rotation.set(0, p.rotationY, 0);
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const brightness = 1 + (random() - 0.5) * variance;
      const warmth = 1 + (random() - 0.5) * variance * 0.6;
      baseColors[i * 3] = brightness;
      baseColors[i * 3 + 1] = brightness;
      baseColors[i * 3 + 2] = brightness * warmth;
      mesh.setColorAt(i, _color.setRGB(brightness, brightness, brightness * warmth));
    }
    baseColorsRef.current = baseColors;
    glowRef.current = new Float32Array(placements.length);
    bumpRef.current = new Float32Array(placements.length).fill(1);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    registerFlowerMesh(mesh, placements);
    return () => unregisterFlowerMesh(mesh);
  }, [placements, speciesId, visual.colorVariance]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    windUniforms.uTime.value = sceneUniforms.windTime;
    windUniforms.uWindStrength.value = sceneUniforms.windStrength;

    const { hoveredInstanceId, selected, foundSpecialFlower, phase } =
      useExperienceStore.getState();
    const exploring = phase === "garden";
    const px = playerState.position.x;
    const pz = playerState.position.z;
    const glow = glowRef.current;
    const baseColors = baseColorsRef.current;
    let colorsChanged = false;

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const localProgress = clamp((sceneUniforms.reveal - p.revealThreshold) / 0.22);
      const revealScale = Math.max(0, easeOutBack(localProgress));

      const isHovered = hoveredInstanceId === p.id;
      const isSelected = selected?.instanceId === p.id;

      // Cercanía del jugador: las flores junto a las que se camina se
      // "despiertan" apenas (un poco más grandes y luminosas), muy sutil.
      let proximity = 0;
      if (exploring) {
        const d = Math.hypot(p.position[0] - px, p.position[2] - pz);
        if (d < PROXIMITY_RADIUS) proximity = 1 - d / PROXIMITY_RADIUS;
      }

      const bumpTarget = isSelected ? 1.32 : isHovered ? 1.1 : 1 + proximity * 0.035;
      bumpRef.current[i] += (bumpTarget - bumpRef.current[i]) * 0.15;
      const bump = bumpRef.current[i] || 1;

      const glowTarget = isSelected ? 0.35 : isHovered ? 0.28 : proximity * 0.08;
      const glowNext = glow[i] + (glowTarget - glow[i]) * 0.12;
      if (Math.abs(glowNext - glow[i]) > 0.0005) {
        glow[i] = glowNext;
        const g = 1 + glowNext;
        mesh.setColorAt(
          i,
          _color.setRGB(
            baseColors[i * 3] * g * (1 + glowNext * 0.1),
            baseColors[i * 3 + 1] * g,
            baseColors[i * 3 + 2] * g * (1 - glowNext * 0.15)
          )
        );
        colorsChanged = true;
      }

      // Balanceo general de la planta (el shader agrega la flexión del
      // tallo y el aleteo de pétalos y hojas). Una flor apuntada se mece
      // apenas más, como si reaccionara.
      const reaction = 1 + glow[i] * 1.2;
      const windSway =
        Math.sin(sceneUniforms.windTime * 1.4 + p.windPhase) * 0.035 * sceneUniforms.windStrength * reaction;
      const windTilt =
        Math.cos(sceneUniforms.windTime * 1.1 + p.windPhase * 1.3) * 0.025 * sceneUniforms.windStrength * reaction;

      const specialPulse =
        isSpecial && !foundSpecialFlower
          ? 1 + Math.sin(sceneUniforms.windTime * 1.8) * 0.015
          : 1;

      const groundY = heightAt(p.position[0], p.position[2]);
      dummy.position.set(p.position[0], groundY + (isSelected ? 0.06 : 0), p.position[2]);
      dummy.rotation.set(windTilt + p.leanX, p.rotationY + windSway, windSway * 0.6 + p.leanZ);
      const s = revealScale * p.scaleVariance * bump * specialPulse;
      dummy.scale.set(s * p.stretch, s * p.heightVar, s * p.stretch);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (colorsChanged && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  // Con el mouse bloqueado (modo caminar de escritorio), la selección
  // pasa por la mira central (ver FirstPersonControls + flowerRegistry),
  // no por la posición real -congelada- del cursor. En ese caso estos
  // handlers de R3F se desactivan para no pelear con el raycast manual.
  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (document.pointerLockElement) return;
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    const placement = placements[e.instanceId];
    useExperienceStore.getState().setHovered(placement.id);
    document.body.style.cursor = "pointer";
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    if (document.pointerLockElement) return;
    e.stopPropagation();
    useExperienceStore.getState().setHovered(null);
    document.body.style.cursor = "auto";
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (document.pointerLockElement) return;
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    trySelectPlacement(placements[e.instanceId]);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, placements.length]}
      castShadow
      receiveShadow
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    />
  );
}

// bloom (0..1) por variante: 0 = capullo bien cerrado, 1 = entreabierta,
// 2 = flor completamente abierta.
const BLOOM_BY_VARIANT: Record<0 | 1 | 2, number> = { 0: 0.12, 1: 0.55, 2: 1 };

export function FlowerField({ count }: { count: number }) {
  const layout = useMemo(() => generateFieldLayout(count), [count]);

  const grouped = useMemo(() => {
    const map = new Map<string, FlowerPlacement[]>();
    for (const placement of layout) {
      const key = `${placement.speciesId}:${placement.bloomVariant}`;
      const list = map.get(key) ?? [];
      list.push(placement);
      map.set(key, list);
    }
    return map;
  }, [layout]);

  return (
    <group>
      {[...regularFlowerSpecies, specialFlower].flatMap((species) =>
        ([0, 1, 2] as const).map((variant) => {
          const placements = grouped.get(`${species.id}:${variant}`);
          if (!placements || placements.length === 0) return null;
          return (
            <SpeciesGroup
              key={`${species.id}:${variant}`}
              speciesId={species.id}
              visual={species.visual}
              placements={placements}
              isSpecial={Boolean(species.isSpecial)}
              bloom={BLOOM_BY_VARIANT[variant]}
            />
          );
        })
      )}
    </group>
  );
}
