/**
 * Relieve sutil del jardín: una función de altura determinística
 * (value noise hecho a mano, sin dependencias) que usan el suelo
 * (Ground), el pasto (Grass), las flores (FlowerField) y la cámara
 * en primera persona (FirstPersonControls) para que todo se apoye
 * de forma consistente sobre el mismo terreno, evitando que el
 * jardín se vea como un plano perfectamente chato y repetitivo.
 */

const NOISE_SEED = 1337;

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + NOISE_SEED * 0.001) * 43758.5453123;
  return s - Math.floor(s);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise 2D suave, continuo, en el rango aproximado [0, 1]. */
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smoothstep(x - xi);
  const yf = smoothstep(y - yi);

  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);

  const top = a + (b - a) * xf;
  const bottom = c + (d - c) * xf;
  return top + (bottom - top) * yf;
}

const AMPLITUDE = 0.16;

/** Altura del terreno (mundo Y) en una coordenada (x, z) dada. Barata
 * de evaluar (un puñado de senos), pensada para llamarse cientos de
 * veces por frame si hace falta. */
export function heightAt(x: number, z: number): number {
  const big = valueNoise(x * 0.07, z * 0.07);
  const small = valueNoise(x * 0.19 + 31.4, z * 0.19 + 7.2);
  return (big * 0.65 + small * 0.35 - 0.5) * AMPLITUDE;
}

/** Radio del jardín transitable (límite duro para la cámara/jugador). */
export const GARDEN_BOUNDARY_RADIUS = 11.5;
export const GARDEN_CENTER_Z = -3;

/** Empuja un punto (x,z) para que quede dentro del límite circular del
 * jardín, centrado en (0, GARDEN_CENTER_Z). */
export function clampToGarden(x: number, z: number): [number, number] {
  const dx = x;
  const dz = z - GARDEN_CENTER_Z;
  const dist = Math.hypot(dx, dz);
  if (dist <= GARDEN_BOUNDARY_RADIUS) return [x, z];
  const scale = GARDEN_BOUNDARY_RADIUS / dist;
  return [dx * scale, GARDEN_CENTER_Z + dz * scale];
}
