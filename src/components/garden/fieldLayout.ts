import { regularFlowerSpecies, specialFlower } from "@/data/flowers";
import { createSeededRandom, weightedIndex } from "@/lib/random";
import { GARDEN_BOUNDARY_RADIUS, GARDEN_CENTER_Z } from "@/lib/terrain";
import { CAMERA_POSITIONS } from "@/lib/cameraController";

export interface FlowerPlacement {
  id: string;
  speciesId: string;
  /** Posición en el plano (x, 0, z); la altura real se calcula en
   * tiempo de render con terrain.heightAt() para apoyarse en el
   * relieve del terreno. */
  position: [number, number, number];
  rotationY: number;
  scaleVariance: number;
  isSpecial: boolean;
  /** Progreso 0→1 (según distancia a cámara) en el que esta flor
   * empieza a "crecer" durante la transición de entrada. */
  revealThreshold: number;
  windPhase: number;
}

const FIELD_SEED = 20260921;
const FIELD_RADIUS = GARDEN_BOUNDARY_RADIUS - 1.2;
const MIN_DISTANCE = 0.4;
const CLEAR_RADIUS = 1.2; // zona despejada alrededor del punto de partida

const SPAWN_X = CAMERA_POSITIONS.gardenHome.x;
const SPAWN_Z = CAMERA_POSITIONS.gardenHome.z;

interface Patch {
  x: number;
  z: number;
  radius: number;
  speciesId: string;
}

/** Genera "manchones" de una misma especie repartidos por el jardín,
 * imitando cómo se agrupan naturalmente las flores en un jardín real
 * (drifts de color) en vez de un salpicado uniforme tipo confeti. */
function generatePatches(random: () => number, weights: number[]): Patch[] {
  const count = 16 + Math.floor(random() * 8);
  const patches: Patch[] = [];

  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * (FIELD_RADIUS - 1);
    const speciesIndex = weightedIndex(random, weights);
    patches.push({
      x: Math.cos(angle) * r,
      z: GARDEN_CENTER_Z + Math.sin(angle) * r,
      radius: 1 + random() * 2.4,
      speciesId: regularFlowerSpecies[speciesIndex].id,
    });
  }

  return patches;
}

function nearestPatch(
  x: number,
  z: number,
  patches: Patch[]
): { patch: Patch; dist: number } | null {
  let best: Patch | null = null;
  let bestDist = Infinity;
  for (const patch of patches) {
    const d = Math.hypot(x - patch.x, z - patch.z);
    if (d < bestDist) {
      bestDist = d;
      best = patch;
    }
  }
  return best ? { patch: best, dist: bestDist } : null;
}

/**
 * Genera la disposición de todas las flores del jardín una sola vez
 * (seed fijo → siempre el mismo jardín entre sesiones). Combina:
 *  - manchones por especie (agrupamiento natural, distintas densidades)
 *  - rechazo por distancia mínima (evita superposiciones evidentes y
 *    patrones de grilla), más laxo dentro de un manchón (más denso)
 *    que en el fondo suelto (más disperso, flores aisladas).
 */
export function generateFieldLayout(count: number): FlowerPlacement[] {
  const random = createSeededRandom(FIELD_SEED);
  const weights = regularFlowerSpecies.map((s) => s.fieldWeight);
  const patches = generatePatches(random, weights);

  const placed: FlowerPlacement[] = [];
  const points: [number, number][] = [];

  let attempts = 0;
  while (placed.length < count && attempts < count * 50) {
    attempts++;
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * FIELD_RADIUS;
    const x = Math.cos(angle) * r;
    const z = GARDEN_CENTER_Z + Math.sin(angle) * r;

    if (Math.hypot(x - SPAWN_X, z - SPAWN_Z) < CLEAR_RADIUS) continue;

    const near = nearestPatch(x, z, patches);
    const insidePatch = Boolean(near && near.dist < near.patch.radius);
    const minDistance = insidePatch ? MIN_DISTANCE * 0.68 : MIN_DISTANCE * 1.2;

    let tooClose = false;
    for (const [px, pz] of points) {
      if (Math.hypot(x - px, z - pz) < minDistance) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    points.push([x, z]);

    const speciesId =
      insidePatch && random() < 0.74
        ? (near as { patch: Patch; dist: number }).patch.speciesId
        : regularFlowerSpecies[weightedIndex(random, weights)].id;
    const species = regularFlowerSpecies.find((s) => s.id === speciesId)!;

    const distanceFromStart =
      Math.hypot(x - SPAWN_X, z - SPAWN_Z) / (FIELD_RADIUS * 1.4);

    placed.push({
      id: `${species.id}-${placed.length}`,
      speciesId: species.id,
      position: [x, 0, z],
      rotationY: random() * Math.PI * 2,
      // Más variación de tamaño entre flores vecinas: se siente menos
      // "clonado" y más como plantas reales de distintas edades.
      scaleVariance: 0.78 + random() * 0.5,
      isSpecial: false,
      revealThreshold: Math.max(
        0,
        Math.min(0.85, distanceFromStart * 0.7 + random() * 0.25)
      ),
      windPhase: random() * Math.PI * 2,
    });
  }

  // La flor especial: posición fija propia, escondida entre las demás
  // pero determinística (para que "encontrarla" sea posible de repetir).
  placed.push({
    id: "special-0",
    speciesId: specialFlower.id,
    position: [-2.6, 0, -3.4],
    rotationY: 0.6,
    scaleVariance: 1,
    isSpecial: true,
    revealThreshold: 0.55,
    windPhase: 1.2,
  });

  return placed;
}
