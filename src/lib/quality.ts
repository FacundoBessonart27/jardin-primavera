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
  /** Pixel ratio máximo permitido para el canvas. */
  maxDpr: number;
  shadows: boolean;
  bloom: boolean;
}

export const QUALITY_PRESETS: Record<QualityTier, QualitySettings> = {
  high: {
    tier: "high",
    flowerCount: 260,
    grassCount: 4000,
    petalCount: 60,
    butterflyCount: 5,
    shrubCount: 70,
    litterCount: 90,
    maxDpr: 2,
    shadows: true,
    bloom: true,
  },
  medium: {
    tier: "medium",
    flowerCount: 160,
    grassCount: 2000,
    petalCount: 36,
    butterflyCount: 3,
    shrubCount: 42,
    litterCount: 55,
    maxDpr: 1.5,
    shadows: true,
    bloom: false,
  },
  low: {
    tier: "low",
    flowerCount: 90,
    grassCount: 800,
    petalCount: 18,
    butterflyCount: 1,
    shrubCount: 18,
    litterCount: 22,
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
