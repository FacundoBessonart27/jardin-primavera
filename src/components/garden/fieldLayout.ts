import { regularFlowerSpecies, specialFlower, type FlowerSpecies } from "@/data/flowers";
import { createSeededRandom, weightedIndex } from "@/lib/random";
import { GARDEN_BOUNDARY_RADIUS, GARDEN_CENTER_Z } from "@/lib/terrain";
import { CAMERA_POSITIONS } from "@/lib/cameraController";
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
const FIELD_RADIUS = GARDEN_BOUNDARY_RADIUS - 1.2;
const CLEAR_RADIUS = 1.2; // zona despejada alrededor del punto de partida
/** Parte del total reservada para flores chicas que rellenan huecos
 * alrededor de las demás (mismo presupuesto de flores que antes). */
const FILLER_SHARE = 0.24;

/** Lugar fijo de la flor especial: escondida entre las demás pero
 * determinística, para que "encontrarla" sea posible de repetir. */
export const SPECIAL_FLOWER_POSITION = { x: -2.6, z: -3.4 };

const SPAWN_X = CAMERA_POSITIONS.gardenHome.x;
const SPAWN_Z = CAMERA_POSITIONS.gardenHome.z;

/** Rotación Y que orienta el +X local de una flor (hacia donde inclina
 * su cabeza, ver flowerGeometry) hacia la luz clave de la escena
 * (GardenScene: directionalLight en [6, 9, 4]). */
const SUN_YAW = Math.atan2(-4, 6);

interface Patch {
  x: number;
  z: number;
  radius: number;
  speciesId: string;
}

