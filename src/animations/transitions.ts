import gsap from "gsap";
import * as THREE from "three";
import { cameraController, CAMERA_POSITIONS } from "@/lib/cameraController";
import { sceneUniforms } from "@/lib/sceneUniforms";
import { useExperienceStore } from "@/store/experienceStore";

/**
 * Transición de "Entrar al jardín": la cámara avanza desde la vista
 * abierta de la pantalla 1 hacia la posición de exploración, mientras
 * el jardín se revela progresivamente (ver sceneUniforms.reveal,
 * consumido por FlowerField para hacer crecer cada flor).
 */
export function playEnterGardenTransition(prefersReducedMotion: boolean) {
  const store = useExperienceStore.getState();
  store.setPhase("entering");

  const camera = cameraController.camera;
  const from = CAMERA_POSITIONS.intro;
  const to = CAMERA_POSITIONS.gardenHome;

  if (!camera || prefersReducedMotion) {
    sceneUniforms.reveal = 1;
    if (camera) {
      camera.position.set(to.x, to.y, to.z);
      camera.lookAt(to.lookX, to.lookY, to.lookZ);
      camera.fov = to.fov;
      camera.updateProjectionMatrix();
    }
    window.setTimeout(() => store.setPhase("garden"), 400);
    return;
  }

  const travel = { ...from };
  const lookAt = { x: from.lookX, y: from.lookY, z: from.lookZ };

  const timeline = gsap.timeline({
    defaults: { ease: "power2.inOut" },
    onComplete: () => store.setPhase("garden"),
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

/** Acerca la cámara suavemente hacia una flor seleccionada. */
export function focusOnFlower(position: [number, number, number]) {
  const camera = cameraController.camera;
  const controls = cameraController.controls;
  if (!camera) return;

  if (controls) controls.enabled = false;

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

  if (controls) {
    gsap.to(controls.target, {
      x,
      y: y + 0.6,
      z,
      duration: 1.4,
      ease: "power3.out",
    });
  }
}

/** Vuelve la cámara a la posición de exploración libre del jardín. */
export function returnToGardenHome() {
  const camera = cameraController.camera;
  const controls = cameraController.controls;
  if (!camera) return;
  const home = CAMERA_POSITIONS.gardenHome;

  gsap.to(camera.position, {
    x: home.x,
    y: home.y,
    z: home.z,
    duration: 1.2,
    ease: "power2.inOut",
    onUpdate: () => camera.lookAt(home.lookX, home.lookY, home.lookZ),
    onComplete: () => {
      if (controls) controls.enabled = true;
    },
  });

  if (controls) {
    gsap.to(controls.target, {
      x: home.lookX,
      y: home.lookY,
      z: home.lookZ,
      duration: 1.2,
      ease: "power2.inOut",
    });
  }
}

/** Cámara alejándose lentamente para el momento final. */
export function pullBackForFinale() {
  const camera = cameraController.camera;
  const controls = cameraController.controls;
  if (controls) controls.enabled = false;
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
