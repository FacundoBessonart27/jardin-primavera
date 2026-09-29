"use client";

import { Suspense } from "react";
import { Sky } from "./Sky";
import { Atmosphere } from "./Atmosphere";
import { Landscape } from "./Landscape";
import { Ground } from "./Ground";
import { GardenPaths } from "./GardenPaths";
import { Grass } from "./Grass";
import { Butterflies } from "./Butterflies";
import { PetalParticles } from "./PetalParticles";
import { FlowerField } from "./FlowerField";
import { Shrubs } from "./Shrubs";
import { GroundLitter } from "./GroundLitter";
import { SakuraGrove, SakuraPetalFall, GroundPetals } from "./SakuraGrove";
import { GardenProps, Fireflies } from "./GardenProps";
import { Water } from "./Water";
import { Shrine } from "./Shrine";
import { CameraRig } from "./CameraRig";
import { SceneTicker } from "./SceneTicker";
import { PLAZA, SHRINE } from "@/lib/gardenPlan";
import type { QualitySettings } from "@/lib/quality";

/**
 * El jardín completo, de lo más lejano a lo más cercano:
 * cielo y paisaje → terreno, caminos y agua → santuario, árboles y
 * props → vegetación y flores → partículas.
 */
export function GardenScene({ quality }: { quality: QualitySettings }) {
  return (
    <>
      <SceneTicker />
      <CameraRig />

      <Atmosphere shadows={quality.shadows} highQuality={quality.tier === "high"} />
      <Sky />
      <Landscape farTreeCount={quality.farTreeCount} birdCount={quality.birdCount} />

      <Ground shadows={quality.shadows} />
      <GardenPaths />
      <Water />

      <Shrine shadows={quality.shadows} />
      <SakuraGrove detail={quality.canopyDetail} shadows={quality.shadows} />
      <GardenProps shadows={quality.shadows} />

      <Grass count={quality.grassCount} windStrength={1} />
      <Shrubs count={quality.shrubCount} />
      <GroundLitter count={quality.litterCount} />
      <GroundPetals count={quality.groundPetalCount} />

      <Suspense fallback={null}>
        <FlowerField count={quality.flowerCount} drawDistance={quality.flowerDrawDistance} />
      </Suspense>

      <Butterflies count={quality.butterflyCount} />
      <PetalParticles count={quality.petalCount} />
      <SakuraPetalFall count={quality.sakuraPetalCount} />
      <Fireflies
        count={quality.fireflyCount}
        centerX={PLAZA.x}
        centerZ={(PLAZA.z + SHRINE.z) / 2}
        radius={9}
      />
    </>
  );
}
