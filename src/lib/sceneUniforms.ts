/**
 * Estado compartido mutable, fuera de React, para animaciones que
 * corren dentro de useFrame a 60fps. Mantenerlo fuera del store de
 * Zustand evita re-renders de React en el hot path de la escena 3D.
 */
export const sceneUniforms = {
  /** Progreso 0→1 de la revelación del jardín durante la transición. */
  reveal: 0,
  /** Reloj acumulado para el viento (pasto, pétalos, flores). */
  windTime: 0,
  /** Multiplicador de intensidad de viento (se reduce en reduced-motion). */
  windStrength: 1,
};