interface Placed {
  x: number;
  z: number;
  /** Radio de "espacio propio" de la planta: flores grandes necesitan
   * más lugar que las chicas de relleno. */
  footprint: number;
  hero: boolean;
  speciesId: string;
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

/** Densidad natural del campo (0..1): zonas tupidas y claros suaves,
 * sin ningún patrón regular. */
function densityAt(x: number, z: number): number {
  return valueNoise(x * 0.28 + 3.1, z * 0.28 - 1.7) * 0.7 + valueNoise(x * 0.7, z * 0.7) * 0.3;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function footprintOf(species: FlowerSpecies): number {
  return 0.13 + 0.2 * species.visual.scale * (species.filler ? 0.7 : 1);
}

/** Genera "manchones" de una misma especie repartidos por el jardín,
 * imitando cómo se agrupan naturalmente las flores en un jardín real
 * (drifts de color) en vez de un salpicado uniforme tipo confeti. */
function generatePatches(random: () => number, weights: number[]): Patch[] {
  // Cada especie tiene al menos un manchón propio (ninguna queda sin
  // aparecer por azar); los manchones extra se reparten por peso.
  const order = regularFlowerSpecies.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const count = order.length + 4 + Math.floor(random() * 6);
  const patches: Patch[] = [];

  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * (FIELD_RADIUS - 1);
    const speciesIndex = i < order.length ? order[i] : weightedIndex(random, weights);
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

function fitsAt(x: number, z: number, footprint: number, placed: Placed[]): boolean {
  for (const p of placed) {
    const min = footprint + p.footprint;
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < min * min) return false;
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
  const distanceFromStart = Math.hypot(x - SPAWN_X, z - SPAWN_Z) / (FIELD_RADIUS * 1.4);
  return Math.max(0, Math.min(0.85, distanceFromStart * 0.7 + random() * 0.25));
}

/**
 * Genera la disposición de todas las flores del jardín una sola vez
 * (seed fijo → siempre el mismo jardín entre sesiones). Combina:
 *  - manchones por especie (agrupamiento natural), con flores más
 *    chicas y jóvenes hacia los bordes de cada manchón;
 *  - un ruido de densidad que crea zonas tupidas y claros;
 *  - separación según el tamaño de cada especie (no una distancia fija
 *    que termina pareciendo una grilla);
 *  - algunas flores protagonistas, más grandes y con espacio propio;
 *  - una segunda pasada de flores chicas de relleno que se acomodan
 *    alrededor de las demás, como en un cantero real.
 */
export function generateFieldLayout(count: number): FlowerPlacement[] {
  const random = createSeededRandom(FIELD_SEED);
  const weights = regularFlowerSpecies.map((s) => s.fieldWeight);
  const patches = generatePatches(random, weights);
  const fillers = regularFlowerSpecies.filter((s) => s.filler);
  const fillerWeights = fillers.map((s) => s.fieldWeight);

  const result: FlowerPlacement[] = [];
  // El lugar de la flor especial queda reservado desde el principio: las
  // demás crecen alrededor, pero ninguna encima.
  const specialX = SPECIAL_FLOWER_POSITION.x;
  const specialZ = SPECIAL_FLOWER_POSITION.z;
  const placed: Placed[] = [
    { x: specialX, z: specialZ, footprint: 0.45, hero: true, speciesId: specialFlower.id },
  ];
  const mainCount = Math.round(count * (1 - FILLER_SHARE));

  const tryPlaceMain = (x: number, z: number, seedSpecies?: FlowerSpecies): boolean => {
    if (Math.hypot(x - SPAWN_X, z - SPAWN_Z) < CLEAR_RADIUS) return false;
    if (Math.hypot(x, z - GARDEN_CENTER_Z) > FIELD_RADIUS) return false;

    const near = nearestPatch(x, z, patches);
    const insidePatch = Boolean(near && near.dist < near.patch.radius);
    if (!seedSpecies) {
      const density = densityAt(x, z);
      const acceptance = insidePatch
        ? 0.55 + 0.45 * density
        : 0.05 + 0.85 * smoothstep(0.3, 0.8, density);
      if (random() > acceptance) return false;
    }

    const species =
      seedSpecies ??
      (insidePatch && random() < 0.78
        ? regularFlowerSpecies.find((s) => s.id === near!.patch.speciesId)!
        : regularFlowerSpecies[weightedIndex(random, weights)]);

    const hero =
      !seedSpecies &&
      species.visual.scale >= 0.85 &&
      random() < 0.22 &&
      !placed.some((p) => p.hero && Math.hypot(x - p.x, z - p.z) < 2.2);
    const footprint = footprintOf(species) * (insidePatch ? 0.72 : 1) * (hero ? 1.35 : 1);
    if (!fitsAt(x, z, footprint, placed)) return false;
    placed.push({ x, z, footprint, hero, speciesId: species.id });

    let scaleVariance: number;
    if (hero) {
      scaleVariance = 1.18 + random() * 0.2;
    } else if (insidePatch) {
      const edge = near!.dist / near!.patch.radius;
      scaleVariance = (0.95 + random() * 0.22) * (1 - 0.2 * Math.pow(edge, 1.5));
    } else {
      scaleVariance = 0.78 + random() * 0.3;
    }

    result.push({
      id: `${species.id}-${result.length}`,
      speciesId: species.id,
      position: [x, 0, z],
      rotationY: orientation(species, random),
      scaleVariance,
      isSpecial: false,
      revealThreshold: revealFor(x, z, random),
      windPhase: random() * Math.PI * 2,
      leanX: (random() - 0.5) * 0.16,
      leanZ: (random() - 0.5) * 0.16,
      stretch: 0.9 + random() * 0.2,
      heightVar: 0.9 + random() * 0.2,
      bloomVariant: hero ? 2 : randomBloom(random),
    });
    return true;
  };

  // Primero, una planta madura en el centro de cada manchón: así cada
  // especie aparece en el jardín en cualquier nivel de calidad, y los
  // manchones crecen alrededor de ella.
  for (const patch of patches) {
    if (result.length >= mainCount) break;
    const seed = regularFlowerSpecies.find((s) => s.id === patch.speciesId);
    for (let k = 0; k < 10; k++) {
      const a = random() * Math.PI * 2;
      const d = k === 0 ? 0 : random() * patch.radius * 0.7;
      if (tryPlaceMain(patch.x + Math.cos(a) * d, patch.z + Math.sin(a) * d, seed)) break;
    }
  }

  let attempts = 0;
  while (result.length < mainCount && attempts < count * 60) {
    attempts++;
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * FIELD_RADIUS;
    tryPlaceMain(Math.cos(angle) * r, GARDEN_CENTER_Z + Math.sin(angle) * r);
  }

  // Relleno: flores chicas que se acomodan alrededor de las ya plantadas.
  attempts = 0;
  while (result.length < count && fillers.length > 0 && attempts < count * 60) {
    attempts++;
    const anchor = placed[Math.floor(random() * placed.length)];
    const angle = random() * Math.PI * 2;
    const dist = anchor.footprint + 0.1 + random() * 0.55;
    const x = anchor.x + Math.cos(angle) * dist;
    const z = anchor.z + Math.sin(angle) * dist;

    if (Math.hypot(x, z - GARDEN_CENTER_Z) > FIELD_RADIUS) continue;
    if (Math.hypot(x - SPAWN_X, z - SPAWN_Z) < CLEAR_RADIUS) continue;

    // Si la vecina ya es de relleno, lo más probable es que se repita la
    // especie (pequeñas colonias de margaritas, jazmines...).
    const anchorSpecies = regularFlowerSpecies.find((s) => s.id === anchor.speciesId);
    const species =
      anchorSpecies?.filler && random() < 0.6
        ? anchorSpecies
        : fillers[weightedIndex(random, fillerWeights)];

    const footprint = footprintOf(species) * 0.8;
    if (!fitsAt(x, z, footprint, placed)) continue;
    placed.push({ x, z, footprint, hero: false, speciesId: species.id });

    result.push({
      id: `${species.id}-${result.length}`,
      speciesId: species.id,
      position: [x, 0, z],
      rotationY: orientation(species, random),
      scaleVariance: 0.72 + random() * 0.3,
      isSpecial: false,
      revealThreshold: revealFor(x, z, random),
      windPhase: random() * Math.PI * 2,
      leanX: (random() - 0.5) * 0.18,
      leanZ: (random() - 0.5) * 0.18,
      stretch: 0.9 + random() * 0.2,
      heightVar: 0.88 + random() * 0.22,
      bloomVariant: randomBloom(random),
    });
  }

  assignMessageFlowers(result, giftConfig.hiddenWhispers.length);

  // La flor especial: mira hacia el punto de partida para que su cara se
  // vea al llegar.
  result.push({
    id: "special-0",
    speciesId: specialFlower.id,
    position: [specialX, 0, specialZ],
    rotationY: Math.atan2(-(SPAWN_Z - specialZ), SPAWN_X - specialX),
    scaleVariance: 1,
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
