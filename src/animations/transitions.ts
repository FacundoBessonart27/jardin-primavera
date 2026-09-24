import gsap from "gsap";
import * as THREE from "three";
import { cameraController, CAMERA_POSITIONS } from "@/lib/cameraController";
import { sceneUniforms } from "@/lib/sceneUniforms";
import { useExperienceStore } from "@/store/experienceStore";
import {
  playerState,
  forwardFromLook,
  syncPlayerStateFromCamera,
} from "@/lib/playerState";
import { heightAt } from "@/lib/terrain";

/**
 * Transición de "Entrar al jardín": la cámara avanza desde la vista
 * abierta de la pantalla 1 hacia la posición de exploración, mientras
 * el jardín se revela progresivamente (ver sceneUniforms.reveal,
 * consumido por FlowerField para hacer crecer cada flor). Al terminar,
 * el control pasa a FirstPersonControls exactamente desde donde quedó
 * la cámara (ver syncPlayerStateFromCamera), sin saltos.
 */
export function playEnterGardenTransition(prefersReducedMotion: boolean) {
  const store = useExperienceStore.getState();
  store.setPhase("entering");

  const camera = cameraController.camera;
  const from = CAMERA_POSITIONS.intro;
  const to = CAMERA_POSITIONS.gardenHome;

  const finishEntering = () => {
    syncPlayerStateFromCamera();
    store.setPhase("garden");
  };

  if (!camera || prefersReducedMotion) {
    sceneUniforms.reveal = 1;
    if (camera) {
      camera.position.set(to.x, to.y, to.z);
      camera.lookAt(to.lookX, to.lookY, to.lookZ);
      camera.fov = to.fov;
      camera.updateProjectionMatrix();
    }
    window.setTimeout(finishEntering, 400);
    return;
  }

  const travel = { ...from };
  const lookAt = { x: from.lookX, y: from.lookY, z: from.lookZ };

  const timeline = gsap.timeline({
    defaults: { ease: "power2.inOut" },
    onComplete: finishEntering,
  });

  timeline.to(
    travel,
    {
      x: to.x,
      y: to.y,
      z: to.z,
      fov: to.fov,
      duration: 3.4,
      onUpdate: () => {
        camera.position.set(travel.x, travel.y, travel.z);
        camera.fov = travel.fov;
        camera.updateProjectionMatrix();
      },
    },
    0
  );

  timeline.to(
    lookAt,
    {
      x: to.lookX,
      y: to.lookY,
      z: to.lookZ,
      duration: 3.4,
      onUpdate: () => {
        camera.lookAt(lookAt.x, lookAt.y, lookAt.z);
      },
    },
    0
  );

  timeline.to(
    sceneUniforms,
    {
      reveal: 1,
      duration: 3,
      ease: "power1.out",
    },
    0.3
  );

  return timeline;
}

/** Acerca la cámara suavemente hacia una flor seleccionada, pausando
 * el movimiento del jugador mientras el panel está abierto (y
 * liberando el mouse si estaba bloqueado, para poder usar la UI). */
export function focusOnFlower(position: [number, number, number]) {
  const camera = cameraController.camera;
  if (!camera) return;

  playerState.movementEnabled = false;
  if (typeof document !== "undefined" && document.pointerLockElement) {
    document.exitPointerLock();
  }

  const [x, y, z] = position;
  const flowerPoint = new THREE.Vector3(x, y + 1, z);
  const dir = camera.position.clone().sub(flowerPoint).normalize();

  const targetPos = {
    x: x + dir.x * 1.6,
    y: y + 1.1,
    z: z + dir.z * 1.6,
  };

  gsap.to(camera.position, {
    x: targetPos.x,
    y: targetPos.y,
    z: targetPos.z,
    duration: 1.4,
    ease: "power3.out",
    onUpdate: () => camera.lookAt(x, y + 0.6, z),
  });
}

/** Devuelve la cámara exactamente a donde el jugador estaba parado y
 * mirando antes de abrir el panel de una flor (no a un punto fijo),
 * para que se sienta como retomar una caminata y no un teletransporte.
 * Al terminar, FirstPersonControls retoma el control. */
export function returnToGardenHome() {
  const camera = cameraController.camera;
  if (!camera) return;

  const groundY = heightAt(playerState.position.x, playerState.position.z);
  const targetPos = {
    x: playerState.position.x,
    y: groundY + playerState.eyeHeight,
    z: playerState.position.z,
  };

  const forward = forwardFromLook(playerState.yaw, playerState.pitch);
  const lookAtPoint = {
    x: targetPos.x + forward.x * 4,
    y: targetPos.y + forward.y * 4,
    z: targetPos.z + forward.z * 4,
  };

  gsap.to(camera.position, {
    x: targetPos.x,
    y: targetPos.y,
    z: targetPos.z,
    duration: 1.2,
    ease: "power2.inOut",
    onUpdate: () => camera.lookAt(lookAtPoint.x, lookAtPoint.y, lookAtPoint.z),
    onComplete: () => {
      playerState.movementEnabled = true;
    },
  });
}

/** Cámara alejándose lentamente para el momento final. */
export function pullBackForFinale() {
  playerState.movementEnabled = false;
  if (typeof document !== "undefined" && document.pointerLockElement) {
    document.exitPointerLock();
  }

  const camera = cameraController.camera;
  if (!camera) return;
  const finale = CAMERA_POSITIONS.finale;

  gsap.to(camera.position, {
    x: finale.x,
    y: finale.y,
    z: finale.z,
    duration: 3.2,
    ease: "power2.inOut",
    onUpdate: () => camera.lookAt(finale.lookX, finale.lookY, finale.lookZ),
  });
}
