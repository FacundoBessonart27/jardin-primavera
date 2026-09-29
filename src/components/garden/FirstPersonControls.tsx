"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useExperienceStore } from "@/store/experienceStore";
import { playerState } from "@/lib/playerState";
import { touchInputState } from "@/lib/inputState";
import { resolveMove, walkHeightAt } from "@/lib/terrain";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useIsTouchDevice } from "@/hooks/useIsTouchDevice";
import { raycastFlowerAtCrosshair, trySelectPlacement } from "@/lib/flowerRegistry";

const WALK_SPEED = 2.5; // unidades por segundo
const RUN_MULTIPLIER = 1.85;
const MOUSE_SENSITIVITY = 0.0022;
const TOUCH_LOOK_SENSITIVITY = 0.0062;
const MAX_PITCH = 1.35;
const MAX_DELTA = 1 / 20; // evita saltos si un frame tarda mucho
/** Qué tan rápido se alcanza la velocidad deseada al empezar a caminar
 * y al frenar (1/s): pasos que arrancan y se detienen con suavidad, en
 * vez de moverse o pararse de golpe. */
const ACCELERATION = 7;
const DECELERATION = 9;
/** Joystick: zona muerta y curva de respuesta (más control fino cerca
 * del centro, velocidad plena al fondo). */
const JOYSTICK_DEAD_ZONE = 0.08;
const JOYSTICK_CURVE = 1.35;
/** Zoom: cuánto se puede acercar (menos campo visual) o alejar. */
const ZOOM_MIN = 0.58;
const ZOOM_MAX = 1.3;
const FOV_MIN = 30;
const FOV_MAX = 88;

/** Campo visual vertical base según la forma de la pantalla: en un
 * celular vertical se abre más, para no ver el jardín "por una rendija"
 * (el campo horizontal nunca baja de ~62° mientras se pueda). */
function baseFovFor(aspect: number): number {
  const vertical = 60;
  const minHorizontal = THREE.MathUtils.degToRad(62);
  const needed = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minHorizontal / 2) / aspect));
  return THREE.MathUtils.clamp(Math.max(vertical, needed), vertical, 80);
}

function applyZoom(factor: number) {
  playerState.zoom = THREE.MathUtils.clamp(playerState.zoom * factor, ZOOM_MIN, ZOOM_MAX);
}

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

