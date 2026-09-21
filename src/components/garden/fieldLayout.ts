import { regularFlowerSpecies, specialFlower } from "@/data/flowers";
import { createSeededRandom, weightedIndex } from "@/lib/random";

export interface FlowerPlacement {
  id: string;
  speciesId: string;
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
const FIELD_RADIUS_X = 9.5;
const FIELD_MIN_Z = -9;
const FIELD_MAX_Z = 6.5;
const MIN_DISTANCE = 0.42;
const CLEAR_RADIUS = 1.1; // zona despejada justo frente a la cámara

/**
 * Genera la disposición de todas las flores del jardín una sola vez
 * (seed fijo → siempre el mismo jardín entre sesiones). Usa rechazo
 * simple por distancia mínima para evitar superposiciones evidentes,
 * suficiente para las cantidades que maneja esta escena (<300).
 */
export function generateFieldLayout(count: number): FlowerPlacement[] {
  const random = createSeededRandom(FIELD_SEED);
  const weights = regularFlowerSpecies.map((s) => s.fieldWeight);
  const placed: FlowerPlacement[] = [];
  const points: [number, number][] = [];

  let attempts = 0;
  while (placed.length < count && attempts < count * 40) {
    attempts++;
    const x = (random() - 0.5) * FIELD_RADIUS_X * 2;
    const z = FIELD_MIN_Z + random() * (FIELD_MAX_Z - FIELD_MIN_Z);

    if (Math.hypot(x, z - 3.2) < CLEAR_RADIUS) continue;

    let tooClose = false;
    for (const [px, pz] of points) {
      if (Math.hypot(x - px, z - pz) < MIN_DISTANCE) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    points.push([x, z]);
    const speciesIndex = weightedIndex(random, weights);
    const species = regularFlowerSpecies[speciesIndex];
    const distanceFromStart = (3.5 - z) / (3.5 - FIELD_MIN_Z);

    placed.push({
      id: `${species.id}-${placed.length}`,
      speciesId: species.id,
      position: [x, 0, z],
      rotationY: random() * Math.PI * 2,
      scaleVariance: 0.85 + random() * 0.3,
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
