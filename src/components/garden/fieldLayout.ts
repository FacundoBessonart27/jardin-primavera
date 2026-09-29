import { regularFlowerSpecies, specialFlower, type FlowerSpecies } from "@/data/flowers";
import { createSeededRandom, weightedIndex } from "@/lib/random";
import {
  BOUNDARY,
  FLOWER_BEDS,
  OBSTACLES,
  PLAZA,
  SHRINE,
  SPAWN,
  bedRadius,
  boundaryRadius,
  pathEdgeDistance,
  pondRadius,
  streamDistance,
} from "@/lib/gardenPlan";
import { SUN_DIRECTION } from "@/lib/sun";
import { giftConfig } from "@/config/giftConfig";

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
  /** Inclinación fija (no la del viento) para que cada planta se
   * apoye en un ángulo levemente distinto, como en un jardín real. */
  leanX: number;
  leanZ: number;
  /** Estiramiento no uniforme (ancho vs. alto) fijo por ejemplar: dos
   * flores de la misma especie con el mismo `scaleVariance` igual se
   * ven distintas (una más "regordeta", otra más esbelta), sin generar
   * geometría nueva ni afectar el instancing. */
  stretch: number;
  /** Variación de altura propia del ejemplar (se suma a la de tamaño). */
  heightVar: number;
  /** 0 = capullo cerrado, 1 = entreabierta, 2 = completamente abierta.
   * Cada variante usa su propia geometría (ver flowerGeometryCache),
   * así que las flores de una misma especie no se ven todas en el
   * mismo estado de apertura. */
  bloomVariant: 0 | 1 | 2;
  /** Si es una flor con mensaje: índice de su frase en
   * giftConfig.hiddenWhispers. */
  messageIndex?: number;
}

const FIELD_SEED = 20260921;

/** Lugar fijo de la flor especial: el centro del círculo de flores de
 * la plaza, frente al santuario (el destino del recorrido). */
export const SPECIAL_FLOWER_POSITION = { x: PLAZA.x, z: PLAZA.z };

const SPAWN_X = SPAWN.x;
const SPAWN_Z = SPAWN.z;

/** Rotación Y que orienta el +X local de una flor (hacia donde inclina
 * su cabeza, ver flowerGeometry) hacia el sol del atardecer. */
const SUN_YAW = Math.atan2(-SUN_DIRECTION.z, SUN_DIRECTION.x);

/** Parte del total para el círculo de flores de la plaza y para las
 * flores silvestres sueltas de los prados. */
const RING_SHARE = 0.07;
const WILD_SHARE = 0.08;

interface Placed {
  x: number;
  z: number;
  /** Radio de "espacio propio" de la planta: flores grandes necesitan
   * más lugar que las chicas de relleno. */
  footprint: number;
  hero: boolean;
  speciesId: string;
}

function footprintOf(species: FlowerSpecies): number {
  return 0.13 + 0.2 * species.visual.scale * (species.filler ? 0.7 : 1);
}

function fitsAt(x: number, z: number, footprint: number, placed: Placed[]): boolean {
  for (const p of placed) {
    const min = footprint + p.footprint;
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < min * min) return false;
  }
  return true;
}

/** Lugar apto para una flor: fuera de caminos, agua, plaza, santuario
 * y del tronco de árboles, faroles y bancos. */
function isFlowerSpot(x: number, z: number, allowPlaza = false): boolean {
  if (boundaryRadius(x, z) > 0.93) return false;
  if (pathEdgeDistance(x, z) < 0.22) return false;
  if (pondRadius(x, z) < 1.3 || streamDistance(x, z) < 1.7) return false;
  if (!allowPlaza && Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.radius + 0.35) return false;
  if (
    Math.abs(x - SHRINE.x) < SHRINE.plinthW / 2 + 0.4 &&
    Math.abs(z - SHRINE.z) < SHRINE.plinthD / 2 + SHRINE.stepsDepth + 0.4
  ) {
    return false;
  }
  if (Math.hypot(x - SPAWN_X, z - SPAWN_Z) < 1.2) return false;
  for (const o of OBSTACLES) {
    const r = o.r + 0.18;
    if ((x - o.x) ** 2 + (z - o.z) ** 2 < r * r) return false;
  }
  return true;
}

function orientation(species: FlowerSpecies, random: () => number): number {
  const sun = species.sunFacing ?? 0;
  if (sun <= 0) return random() * Math.PI * 2;
  return SUN_YAW + (random() * 2 - 1) * Math.PI * (1 - sun * 0.9);
}

function randomBloom(random: () => number): 0 | 1 | 2 {
  // La mayoría abiertas, algunas entreabiertas y unas pocas en capullo.
  const roll = random();
  if (roll < 0.1) return 0;
  if (roll < 0.28) return 1;
  return 2;
}

