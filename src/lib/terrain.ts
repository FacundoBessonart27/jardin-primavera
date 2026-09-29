/**
 * Relieve del jardín: una función de altura determinística (value
 * noise hecho a mano, sin dependencias) que usan el suelo, el pasto,
 * las flores, los árboles y la cámara en primera persona, para que
 * todo se apoye de forma consistente sobre el mismo terreno.
 *
 * Sobre un ondulado suave se suman los rasgos del plano del jardín
 * (ver gardenPlan.ts):
 *  - canteros apenas elevados (como tierra de cantero);
 *  - caminos nivelados y levemente hundidos;
 *  - la plaza y el santuario sobre un terreno plano;
 *  - el cauce del arroyo y el estanque;
 *  - colinas que rodean el jardín por fuera del área caminable, para
 *    que el valle quede enmarcado por un paisaje y no por un borde.
 */

import {
  BOUNDARY,
  BRIDGE,
  PLAZA,
  POND,
  SHRINE,
  bedMask,
  boundaryRadius,
  bridgeLocal,
  isBlocked,
  isOnBridge,
  isWater,
  WALK_LIMIT,
  pondRadius,
  queryPaths,
  shrineZone,
  streamDistance,
} from "./gardenPlan";

const NOISE_SEED = 1337;

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + NOISE_SEED * 0.001) * 43758.5453123;
  return s - Math.floor(s);
}

function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t);
}

function smoothstep(e0: number, e1: number, x: number): number {
  return smoothstep01(Math.min(1, Math.max(0, (x - e0) / (e1 - e0))));
}

/** Value noise 2D suave, continuo, en el rango aproximado [0, 1]. */
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smoothstep01(x - xi);
  const yf = smoothstep01(y - yi);

  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);

  const top = a + (b - a) * xf;
  const bottom = c + (d - c) * xf;
  return top + (bottom - top) * yf;
}

/** Ondulado de gran escala (lomas muy suaves de ~25 m). */
function largeScale(x: number, z: number): number {
  return (valueNoise(x * 0.045 + 5.3, z * 0.045 - 2.1) - 0.5) * 0.9;
}

/** Nivel del agua del arroyo en un punto (sigue el terreno general). */
export function streamWaterLevel(x: number, z: number): number {
  return largeScale(x, z) - 0.18;
}

/** Nivel (constante) del espejo de agua del estanque. */
export const POND_LEVEL = largeScale(POND.x, POND.z) - 0.18;

/** Nivel de la plaza y del pie del santuario. */
export const PLAZA_LEVEL = largeScale(PLAZA.x, PLAZA.z) + 0.02;

/** Colinas fuera del jardín. */
function hills(x: number, z: number, e: number): number {
  const rise = smoothstep(0.97, 1.75, e);
  if (rise <= 0) return 0;
  const ridge = 4 + 9 * valueNoise(x * 0.028 + 11, z * 0.028 - 3);
  const detail = (valueNoise(x * 0.09, z * 0.09) - 0.5) * 1.6;
  return Math.pow(rise, 1.35) * ridge + rise * detail;
}

/** Altura del terreno (mundo Y) en una coordenada (x, z) dada. */
export function heightAt(x: number, z: number): number {
  const large = largeScale(x, z);
  const medium = (valueNoise(x * 0.13 + 31.4, z * 0.13 + 7.2) - 0.5) * 0.24;
  const small = (valueNoise(x * 0.42 + 2.7, z * 0.42 + 9.1) - 0.5) * 0.05;
  let h = large + medium + small;

  const e = boundaryRadius(x, z);
  if (e > 0.97) return h + hills(x, z, e);

  // Canteros: tierra apenas más alta.
  h += 0.09 * bedMask(x, z);

  // Caminos: nivelados (sin el ruido fino) y un poco hundidos.
  const path = queryPaths(x, z);
  if (path.edge < 1.4) {
    const m = 1 - smoothstep(-0.25, 1.4, path.edge);
    h += (large - 0.035 - h) * m;
  }

  // Plaza y santuario sobre terreno plano.
  const dPlaza = Math.hypot(x - PLAZA.x, z - PLAZA.z);
  let flat = dPlaza < 7.6 ? 1 - smoothstep(PLAZA.radius + 0.25, 7.6, dPlaza) : 0;
  const sx = Math.abs(x - SHRINE.x) - SHRINE.plinthW / 2;
  const sz = Math.abs(z - SHRINE.z) - SHRINE.plinthD / 2;
  const shrineEdge = Math.max(sx, sz);
  if (shrineEdge < 3) flat = Math.max(flat, 1 - smoothstep(0.6, 3, shrineEdge));
  if (flat > 0) h += (PLAZA_LEVEL - h) * flat;

  // Cauce del arroyo.
  const sd = streamDistance(x, z);
  if (sd < 2.1) {
    h -= 0.55 * (1 - smoothstep(0.3, 2.0, sd));
  }

  // Estanque: la orilla nunca queda por debajo del agua (el espejo es
  // plano) y el fondo baja suave hacia el centro.
  const pr = pondRadius(x, z);
  if (pr < 1.75) {
    const bank = Math.max(h, POND_LEVEL + 0.1);
    h += (bank - h) * (1 - smoothstep(1.3, 1.75, pr));
    const m = 1 - smoothstep(0.7, 1.2, pr);
    h += (POND_LEVEL - 0.5 - h) * m;
  }

  return h;
}

