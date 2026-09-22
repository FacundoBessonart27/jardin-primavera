"use client";

import { Suspense } from "react";
import { Sky } from "./Sky";
import { Ground } from "./Ground";
import { Grass } from "./Grass";
import { Clouds } from "./Clouds";
import { Butterflies } from "./Butterflies";
import { PetalParticles } from "./PetalParticles";
import { FlowerField } from "./FlowerField";
import { Shrubs } from "./Shrubs";
import { GroundLitter } from "./GroundLitter";
import { CameraRig } from "./CameraRig";
import { SceneTicker } from "./SceneTicker";
import type { QualitySettings } from "@/lib/quality";

export function GardenScene({ quality }: { quality: QualitySettings }) {
  return (
    <>
      <SceneTicker />
      <CameraRig />

      <fog attach="fog" args={["#c97a6d", 14, 42]} />

      <ambientLight intensity={0.58} color="#ffe3c2" />
      <directionalLight
        position={[6, 9, 4]}
        intensity={1.55}
        color="#ffd9a0"
        castShadow={quality.shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0003}
      />
      {/* Luz de relleno tenue y fría desde el lado opuesto: le da algo
          de profundidad a las sombras sin oscurecer la escena. */}
      <directionalLight position={[-7, 4, -6]} intensity={0.3} color="#c9a3ff" />
      <hemisphereLight
        color="#ffcf9e"
        groundColor="#1f4f35"
        intensity={0.5}
      />

      <Sky />
      <Ground shadows={quality.shadows} />
      <Grass count={quality.grassCount} windStrength={1} />
      <Shrubs count={quality.shrubCount} />
      <GroundLitter count={quality.litterCount} />

      <Suspense fallback={null}>
        <FlowerField count={quality.flowerCount} />
      </Suspense>

      <Butterflies count={quality.butterflyCount} />
      <PetalParticles count={quality.petalCount} />
    </>
  );
}
