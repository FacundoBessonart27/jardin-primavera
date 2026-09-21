/**
 * Generador pseudoaleatorio determinístico (mulberry32). Se usa para
 * poder distribuir flores y pasto de forma "natural" pero estable
 * entre renders, sin recalcular posiciones cada vez que React
 * vuelve a renderizar un componente.
 */
export function createSeededRandom(seed: number) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(random: () => number, min: number, max: number) {
  return min + random() * (max - min);
}

export function pick<T>(random: () => number, items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

/**
 * Elige un índice respetando pesos relativos (para distribuir especies
 * de flores de forma no uniforme: más margaritas que orquídeas, etc).
 */
export function weightedIndex(random: () => number, weights: number[]) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
