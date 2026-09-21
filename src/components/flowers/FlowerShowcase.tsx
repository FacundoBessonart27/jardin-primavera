"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { FlowerVisual } from "@/data/flowers";
import { getFlowerGeometry } from "./flowerGeometryCache";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

function ShowcaseFlower({
  speciesId,
  visual,
}: {
  speciesId: string;
  visual: FlowerVisual;
}) {
  const geometry = useMemo(
    () => getFlowerGeometry(speciesId, visual, "showcase"),
    [speciesId, visual]
  );

  return (
    <mesh geometry={geometry} position={[0, -visual.stemHeight * 0.62, 0]}>
      <meshStandardMaterial
        vertexColors
        roughness={0.45}
        metalness={0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * Mini escena 3D dedicada a una sola flor: se puede rotar, hacer zoom
 * y gira sola suavemente. Usa la misma geometría procedural que el
 * campo, pero con más detalle (ver flowerGeometry.ts, detail:"showcase").
 */
export function FlowerShowcase({
  speciesId,
  visual,
}: {
  speciesId: string;
  visual: FlowerVisual;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <div className="h-56 w-full sm:h-64">
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 0.5, 2.5], fov: 36 }}
      >
        <ambientLight intensity={0.95} color="#fff3e0" />
        <directionalLight position={[3, 4, 2]} intensity={1.5} color="#ffdca8" />
        <directionalLight position={[-3, 1.5, -2]} intensity={0.5} color="#c084fc" />
        <Suspense fallback={null}>
          <ShowcaseFlower speciesId={speciesId} visual={visual} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          minDistance={1.3}
          maxDistance={3.6}
          autoRotate={!prefersReducedMotion}
          autoRotateSpeed={1.8}
          rotateSpeed={0.55}
          enableDamping
          dampingFactor={0.1}
        />
      </Canvas>
    </div>
  );
}
