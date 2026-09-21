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

interface SpeciesGroupProps {
  speciesId: string;
  visual: FlowerVisual;
  placements: FlowerPlacement[];
  isSpecial: boolean;
}

const dummy = new THREE.Object3D();

function SpeciesGroup({ speciesId, visual, placements, isSpecial }: SpeciesGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(
    () => getFlowerGeometry(speciesId, visual, "field"),
    [speciesId, visual]
  );
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.55,
        metalness: 0.05,
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

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      dummy.position.set(...p.position);
      dummy.rotation.set(0, p.rotationY, 0);
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const tint = 0.9 + random() * 0.2;
      mesh.setColorAt(
        i,
        new THREE.Color(tint, tint, tint * (0.97 + random() * 0.06))
      );
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [placements, speciesId]);

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

      dummy.position.set(
        p.position[0],
        p.position[1] + (isSelected ? 0.06 : 0),
        p.position[2]
      );
      dummy.rotation.set(windTilt, p.rotationY + windSway, windSway * 0.6);
      dummy.scale.setScalar(revealScale * p.scaleVariance * bump * specialPulse);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    const placement = placements[e.instanceId];
    useExperienceStore.getState().setHovered(placement.id);
    document.body.style.cursor = "pointer";
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useExperienceStore.getState().setHovered(null);
    document.body.style.cursor = "auto";
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    const placement = placements[e.instanceId];
    if (sceneUniforms.reveal < placement.revealThreshold + 0.15) return;
    useExperienceStore.getState().selectFlower({
      instanceId: placement.id,
      speciesId: placement.speciesId,
      isSpecial: placement.isSpecial,
      position: placement.position,
    });
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

export function FlowerField({ count }: { count: number }) {
  const layout = useMemo(() => generateFieldLayout(count), [count]);

  const grouped = useMemo(() => {
    const map = new Map<string, FlowerPlacement[]>();
    for (const placement of layout) {
      const list = map.get(placement.speciesId) ?? [];
      list.push(placement);
      map.set(placement.speciesId, list);
    }
    return map;
  }, [layout]);

  return (
    <group>
      {[...regularFlowerSpecies, specialFlower].map((species) => {
        const placements = grouped.get(species.id);
        if (!placements || placements.length === 0) return null;
        return (
          <SpeciesGroup
            key={species.id}
            speciesId={species.id}
            visual={species.visual}
            placements={placements}
            isSpecial={Boolean(species.isSpecial)}
          />
        );
      })}
    </group>
  );
}
