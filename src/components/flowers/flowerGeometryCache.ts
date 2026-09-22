import * as THREE from "three";
import type { FlowerVisual } from "@/data/flowers";
import { buildFlowerGeometry, hashSeed } from "./flowerGeometry";

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * Memoiza la geometría combinada de cada especie para que se construya
 * una sola vez por especie + nivel de detalle + variante de apertura,
 * sin importar cuántos componentes la usen (campo instanciado, showcase
 * del modal, etc). `bloom` (0..1) permite tener una variante de "capullo
 * entreabierto" además de la flor completamente abierta, para que no
 * todas las flores de una misma especie se vean en el mismo estado.
 */
export function getFlowerGeometry(
  speciesId: string,
  visual: FlowerVisual,
  detail: "field" | "showcase",
  bloom = 1
): THREE.BufferGeometry {
  const key = `${speciesId}-${detail}-${bloom}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const geometry = buildFlowerGeometry(visual, hashSeed(speciesId), {
    detail,
    bloom,
  });
  cache.set(key, geometry);
  return geometry;
}
