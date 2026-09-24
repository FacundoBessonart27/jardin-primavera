import type * as THREE from "three";

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
} = {
  camera: null,
};

export const CAMERA_POSITIONS = {
  intro: { x: 0, y: 3.6, z: 10.5, lookX: 0, lookY: 1.4, lookZ: -1, fov: 42 },
  gardenHome: { x: 0, y: 2.1, z: 4.6, lookX: 0, lookY: 1.1, lookZ: -1.5, fov: 50 },
  finale: { x: 0, y: 5.5, z: 12, lookX: 0, lookY: 1.6, lookZ: -2, fov: 46 },
};