const ZOOM_IN_KEYS = new Set(["Equal", "NumpadAdd", "KeyE"]);
const ZOOM_OUT_KEYS = new Set(["Minus", "NumpadSubtract", "KeyQ"]);

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
 * el puente y la escalinata del santuario, ver lib/terrain), queda
 * contenida dentro del jardín y no atraviesa agua, árboles, faroles,
 * bancos ni el santuario (se desliza a lo largo de ellos).
 *
 * Zoom: rueda del mouse o teclas +/- (Q/E) en escritorio, pellizco con
 * dos dedos en el celular. Cambia el campo visual dentro de un rango
 * acotado (nunca "sale" del cuerpo del jugador).
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
  const velocityRef = useRef(new THREE.Vector2());
  /** Altura del suelo suavizada (escalones, puente) para que la cámara
   * no dé saltitos al subir o bajar. */
  const groundRef = useRef<number | null>(null);

  // Teclado (sólo relevante en escritorio, pero no molesta si se deja
  // activo en touch: nada escucha esas teclas ahí).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (MOVE_KEYS.has(e.code)) keysRef.current[e.code] = true;
      if (!playerState.movementEnabled) return;
      if (ZOOM_IN_KEYS.has(e.code)) applyZoom(0.88);
      if (ZOOM_OUT_KEYS.has(e.code)) applyZoom(1 / 0.88);
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

    const onWheel = (e: WheelEvent) => {
      if (!playerState.movementEnabled) return;
      applyZoom(Math.exp(THREE.MathUtils.clamp(e.deltaY, -120, 120) * 0.0012));
    };

    canvas.addEventListener("click", onClick);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("wheel", onWheel);
    };
  }, [camera, gl, isTouch]);

  // Al desmontar (fin de la experiencia de jardín), liberar el mouse.
  useEffect(() => {
    return () => {
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, []);

  useFrame((_, rawDelta) => {
    if (!playerState.movementEnabled) {
      // Al retomar el control (cerrar un panel) no queda inercia vieja.
      velocityRef.current.set(0, 0);
      return;
    }

    const delta = Math.min(rawDelta, MAX_DELTA);

    // --- Zoom (pellizco en táctil; rueda/teclas ya aplicadas) y campo visual ---
    if (touchInputState.pinchScale !== 1) {
      applyZoom(touchInputState.pinchScale);
      touchInputState.pinchScale = 1;
    }
    const perspective = camera as THREE.PerspectiveCamera;
    const targetFov = THREE.MathUtils.clamp(
      baseFovFor(perspective.aspect) * playerState.zoom,
      FOV_MIN,
      FOV_MAX
    );
    if (Math.abs(perspective.fov - targetFov) > 0.01) {
      perspective.fov += (targetFov - perspective.fov) * (1 - Math.exp(-8 * delta));
      perspective.updateProjectionMatrix();
    }

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
      const raw = Math.hypot(touchInputState.moveX, touchInputState.moveZ);
      if (raw > JOYSTICK_DEAD_ZONE) {
        const shaped = Math.pow(
          Math.min(1, (raw - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE)),
          JOYSTICK_CURVE
        );
        moveX = (touchInputState.moveX / raw) * shaped;
        moveZ = (touchInputState.moveZ / raw) * shaped;
      }
    } else {
      const k = keysRef.current;
      if (k.KeyW || k.ArrowUp) moveZ -= 1;
      if (k.KeyS || k.ArrowDown) moveZ += 1;
      if (k.KeyA || k.ArrowLeft) moveX -= 1;
      if (k.KeyD || k.ArrowRight) moveX += 1;
      running = Boolean(k.ShiftLeft || k.ShiftRight);
    }

    const inputLength = Math.hypot(moveX, moveZ);
    const hasInput = inputLength > 0.02;

    // Velocidad deseada (en el plano del mundo) según la entrada.
    let targetX = 0;
    let targetZ = 0;
    if (hasInput) {
      const nx = moveX / inputLength;
      const nz = moveZ / inputLength;

      // En táctil, empujar el joystick más lejos del centro corre
      // (sustituye a Shift, que no existe en el celular).
      const speed = isTouch
        ? WALK_SPEED * THREE.MathUtils.lerp(0.35, RUN_MULTIPLIER, THREE.MathUtils.clamp(inputLength, 0, 1))
        : WALK_SPEED * (running ? RUN_MULTIPLIER : 1);

      const sinY = Math.sin(playerState.yaw);
      const cosY = Math.cos(playerState.yaw);
      const forwardX = -sinY;
      const forwardZ = -cosY;
      const rightX = cosY;
      const rightZ = -sinY;

      targetX = (forwardX * -nz + rightX * nx) * speed;
      targetZ = (forwardZ * -nz + rightZ * nx) * speed;
    }

    // Aceleración y frenado suaves (independientes de los fps).
    const velocity = velocityRef.current;
    const rate = hasInput ? ACCELERATION : DECELERATION;
    const blend = 1 - Math.exp(-rate * delta);
    velocity.x += (targetX - velocity.x) * blend;
    velocity.y += (targetZ - velocity.y) * blend;
    const currentSpeed = velocity.length();
    if (!hasInput && currentSpeed < 0.01) velocity.set(0, 0);

    if (currentSpeed > 0.001) {
      const fromX = playerState.position.x;
      const fromZ = playerState.position.z;
      const [cx, cz] = resolveMove(fromX, fromZ, fromX + velocity.x * delta, fromZ + velocity.y * delta);
      playerState.position.x = cx;
      playerState.position.z = cz;
      // Si algo frenó el paso, la velocidad acompaña (sin "empujar" contra
      // el obstáculo ni rebotar al soltarlo).
      if (delta > 0) {
        velocity.x = (cx - fromX) / delta;
        velocity.y = (cz - fromZ) / delta;
      }
      bobTimeRef.current += delta * currentSpeed * 3.4;
    }

    // --- Cámara: sigue el relieve del terreno, nunca lo atraviesa ---
    const rawGround = walkHeightAt(playerState.position.x, playerState.position.z);
    if (groundRef.current === null) groundRef.current = rawGround;
    groundRef.current += (rawGround - groundRef.current) * (1 - Math.exp(-14 * delta));
    const groundY = Math.max(groundRef.current, rawGround - 0.05);
    // El balanceo de la caminata crece y se apaga con la velocidad (no
    // se corta de golpe al soltar la tecla o el joystick).
    const bobAmount = prefersReducedMotion
      ? 0
      : THREE.MathUtils.clamp(currentSpeed / WALK_SPEED, 0, 1.2);
    const bobY = Math.sin(bobTimeRef.current) * 0.035 * bobAmount;
    const swayX = Math.sin(bobTimeRef.current * 0.5) * 0.02 * bobAmount;

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
