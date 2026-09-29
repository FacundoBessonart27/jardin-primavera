"use client";

import { useMemo } from "react";
import { LightPools, WarmGlows, lanternLights } from "./GardenProps";
import { shrineLights } from "./Shrine";

/** Toda la luz cálida "falsa" del jardín (halos y charcos de luz de
 * faroles y santuario): 2 draw calls en total, sin luces reales. */
export function WarmLights() {
  const lights = useMemo(() => {
    const a = lanternLights();
    const b = shrineLights();
    return { glows: [...a.glows, ...b.glows], pools: [...a.pools, ...b.pools] };
  }, []);
  return (
    <>
      <WarmGlows glows={lights.glows} />
      <LightPools pools={lights.pools} />
    </>
  );
}