let bridgeEnds: [number, number] | null = null;

/** Altura del tablero del puente a lo largo (u en metros desde el centro). */
export function bridgeDeckHeight(u: number): number {
  const t = (u + BRIDGE.halfLength) / (BRIDGE.halfLength * 2);
  if (!bridgeEnds) {
    bridgeEnds = [
      heightAt(BRIDGE.x - BRIDGE.dx * BRIDGE.halfLength, BRIDGE.z - BRIDGE.dz * BRIDGE.halfLength),
      heightAt(BRIDGE.x + BRIDGE.dx * BRIDGE.halfLength, BRIDGE.z + BRIDGE.dz * BRIDGE.halfLength),
    ];
  }
  const [ya, yb] = bridgeEnds;
  return ya + (yb - ya) * t + Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * BRIDGE.arch + 0.06;
}

/** Altura del zócalo del santuario (su cara superior). */
export const PLINTH_TOP = PLAZA_LEVEL + SHRINE.plinthH;

/**
 * Altura sobre la que camina el jugador: el terreno, salvo sobre el
 * puente (su tablero arqueado) y en el santuario (escalinata y zócalo).
 */
export function walkHeightAt(x: number, z: number): number {
  const zone = shrineZone(x, z);
  if (zone === "plinth") return PLINTH_TOP;
  if (zone === "steps") {
    const front = SHRINE.z + SHRINE.plinthD / 2;
    const t = 1 - (z - front) / SHRINE.stepsDepth;
    return PLAZA_LEVEL + (PLINTH_TOP - PLAZA_LEVEL) * Math.min(1, Math.max(0, t));
  }
  const ground = heightAt(x, z);
  const { u, w } = bridgeLocal(x, z);
  if (Math.abs(u) <= BRIDGE.halfLength && Math.abs(w) <= BRIDGE.halfWidth + 0.1) {
    return Math.max(ground, bridgeDeckHeight(u));
  }
  return ground;
}

/** Desnivel máximo que el jugador sube o baja de un paso (evita
 * treparse al zócalo por los costados). */
const MAX_STEP = 0.3;

function canStand(fromY: number, x: number, z: number): boolean {
  if (isBlocked(x, z)) return false;
  return Math.abs(walkHeightAt(x, z) - fromY) <= MAX_STEP;
}

/**
 * Mueve al jugador de (fromX, fromZ) hacia (toX, toZ) respetando el
 * límite del jardín, el agua, los obstáculos y los desniveles. Si el
 * paso completo no se puede, intenta deslizarse a lo largo del
 * obstáculo (sólo en X o sólo en Z), como en cualquier juego en
 * primera persona.
 */
export function resolveMove(fromX: number, fromZ: number, toX: number, toZ: number): [number, number] {
  const fromY = walkHeightAt(fromX, fromZ);
  if (canStand(fromY, toX, toZ)) return [toX, toZ];
  if (canStand(fromY, toX, fromZ)) return [toX, fromZ];
  if (canStand(fromY, fromX, toZ)) return [fromX, toZ];
  // Si quedó en un lugar no permitido (por ejemplo, al volver de una
  // animación de cámara), puede moverse libremente mientras no se aleje
  // más del jardín ni se meta al agua: así nunca queda trabado.
  if (isBlocked(fromX, fromZ)) {
    const outward = boundaryRadius(toX, toZ) > boundaryRadius(fromX, fromZ) + 1e-6 && boundaryRadius(toX, toZ) > WALK_LIMIT;
    const wet = isWater(toX, toZ) && !isOnBridge(toX, toZ) && !isWater(fromX, fromZ);
    if (!outward && !wet) return [toX, toZ];
  }
  return [fromX, fromZ];
}

/** Radio del jardín transitable (compatibilidad: el límite real es la
 * elipse de gardenPlan.BOUNDARY). */
export const GARDEN_BOUNDARY_RADIUS = Math.min(BOUNDARY.rx, BOUNDARY.rz);
export const GARDEN_CENTER_Z = BOUNDARY.cz;
