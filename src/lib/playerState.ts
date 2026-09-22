import * as THREE from "three";
import { CAMERA_POSITIONS, cameraController } from "./cameraController";

/**
 * Estado mutable del "jugador" en primera persona: dónde está parado
 * y hacia dónde mira. Vive fuera de React (igual que sceneUniforms y
 * cameraController) porque FirstPersonControls lo actualiza a 60fps
 * y no tiene sentido pasar por el ciclo de render de React para eso.
 *
 * Cuando se selecciona una flor (ver animations/transitions.ts), la
 * cámara pasa a estar controlada por un tween de GSAP; `movementEnabled`
 * en false le indica a FirstPersonControls que deje de tocar la
 * cámara mientras tanto. Al cerrar el panel, la cámara vuelve
 * exactamente a `position`/`yaw`/`pitch` (donde el jugador había
 * quedado parado), no a un punto fijo — así se siente como una
 * caminata real, no un teletransporte.
 */
export const playerState = {
  position: new THREE.Vector3(
    CAMERA_POSITIONS.gardenHome.x,
    0,
    CAMERA_POSITIONS.gardenHome.z
  ),
  yaw: Math.PI, // mirando hacia -Z (hacia adentro del jardín)
  pitch: -0.08,
  eyeHeight: 1.62,
  movementEnabled: true,
  /** Se pone en true la primera vez que se activa el modo caminar,
   * para no reiniciar la posición del jugador en visitas repetidas. */
  spawned: false,
};

export function forwardFromLook(yaw: number, pitch: number, out = new THREE.Vector3()) {
  out.set(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  );
  return out;
}

const _forward = new THREE.Vector3();

/** Copia posición/orientación actuales de la cámara al estado del
 * jugador, para que FirstPersonControls retome el control exactamente
 * donde una animación de cámara (GSAP) lo dejó, sin saltos visuales. */
export function syncPlayerStateFromCamera() {
  const camera = cameraController.camera;
  if (!camera) return;
  playerState.position.set(camera.position.x, 0, camera.position.z);
  _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  playerState.pitch = Math.asin(THREE.MathUtils.clamp(_forward.y, -1, 1));
  playerState.yaw = Math.atan2(-_forward.x, -_forward.z);
  playerState.spawned = true;
}

export function resetPlayerToSpawn() {
  playerState.position.set(
    CAMERA_POSITIONS.gardenHome.x,
    0,
    CAMERA_POSITIONS.gardenHome.z
  );
  playerState.yaw = Math.PI;
  playerState.pitch = -0.08;
  playerState.spawned = true;
}
