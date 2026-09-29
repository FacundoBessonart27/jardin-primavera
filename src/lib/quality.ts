export type QualityTier = "high" | "medium" | "low";

export interface QualitySettings {
  tier: QualityTier;
  /** Cuántas flores individuales se instancian en el campo. */
  flowerCount: number;
  /** Cantidad de mechones de pasto instanciados. */
  grassCount: number;
  /** Radio (m) alrededor de la cámara en el que se dibuja el pasto. */
  grassRadius: number;
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
  /** Distancia (m) desde la que las flores usan su geometría liviana. */
  flowerLodDistance: number;
  /** Distancia (m) hasta la que las flores proyectan sombra. */
  flowerShadowDistance: number;
  /** Material de flores sin "sheen" (más barato por píxel). */
  flowerLite: boolean;
  /** Pétalos de sakura cayendo de los árboles. */
  sakuraPetalCount: number;
  /** Pétalos caídos sobre el suelo y el camino. */
  groundPetalCount: number;
  /** Árboles del bosque que rodea el valle. */
  farTreeCount: number;
  /** Detalle de las copas de sakura cercanas (1 = completo). */
  canopyDetail: number;
  /** Distancia (m) desde la que un grupo de sakuras usa su versión liviana. */
  treeLodDistance: number;
  /** Luciérnagas / motas de luz en la zona del santuario. */
  fireflyCount: number;
  /** Aves lejanas en el cielo. */
  birdCount: number;
  /** Pixel ratio máximo permitido para el canvas. */
  maxDpr: number;
  shadows: boolean;
  /** Sombras suaves (PCF soft) o PCF simple, más barato. */
  softShadows: boolean;
  /** Cada cuántos frames se recalcula el mapa de sombras. */
  shadowInterval: number;
  bloom: boolean;
}

/**
 * Los tres niveles cambian el COSTO de dibujar, no el diseño: los
 * caminos, canteros, sakuras, puente, torii, plaza, flor especial y
 * santuario están siempre. Lo que varía es el detalle lejano, la
 * cantidad de partículas, las sombras y la resolución.
 */
export const QUALITY_PRESETS: Record<QualityTier, QualitySettings> = {
  high: {
    tier: "high",
    flowerCount: 520,
    grassCount: 9000,
    grassRadius: 34,
    petalCount: 70,
    butterflyCount: 7,
    shrubCount: 150,
    litterCount: 160,
    flowerDrawDistance: 58,
    flowerLodDistance: 18,
    flowerShadowDistance: 16,
    flowerLite: false,
    sakuraPetalCount: 240,
    groundPetalCount: 1600,
    farTreeCount: 300,
    canopyDetail: 1,
    treeLodDistance: 30,
    fireflyCount: 36,
    birdCount: 7,
    maxDpr: 2,
    shadows: true,
    softShadows: true,
    shadowInterval: 1,
    bloom: true,
  },
  medium: {
    tier: "medium",
    flowerCount: 270,
    grassCount: 4400,
    grassRadius: 26,
    petalCount: 42,
    butterflyCount: 5,
    shrubCount: 95,
    litterCount: 100,
    flowerDrawDistance: 40,
    flowerLodDistance: 13,
    flowerShadowDistance: 9,
    flowerLite: false,
    sakuraPetalCount: 130,
    groundPetalCount: 700,
    farTreeCount: 170,
    canopyDetail: 0.6,
    treeLodDistance: 22,
    fireflyCount: 22,
    birdCount: 5,
    maxDpr: 1.35,
    shadows: true,
    softShadows: false,
    shadowInterval: 2,
    bloom: false,
  },
  low: {
    tier: "low",
    flowerCount: 150,
    grassCount: 2200,
    grassRadius: 20,
    petalCount: 20,
    butterflyCount: 2,
    shrubCount: 45,
    litterCount: 45,
    flowerDrawDistance: 30,
    flowerLodDistance: 10,
    flowerShadowDistance: 0,
    flowerLite: true,
    sakuraPetalCount: 50,
    groundPetalCount: 300,
    farTreeCount: 100,
    canopyDetail: 0.35,
    treeLodDistance: 16,
    fireflyCount: 12,
    birdCount: 3,
    maxDpr: 1,
    shadows: false,
    softShadows: false,
    shadowInterval: 1,
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