function revealFor(x: number, z: number, random: () => number): number {
  const distanceFromStart = Math.hypot(x - SPAWN_X, z - SPAWN_Z) / 60;
  return Math.max(0, Math.min(0.85, distanceFromStart * 0.8 + random() * 0.25));
}

const speciesById = new Map(regularFlowerSpecies.map((s) => [s.id, s]));

/**
 * Genera la disposición de todas las flores del jardín una sola vez
 * (seed fijo → siempre el mismo jardín entre sesiones), organizada por
 * sectores:
 *  - cada cantero (ver gardenPlan.FLOWER_BEDS) tiene una especie
 *    dominante y algunas acompañantes, más tupido al centro y con
 *    flores más chicas hacia el borde orgánico;
 *  - entre canteros quedan prados de césped con pocas flores
 *    silvestres sueltas (zonas tranquilas);
 *  - en la plaza, un círculo de flores rodea a la flor especial;
 *  - nunca hay flores sobre los caminos, el agua o los props.
 */
export function generateFieldLayout(count: number): FlowerPlacement[] {
  const random = createSeededRandom(FIELD_SEED);
  const result: FlowerPlacement[] = [];
  const specialX = SPECIAL_FLOWER_POSITION.x;
  const specialZ = SPECIAL_FLOWER_POSITION.z;
  const placed: Placed[] = [
    { x: specialX, z: specialZ, footprint: 0.5, hero: true, speciesId: specialFlower.id },
  ];

  const push = (
    species: FlowerSpecies,
    x: number,
    z: number,
    scaleVariance: number,
    bloomVariant: 0 | 1 | 2,
    rotationY = orientation(species, random)
  ) => {
    result.push({
      id: `${species.id}-${result.length}`,
      speciesId: species.id,
      position: [x, 0, z],
      rotationY,
      scaleVariance,
      isSpecial: false,
      revealThreshold: revealFor(x, z, random),
      windPhase: random() * Math.PI * 2,
      leanX: (random() - 0.5) * 0.16,
      leanZ: (random() - 0.5) * 0.16,
      stretch: 0.9 + random() * 0.2,
      heightVar: 0.9 + random() * 0.2,
      bloomVariant,
    });
  };

  // --- Círculo de flores de la plaza ------------------------------------
  const ringCount = Math.max(10, Math.round(count * RING_SHARE));
  const ringSpecies = ["rosa", "peonia", "jazmin", "cerezo"];
  const inner = Math.round(ringCount * 0.42);
  for (let i = 0; i < ringCount; i++) {
    const outerRing = i >= inner;
    const k = outerRing ? i - inner : i;
    const n = outerRing ? ringCount - inner : inner;
    const a = (k / n) * Math.PI * 2 + (outerRing ? Math.PI / n : 0);
    const r = outerRing ? 1.5 : 0.95;
    const x = specialX + Math.cos(a) * r;
    const z = specialZ + Math.sin(a) * r;
    const species = speciesById.get(
      outerRing ? ringSpecies[2 + (k % 2)] : ringSpecies[k % 2]
    )!;
    placed.push({ x, z, footprint: 0.2, hero: false, speciesId: species.id });
    // Cabezas hacia afuera: se ven de frente al rodear el círculo.
    push(species, x, z, outerRing ? 0.82 : 0.95, 2, Math.atan2(-(z - specialZ), x - specialX));
  }

  // --- Canteros ---------------------------------------------------------
  const wildCount = Math.round(count * WILD_SHARE);
  const bedBudget = count - ringCount - wildCount;
  const weights = FLOWER_BEDS.map((b) => b.rx * b.rz * (0.35 + 0.65 * b.density));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  FLOWER_BEDS.forEach((bed, bi) => {
    const target = Math.max(3, Math.round((bedBudget * weights[bi]) / totalWeight));
    const dominant = speciesById.get(bed.species)!;
    const companions = bed.companions.map((id) => speciesById.get(id)!).filter(Boolean);
    let planted = 0;
    let heroes = 0;
    const cos = Math.cos(bed.rot);
    const sin = Math.sin(bed.rot);
    for (let attempt = 0; attempt < target * 40 && planted < target; attempt++) {
      // Punto al azar dentro de la elipse del cantero (con su borde
      // irregular), un poco más probable hacia el centro.
      const a = random() * Math.PI * 2;
      const rr = Math.pow(random(), 0.62) * 1.15;
      const lx = Math.cos(a) * rr * bed.rx;
      const lz = Math.sin(a) * rr * bed.rz;
      const x = bed.x + lx * cos - lz * sin;
      const z = bed.z + lx * sin + lz * cos;
      const r = bedRadius(bed, x, z);
      if (r > 1) continue;
      if (!isFlowerSpot(x, z)) continue;

      const edgeMix = 0.9 - 0.3 * r * r;
      const species =
        companions.length === 0 || random() < edgeMix
          ? dominant
          : companions[Math.floor(random() * companions.length)];

      const hero =
        heroes < 2 && r < 0.45 && species.visual.scale >= 0.85 && random() < 0.35;
      // Los canteros ralos (prados) dejan más aire entre flores.
      const spacing = 1 + (1 - bed.density) * 1.4;
      const footprint = footprintOf(species) * 0.74 * spacing * (hero ? 1.3 : 1);
      if (!fitsAt(x, z, footprint, placed)) continue;
      placed.push({ x, z, footprint, hero, speciesId: species.id });
      if (hero) heroes++;
      planted++;

      const scaleVariance = hero
        ? 1.18 + random() * 0.18
        : (0.95 + random() * 0.22) * (1 - 0.2 * Math.pow(r, 1.5));
      push(species, x, z, scaleVariance, hero ? 2 : randomBloom(random));
    }
  });

  // --- Flores silvestres sueltas en los prados ----------------------------
  const fillers = regularFlowerSpecies.filter((s) => s.filler || s.id === "calendula" || s.id === "cosmos");
  const fillerWeights = fillers.map((s) => s.fieldWeight);
  let wild = 0;
  for (let attempt = 0; attempt < wildCount * 60 && wild < wildCount; attempt++) {
    const a = random() * Math.PI * 2;
    const rr = Math.sqrt(random()) * 0.9;
    const x = BOUNDARY.cx + Math.cos(a) * rr * BOUNDARY.rx;
    const z = BOUNDARY.cz + Math.sin(a) * rr * BOUNDARY.rz;
    if (FLOWER_BEDS.some((b) => bedRadius(b, x, z) < 1.25)) continue;
    if (pathEdgeDistance(x, z) < 0.6) continue;
    if (!isFlowerSpot(x, z)) continue;
    const species = fillers[weightedIndex(random, fillerWeights)];
    const footprint = footprintOf(species) * 2.2;
    if (!fitsAt(x, z, footprint, placed)) continue;
    placed.push({ x, z, footprint, hero: false, speciesId: species.id });
    wild++;
    push(species, x, z, 0.7 + random() * 0.25, randomBloom(random));
  }

  assignMessageFlowers(result, giftConfig.hiddenWhispers.length);

  // La flor especial: en el centro del círculo, mirando hacia quien
  // llega por el camino principal (desde el sur).
  result.push({
    id: "special-0",
    speciesId: specialFlower.id,
    position: [specialX, 0, specialZ],
    rotationY: Math.atan2(-1, 0),
    scaleVariance: 1.08,
    isSpecial: true,
    revealThreshold: 0.55,
    windPhase: 1.2,
    leanX: 0,
    leanZ: 0,
    stretch: 1,
    heightVar: 1,
    bloomVariant: 2,
  });

  return result;
}

