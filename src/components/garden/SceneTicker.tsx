"use client";

import { useFrame } from "@react-three/fiber";
import { sceneUniforms } from "@/lib/sceneUniforms";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/** Avanza el reloj de viento compartido por todas las escenas
 * animadas (pasto, flores, pétalos). Reduce la intensidad si el
 * usuario pidió menos movimiento en el sistema operativo. */
export function SceneTicker() {
  const prefersReducedMotion = usePrefersReducedMotion();

  useFrame((_, delta) => {
    sceneUniforms.windTime += delta;
    sceneUniforms.windStrength = prefersReducedMotion ? 0.12 : 1;
  });

  return null;
}
