"use client";

import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useExperienceStore } from "@/store/experienceStore";
import { cameraController, CAMERA_POSITIONS } from "@/lib/cameraController";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { FirstPersonControls } from "./FirstPersonControls";

/** Mantiene la referencia global de cámara y aplica el pequeño
 * movimiento de vida (idle) durante la pantalla de apertura. Una vez
 * en el jardín, quien maneja la cámara es FirstPersonControls (modo
 * caminar); acá sólo se monta. */
export function CameraRig() {
  const { camera } = useThree();
  const phase = useExperienceStore((s) => s.phase);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    cameraController.camera = camera as THREE.PerspectiveCamera;
    const home = CAMERA_POSITIONS.intro;
    camera.position.set(home.x, home.y, home.z);
    camera.lookAt(home.lookX, home.lookY, home.lookZ);
    (camera as THREE.PerspectiveCamera).fov = home.fov;
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame(({ clock }) => {
    if (phase !== "intro" || prefersReducedMotion) return;
    const t = clock.getElapsedTime();
    const home = CAMERA_POSITIONS.intro;
    camera.position.set(
      home.x + Math.sin(t * 0.15) * 0.4,
      home.y + Math.sin(t * 0.25) * 0.15,
      home.z + Math.cos(t * 0.12) * 0.3
    );
    camera.lookAt(home.lookX, home.lookY, home.lookZ);
  });

  if (phase !== "garden") return null;

  return <FirstPersonControls />;
}