/**
 * Elige las flores con mensaje: abiertas, de buen tamaño, lejos del
 * punto de partida y de la flor especial, bien repartidas por el jardín
 * (siempre la más alejada de las ya elegidas) y, si se puede, de
 * especies distintas. Usa su propia semilla para no alterar el resto
 * de la disposición.
 */
function assignMessageFlowers(placements: FlowerPlacement[], count: number) {
  if (count <= 0) return;
  const random = createSeededRandom(FIELD_SEED + 1);
  const candidates = placements.filter((p) => {
    const [x, , z] = p.position;
    return (
      p.bloomVariant === 2 &&
      p.scaleVariance >= 0.85 &&
      Math.hypot(x - PLAZA.x, z - PLAZA.z) > PLAZA.radius + 1 &&
      Math.hypot(x - SPAWN_X, z - SPAWN_Z) > 3.5 &&
      Math.hypot(x - SPECIAL_FLOWER_POSITION.x, z - SPECIAL_FLOWER_POSITION.z) > 2.5
    );
  });
  if (candidates.length === 0) return;

  const chosen: FlowerPlacement[] = [candidates[Math.floor(random() * candidates.length)]];
  while (chosen.length < count && chosen.length < candidates.length) {
    const usedSpecies = new Set(chosen.map((c) => c.speciesId));
    let best: FlowerPlacement | null = null;
    let bestScore = -Infinity;
    for (const c of candidates) {
      if (chosen.includes(c)) continue;
      const minDist = Math.min(
        ...chosen.map((o) => Math.hypot(c.position[0] - o.position[0], c.position[2] - o.position[2]))
      );
      const score = minDist * (usedSpecies.has(c.speciesId) ? 0.6 : 1) + random() * 0.8;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  chosen.forEach((p, i) => {
    p.messageIndex = i;
  });
}
