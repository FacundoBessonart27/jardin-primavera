/**
 * Puente de input táctil entre la UI 2D (VirtualJoystick, fuera del
 * <Canvas>) y FirstPersonControls (dentro del <Canvas>). Vive fuera de
 * React por la misma razón que playerState/sceneUniforms: se lee/escribe
 * a 60fps y no tiene sentido pasar por el ciclo de render de React.
 */
export const touchInputState = {
  /** Vector de movimiento del joystick virtual, -1..1 en cada eje.
   * Se mantiene mientras el dedo está sobre el joystick (no es un
   * delta, es una dirección sostenida, como un joystick real). */
  moveX: 0,
  moveZ: 0,
  /** Delta de mirada acumulado desde el último frame consumido por
   * FirstPersonControls (que lo resetea a 0 tras leerlo). */
  lookDeltaX: 0,
  lookDeltaY: 0,
};
