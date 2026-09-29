export type QualityTier = "high" | "medium" | "low";

export interface QualitySettings {
  tier: QualityTier;
  /** Cuántas flores individuales se instancian en el campo. */
  flowerCount: number;
  /** Cantidad de mechones de pasto instanciados. */
  grassCount: number;
  /** Cantidad de pétalos/partículas flotando. */
  petalCount: number;
  /** Cantidad máxima de mariposas simultáneas. */
  butterflyCount: number;
  /** Arbustos bajos / vegetación silvestre de relleno. */
  shrubCount: number;
  /** Piedras y hojas caídas sobre el terreno. */
  litterCount: number;
  /** Distancia (m) hasta la que se dibujan las flores. */
  flowerDrawDistance: number;
  /** Pétalos de sakura cayendo de los árboles. */
  sakuraPetalCount: number;
  /** Pétalos caídos sobre el suelo y el camino. */
  groundPetalCount: number;
  /** Árboles del bosque que rodea el valle. */
  farTreeCount: number;
  /** Tarjetas de flor por racimo en las copas de sakura (1 = completo). */
  canopyDetail: number;
  /** Luciérnagas / motas de luz en la zona del santuario. */
  fireflyCount: number;
  /** Aves lejanas en el cielo. */
  birdCount: number;
  /** Pixel ratio máximo permitido para el canvas. */
  maxDpr: number;
  shadows: boolean;
  bloom: boolean;
}

export const QUALITY_PRESETS: Record<QualityTier, QualitySettings> = {
  high: {
    tier: "high",
    flowerCount: 520,
    grassCount: 9000,
    petalCount: 70,
    butterflyCount: 7,
    shrubCount: 150,
    litterCount: 160,
    flowerDrawDistance: 58,
    sakuraPetalCount: 240,
    groundPetalCount: 1600,
    farTreeCount: 300,
    canopyDetail: 1,
    fireflyCount: 36,
    birdCount: 7,
    maxDpr: 2,
    shadows: true,
    bloom: true,
  },
  medium: {
    tier: "medium",
    flowerCount: 270,
    grassCount: 4400,
    petalCount: 42,
    butterflyCount: 5,
    shrubCount: 95,
    litterCount: 100,
    flowerDrawDistance: 40,
    sakuraPetalCount: 140,
    groundPetalCount: 700,
    farTreeCount: 190,
    canopyDetail: 0.5,
    fireflyCount: 26,
    birdCount: 5,
    maxDpr: 1.5,
    shadows: true,
    bloom: false,
  },
  low: {
    tier: "low",
    flowerCount: 150,
    grassCount: 2200,
    petalCount: 20,
    butterflyCount: 2,
    shrubCount: 45,
    litterCount: 45,
    flowerDrawDistance: 30,
    sakuraPetalCount: 60,
    groundPetalCount: 300,
    farTreeCount: 110,
    canopyDetail: 0.35,
    fireflyCount: 14,
    birdCount: 3,
    maxDpr: 1,
    shadows: false,
    bloom: false,
  },
};

/**
 * Heurística simple y barata para estimar la potencia del dispositivo,
 * sin bloquear el hilo principal. Se ejecuta una sola vez en el cliente.
 */
export function detectQualityTier(): QualityTier {
  if (typeof window === "undefined") return "medium";

  const isCoarsePointer = window.matchMedia?.("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  // deviceMemory no está tipado en lib.dom por defecto ni disponible en iOS.
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  const isSmallScreen = window.innerWidth < 480;

  let score = 0;
  score += cores >= 8 ? 2 : cores >= 4 ? 1 : 0;
  score += memory === undefined ? 1 : memory >= 8 ? 2 : memory >= 4 ? 1 : 0;
  score += isCoarsePointer ? -1 : 1;
  score += isSmallScreen ? -1 : 0;

  if (score >= 3) return "high";
  if (score >= 0) return "medium";
  return "low";
}
