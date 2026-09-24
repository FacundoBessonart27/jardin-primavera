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
import { registerFlowerMesh, unregisterFlowerMesh, trySelectPlacement } from "@/lib/flowerRegistry";

interface SpeciesGroupProps {
  speciesId: string;
  visual: FlowerVisual;
  placements: FlowerPlacement[];
  isSpecial: boolean;
  bloom: number;
}

const dummy = new THREE.Object3D();

// Dirección (normalizada) de la luz clave de la escena (ver
// GardenScene: directionalLight en [6, 9, 4]) y su color cálido,
// reutilizados para una simulación liviana de subsuperficie en los
// pétalos (ver material más abajo).
const SSS_LIGHT_DIR = new THREE.Vector3(6, 9, 4).normalize();
const SSS_LIGHT_COLOR = new THREE.Color("#ffcf8a");

function SpeciesGroup({ speciesId, visual, placements, isSpecial, bloom }: SpeciesGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(
    () => getFlowerGeometry(speciesId, visual, "field", bloom),
    [speciesId, visual, bloom]
  );
  const windTimeUniform = useRef({ value: 0 });
  const windStrengthUniform = useRef({ value: 0 });

  // MeshPhysicalMaterial en vez de Standard: un clearcoat muy sutil le
  // da a los pétalos un brillo tenue y orgánico (como una superficie
  // levemente cerosa) en vez del aspecto "plástico" de un material
  // puramente mate/difuso, sin agregar draw calls ni geometría extra.
  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.52,
      metalness: 0.02,
      clearcoat: 0.18,
      clearcoatRoughness: 0.45,
      side: THREE.DoubleSide,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSssLightDir = { value: SSS_LIGHT_DIR };
      shader.uniforms.uSssColor = { value: SSS_LIGHT_COLOR };
      shader.uniforms.uTime = windTimeUniform.current;
      shader.uniforms.uWindStrength = windStrengthUniform.current;
      shader.uniforms.uStemHeight = { value: visual.stemHeight };

      // Viento por vértice (mismo enfoque que Grass.tsx): cada pieza de
      // la flor (tallo, pétalo, hoja, estambre...) tiene su propia fase
      // horneada en `aWindPhase`, así no se mueven todas en bloque como
      // un único objeto rígido. El tallo (fase 0, y=0 en la base) casi
      // no se mueve cerca del suelo y flexiona un poco más cerca de la
      // cabeza floral; los pétalos, por encima de esa altura, además
      // "revolotean" un poco en Y con su propia fase.
      shader.vertexShader =
        `attribute float aWindPhase;\nattribute float aRoughOffset;\nvarying float vRoughOffset;\n` +
        `uniform float uTime;\nuniform float uWindStrength;\nuniform float uStemHeight;\n` +
        shader.vertexShader;
      // Un único reemplazo de `#include <begin_vertex>`: encadenar dos
      // `.replace()` sobre el mismo token haría que el segundo no
      // encuentre nada (el primero ya lo consumió), así que el bend de
      // viento y la variable de rugosidad se inyectan juntos acá.
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vRoughOffset = aRoughOffset;
        float windT = clamp(transformed.y / max(uStemHeight, 0.001), 0.0, 1.5);
        float stemBend = min(windT, 1.0);
        stemBend *= stemBend;
        float sway = sin(uTime * 1.15 + aWindPhase) * 0.03 * uWindStrength * stemBend;
        float sway2 = sin(uTime * 2.3 + aWindPhase * 1.7) * 0.014 * uWindStrength * stemBend;
        transformed.x += sway + sway2;
        transformed.z += cos(uTime * 0.95 + aWindPhase * 0.8) * 0.018 * uWindStrength * stemBend;
        float aboveHead = clamp(windT - 1.0, 0.0, 1.0);
        transformed.y += sin(uTime * 3.6 + aWindPhase * 2.1) * 0.01 * uWindStrength * aboveHead;`
      );
      shader.fragmentShader =
        `varying float vRoughOffset;\nuniform vec3 uSssLightDir;\nuniform vec3 uSssColor;\n` +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + vRoughOffset, 0.05, 1.0);`
      );

      // Simulación liviana de subsuperficie: cuando la luz clave queda
      // "detrás" de la cara visible de un pétalo (la normal mira en
      // sentido contrario a la luz), se filtra un poco del propio color
      // del pétalo, como pasa con pétalos finos a contraluz. Sin texturas
      // ni pasadas de render extra: sólo un par de líneas más en el
      // fragment shader que Three.js ya genera para este material.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <output_fragment>",
        `float sssBack = max(0.0, -dot(normalize(normal), uSssLightDir));
        float sssTerm = pow(sssBack, 1.6) * 0.4;
        outgoingLight += sssTerm * diffuseColor.rgb * uSssColor;
        #include <output_fragment>`
      );
    };

    return mat;
  }, [visual.stemHeight]);

  const bumpRef = useRef<Float32Array>(
    new Float32Array(placements.length).fill(1)
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const random = createSeededRandom(speciesId.length * 97 + placements.length);

    // Cuanto mayor `colorVariance` tenga la especie, más se nota la
    // diferencia de tono entre flores vecinas (más "natural", menos
    // flores clonadas idénticas una al lado de la otra).
    const variance = 0.08 + visual.colorVariance * 0.5;

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
      mesh.setColorAt(
        i,
        new THREE.Color(brightness, brightness, brightness * warmth)
      );
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    registerFlowerMesh(mesh, placements);
    return () => unregisterFlowerMesh(mesh);
  }, [placements, speciesId, visual.colorVariance]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    windTimeUniform.current.value = sceneUniforms.windTime;
    windStrengthUniform.current.value = sceneUniforms.windStrength;

    const { hoveredInstanceId, selected, foundSpecialFlower } =
      useExperienceStore.getState();

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const localProgress = clamp(
        (sceneUniforms.reveal - p.revealThreshold) / 0.22
      );
      const revealScale = Math.max(0, easeOutBack(localProgress));

      const isHovered = hoveredInstanceId === p.id;
      const isSelected = selected?.instanceId === p.id;
      const bumpTarget = isSelected ? 1.32 : isHovered ? 1.1 : 1;
      bumpRef.current[i] += (bumpTarget - bumpRef.current[i]) * 0.15;
      const bump = bumpRef.current[i] || 1;

      const windSway =
        Math.sin(sceneUniforms.windTime * 1.4 + p.windPhase) *
        0.05 *
        sceneUniforms.windStrength;
      const windTilt =
        Math.cos(sceneUniforms.windTime * 1.1 + p.windPhase * 1.3) *
        0.035 *
        sceneUniforms.windStrength;

      const specialPulse =
        isSpecial && !foundSpecialFlower
          ? 1 + Math.sin(sceneUniforms.windTime * 1.8) * 0.015
          : 1;

      const groundY = heightAt(p.position[0], p.position[2]);
      dummy.position.set(
        p.position[0],
        groundY + (isSelected ? 0.06 : 0),
        p.position[2]
      );
      dummy.rotation.set(
        windTilt + p.leanX,
        p.rotationY + windSway,
        windSway * 0.6 + p.leanZ
      );
      const s = revealScale * p.scaleVariance * bump * specialPulse;
      dummy.scale.set(s * p.stretch, s, s * p.stretch);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
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
