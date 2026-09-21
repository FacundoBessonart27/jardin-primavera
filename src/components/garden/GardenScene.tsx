"use client";

import { Suspense } from "react";
import { Sky } from "./Sky";
import { Ground } from "./Ground";
import { Grass } from "./Grass";
import { Clouds } from "./Clouds";
import { Butterflies } from "./Butterflies";
import { PetalParticles } from "./PetalParticles";
import { FlowerField } from "./FlowerField";
import { CameraRig } from "./CameraRig";
import { SceneTicker } from "./SceneTicker";
import type { QualitySettings } from "@/lib/quality";

export function GardenScene({ quality }: { quality: QualitySettings }) {
  return (
    <>
      <SceneTicker />
      <CameraRig />

      <fog attach="fog" args={["#c97a6d", 14, 42]} />

      <ambientLight intensity={0.65} color="#ffe3c2" />
      <directionalLight
        position={[6, 9, 4]}
        intensity={1.4}
        color="#ffd9a0"
        castShadow={quality.shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      <hemisphereLight
        color="#ffcf9e"
        groundColor="#1f4f35"
        intensity={0.5}
      />

      <Sky />
      <Ground shadows={quality.shadows} />
      <Grass count={quality.grassCount} windStrength={1} />

      <Suspense fallback={null}>
        <FlowerField count={quality.flowerCount} />
      </Suspense>

      <Butterflies count={quality.butterflyCount} />
      <PetalParticles count={quality.petalCount} />
    </>
  );
}
