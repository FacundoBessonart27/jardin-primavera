"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useExperienceStore } from "@/store/experienceStore";
import { playerState } from "@/lib/playerState";
import { touchInputState } from "@/lib/inputState";
import { heightAt, clampToGarden } from "@/lib/terrain";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useIsTouchDevice } from "@/hooks/useIsTouchDevice";
import { raycastFlowerAtCrosshair, trySelectPlacement } from "@/lib/flowerRegistry";

const WALK_SPEED = 2.5; // unidades por segundo
const RUN_MULTIPLIER = 1.85;
const MOUSE_SENSITIVITY = 0.0022;
const TOUCH_LOOK_SENSITIVITY = 0.0062;
const MAX_PITCH = 1.35;
const MAX_DELTA = 1 / 20; // evita saltos si un frame tarda mucho

const MOVE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
]);

/**
 * Cámara en primera persona: reemplaza la órbita anterior por una
 * caminata real por el jardín.
 *
 *  - Escritorio: WASD (o flechas) para moverse, mouse para mirar
 *    (con Pointer Lock, como cualquier juego web), Shift para correr.
 *    Mientras el mouse está bloqueado, la selección de flores se hace
 *    apuntando con la mira central (ver flowerRegistry), porque el
 *    cursor real queda oculto y congelado.
 *  - Táctil: un joystick virtual (ver TouchControls) mueve al jugador
 *    y arrastrar el resto de la pantalla gira la cámara; tocar una
 *    flor la selecciona directamente (igual que antes).
 *
 * La cámara nunca atraviesa el suelo (sigue el relieve del terreno,
 * ver lib/terrain) y queda contenida dentro del límite del jardín.
 */
export function FirstPersonControls() {
  const { camera, gl } = useThree();
  const selected = useExperienceStore((s) => s.selected);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isTouch = useIsTouchDevice();

  const keysRef = useRef<Record<string, boolean>>({});
  const bobTimeRef = useRef(0);
  const hoveredRef = useRef<string | null>(null);
  const eulerRef = useRef(new THREE.Euler(0, 0, 0, "YXZ"));

  // Teclado (sólo relevante en escritorio, pero no molesta si se deja
  // activo en touch: nada escucha esas teclas ahí).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (MOVE_KEYS.has(e.code)) keysRef.current[e.code] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (MOVE_KEYS.has(e.code)) keysRef.current[e.code] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Mouse look + pointer lock (sólo escritorio).
  useEffect(() => {
    if (isTouch) return;
    const canvas = gl.domElement;

    const onClick = () => {
      if (!playerState.movementEnabled) return;
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
        return;
      }
      const placement = raycastFlowerAtCrosshair(camera);
      if (placement) trySelectPlacement(placement);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      if (!playerState.movementEnabled) return;
      playerState.yaw -= e.movementX * MOUSE_SENSITIVITY;
      playerState.pitch = THREE.MathUtils.clamp(
        playerState.pitch - e.movementY * MOUSE_SENSITIVITY,
        -MAX_PITCH,
        MAX_PITCH
      );
    };

    canvas.addEventListener("click", onClick);
    document.addEventListener("mousemove", onMouseMove);
    return () => {
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [camera, gl, isTouch]);

  // Al desmontar (fin de la experiencia de jardín), liberar el mouse.
  useEffect(() => {
    return () => {
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, []);

  useFrame((_, rawDelta) => {
    if (!playerState.movementEnabled) return;

    const delta = Math.min(rawDelta, MAX_DELTA);

    // --- Mirar (táctil: acumulado por TouchControls) ---
    if (isTouch) {
      playerState.yaw -= touchInputState.lookDeltaX * TOUCH_LOOK_SENSITIVITY;
      playerState.pitch = THREE.MathUtils.clamp(
        playerState.pitch - touchInputState.lookDeltaY * TOUCH_LOOK_SENSITIVITY,
        -MAX_PITCH,
        MAX_PITCH
      );
      touchInputState.lookDeltaX = 0;
      touchInputState.lookDeltaY = 0;
    }

    // --- Moverse ---
    let moveX = 0;
    let moveZ = 0;
    let running = false;

    if (isTouch) {
      moveX = touchInputState.moveX;
      moveZ = touchInputState.moveZ;
    } else {
      const k = keysRef.current;
      if (k.KeyW || k.ArrowUp) moveZ -= 1;
      if (k.KeyS || k.ArrowDown) moveZ += 1;
      if (k.KeyA || k.ArrowLeft) moveX -= 1;
      if (k.KeyD || k.ArrowRight) moveX += 1;
      running = Boolean(k.ShiftLeft || k.ShiftRight);
    }

    const inputLength = Math.hypot(moveX, moveZ);
    const hasInput = inputLength > 0.05;

    if (hasInput) {
      const nx = moveX / inputLength;
      const nz = moveZ / inputLength;

      // En táctil, empujar el joystick más lejos del centro corre
      // (sustituye a Shift, que no existe en el celular).
      const touchRunFactor = isTouch
        ? THREE.MathUtils.lerp(1, RUN_MULTIPLIER, THREE.MathUtils.clamp(inputLength, 0, 1))
        : running
          ? RUN_MULTIPLIER
          : 1;

      const speed = WALK_SPEED * touchRunFactor;

      const sinY = Math.sin(playerState.yaw);
      const cosY = Math.cos(playerState.yaw);
      const forwardX = -sinY;
      const forwardZ = -cosY;
      const rightX = cosY;
      const rightZ = -sinY;

      const dx = (forwardX * -nz + rightX * nx) * speed * delta;
      const dz = (forwardZ * -nz + rightZ * nx) * speed * delta;

      const [cx, cz] = clampToGarden(
        playerState.position.x + dx,
        playerState.position.z + dz
      );
      playerState.position.x = cx;
      playerState.position.z = cz;

      bobTimeRef.current += delta * speed * 3.4;
    }

    // --- Cámara: sigue el relieve del terreno, nunca lo atraviesa ---
    const groundY = heightAt(playerState.position.x, playerState.position.z);
    const bobActive = hasInput && !prefersReducedMotion;
    const bobY = bobActive ? Math.sin(bobTimeRef.current) * 0.035 : 0;
    const swayX = bobActive ? Math.sin(bobTimeRef.current * 0.5) * 0.02 : 0;

    camera.position.set(
      playerState.position.x + swayX,
      groundY + playerState.eyeHeight + bobY,
      playerState.position.z
    );

    eulerRef.current.set(playerState.pitch, playerState.yaw, 0);
    camera.quaternion.setFromEuler(eulerRef.current);

    // --- Mira central: qué flor está "apuntada" en modo bloqueado ---
    if (!isTouch && document.pointerLockElement === gl.domElement) {
      const placement = raycastFlowerAtCrosshair(camera);
      const id = placement?.id ?? null;
      if (hoveredRef.current !== id) {
        hoveredRef.current = id;
        useExperienceStore.getState().setHovered(id);
      }
    } else if (hoveredRef.current !== null) {
      hoveredRef.current = null;
      useExperienceStore.getState().setHovered(null);
    }
  });

  // Si se abre el panel de una flor, no interesa mantener el hover de
  // la mira ni el estado de teclas presionadas a mitad de camino.
  useEffect(() => {
    if (selected) keysRef.current = {};
  }, [selected]);

  return null;
}
