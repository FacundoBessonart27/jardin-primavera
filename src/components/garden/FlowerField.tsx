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

function SpeciesGroup({ speciesId, visual, placements, isSpecial, bloom }: SpeciesGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(
    () => getFlowerGeometry(speciesId, visual, "field", bloom),
    [speciesId, visual, bloom]
  );
  // MeshPhysicalMaterial en vez de Standard: un clearcoat muy sutil le
  // da a los pétalos un brillo tenue y orgánico (como una superficie
  // levemente cerosa) en vez del aspecto "plástico" de un material
  // puramente mate/difuso, sin agregar draw calls ni geometría extra.
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.52,
        metalness: 0.02,
        clearcoat: 0.18,
        clearcoatRoughness: 0.45,
        side: THREE.DoubleSide,
      }),
    []
  );

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
      dummy.scale.setScalar(revealScale * p.scaleVariance * bump * specialPulse);
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

// bloom (0..1) por variante: la "0" no es un capullo totalmente cerrado
// (se seguiría viendo raro sin pétalos), sino una flor entreabierta.
const BLOOM_BY_VARIANT: Record<0 | 1, number> = { 0: 0.42, 1: 1 };

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
        ([0, 1] as const).map((variant) => {
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
