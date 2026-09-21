import * as THREE from "three";
import type { FlowerVisual } from "@/data/flowers";
import { buildFlowerGeometry, hashSeed } from "./flowerGeometry";

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * Memoiza la geometría combinada de cada especie para que se construya
 * una sola vez por especie + nivel de detalle, sin importar cuántos
 * componentes la usen (campo instanciado, showcase del modal, etc).
 */
export function getFlowerGeometry(
  speciesId: string,
  visual: FlowerVisual,
  detail: "field" | "showcase"
): THREE.BufferGeometry {
  const key = `${speciesId}-${detail}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const geometry = buildFlowerGeometry(visual, hashSeed(speciesId), {
    detail,
  });
  cache.set(key, geometry);
  return geometry;
}
