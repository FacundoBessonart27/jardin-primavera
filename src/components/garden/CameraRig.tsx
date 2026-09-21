"use client";

import { useEffect, useRef, type ElementRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useExperienceStore } from "@/store/experienceStore";
import { cameraController, CAMERA_POSITIONS } from "@/lib/cameraController";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/** Mantiene la referencia global de cámara/controles y aplica el
 * pequeño movimiento de vida (idle) mientras no hay una animación
 * GSAP activa controlando la cámara. */
export function CameraRig() {
  const { camera } = useThree();
  const phase = useExperienceStore((s) => s.phase);
  const selected = useExperienceStore((s) => s.selected);
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    cameraController.camera = camera as THREE.PerspectiveCamera;
    const home = CAMERA_POSITIONS.intro;
    camera.position.set(home.x, home.y, home.z);
    camera.lookAt(home.lookX, home.lookY, home.lookZ);
    (camera as THREE.PerspectiveCamera).fov = home.fov;
    camera.updateProjectionMatrix();
  }, [camera]);

  useEffect(() => {
    cameraController.controls = controlsRef.current as unknown as {
      enabled: boolean;
      target: THREE.Vector3;
      update: () => void;
    } | null;
  }, [phase]);

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

  return (
    <OrbitControls
      ref={controlsRef}
      target={[
        CAMERA_POSITIONS.gardenHome.lookX,
        CAMERA_POSITIONS.gardenHome.lookY,
        CAMERA_POSITIONS.gardenHome.lookZ,
      ]}
      enabled={!selected}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={2.5}
      maxDistance={8}
      minPolarAngle={Math.PI * 0.25}
      maxPolarAngle={Math.PI * 0.52}
      rotateSpeed={0.5}
      zoomSpeed={0.6}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
    />
  );
}
