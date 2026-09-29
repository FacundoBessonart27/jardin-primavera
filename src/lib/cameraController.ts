import type * as THREE from "three";
import { walkHeightAt } from "./terrain";
import { PLAZA, SHRINE, SPAWN } from "./gardenPlan";

/**
 * Referencia mutable compartida entre el CameraRig (que vive dentro
 * del <Canvas>) y las animaciones GSAP (que corren fuera del árbol de
 * R3F, en animations/transitions.ts). Evita tener que subir estado de
 * R3F a React sólo para poder animarlo desde afuera. Durante la
 * exploración libre, quien mueve la cámara es FirstPersonControls
 * (ver playerState.ts); durante una transición de GSAP, se pausa
 * (playerState.movementEnabled = false) y la cámara queda en manos
 * del tween.
 */
export const cameraController: {
  camera: THREE.PerspectiveCamera | null;
  /** true cuando terminó el alejamiento del final: desde ahí la cámara
   * "respira" despacio sobre el jardín (ver CameraRig). */
  finaleSettled: boolean;
} = {
  camera: null,
  finaleSettled: false,
};

/** Altura de los ojos del jugador sobre el suelo. */
export const EYE_HEIGHT = 1.62;

const spawnGround = walkHeightAt(SPAWN.x, SPAWN.z);
const plazaGround = walkHeightAt(PLAZA.x, PLAZA.z);

export const CAMERA_POSITIONS = {
  // Apertura: desde afuera de la entrada, un poco en alto, mirando el
  // valle entero y, al fondo, el lugar donde espera el santuario.
  intro: { x: 0, y: spawnGround + 7.4, z: SPAWN.z + 7.5, lookX: 0, lookY: 1.4, lookZ: -16, fov: 52 },
  // Donde arranca la caminata (a la altura de los ojos, sin saltos al
  // pasar al control en primera persona).
  gardenHome: {
    x: SPAWN.x,
    y: spawnGround + EYE_HEIGHT,
    z: SPAWN.z,
    lookX: 0,
    lookY: spawnGround + 1.25,
    lookZ: SPAWN.z - 10,
    fov: 60,
  },
  // Final: en alto sobre la plaza, con el santuario y el círculo de flores.
  finale: {
    x: -2.2,
    y: plazaGround + 9.2,
    z: PLAZA.z + 13.5,
    lookX: 0,
    lookY: plazaGround + 0.6,
    lookZ: (PLAZA.z + SHRINE.z) / 2,
    fov: 50,
  },
};
