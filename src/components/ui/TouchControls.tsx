"use client";

import { useEffect, useRef, useState } from "react";
import { touchInputState } from "@/lib/inputState";
import { cameraController } from "@/lib/cameraController";
import { raycastFlowerAt, trySelectPlacement } from "@/lib/flowerRegistry";

const JOYSTICK_RADIUS = 52;
const TAP_MAX_MOVEMENT = 10; // px: por debajo de esto, un toque es un "tap", no un arrastre
const TAP_MAX_DURATION = 350; // ms

interface LookTouchInfo {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  dragged: boolean;
}

/**
 * Controles táctiles para caminar por el jardín en el celular:
 *  - Joystick virtual (abajo a la izquierda) para desplazarse.
 *  - Arrastrar en cualquier otro lugar de la pantalla gira la cámara
 *    (reemplaza al arrastre de la órbita anterior, ahora aplicado a
 *    mirar en primera persona en vez de orbitar).
 *  - Un toque corto (sin arrastre) sobre una flor la selecciona,
 *    igual que antes.
 */
export function TouchControls() {
  const joystickRef = useRef<HTMLDivElement>(null);
  const [nubOffset, setNubOffset] = useState({ x: 0, y: 0 });
  const [joystickActive, setJoystickActive] = useState(false);
  const moveTouchId = useRef<number | null>(null);
  const lookTouches = useRef<Map<number, LookTouchInfo>>(new Map());

  const updateJoystickFromPoint = (clientX: number, clientY: number) => {
    const base = joystickRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > JOYSTICK_RADIUS) {
      dx = (dx / dist) * JOYSTICK_RADIUS;
      dy = (dy / dist) * JOYSTICK_RADIUS;
    }
    setNubOffset({ x: dx, y: dy });
    touchInputState.moveX = dx / JOYSTICK_RADIUS;
    touchInputState.moveZ = dy / JOYSTICK_RADIUS;
  };

  const handleJoystickStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (moveTouchId.current !== null) return;
    const touch = e.changedTouches[0];
    moveTouchId.current = touch.identifier;
    setJoystickActive(true);
    updateJoystickFromPoint(touch.clientX, touch.clientY);
  };

  const handleJoystickMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = Array.from(e.touches).find(
      (t) => t.identifier === moveTouchId.current
    );
    if (touch) updateJoystickFromPoint(touch.clientX, touch.clientY);
  };

  const endJoystick = (e: React.TouchEvent) => {
    e.stopPropagation();
    const stillActive = Array.from(e.touches).some(
      (t) => t.identifier === moveTouchId.current
    );
    if (stillActive) return;
    moveTouchId.current = null;
    setJoystickActive(false);
    setNubOffset({ x: 0, y: 0 });
    touchInputState.moveX = 0;
    touchInputState.moveZ = 0;
  };

  // Resto de la pantalla: mirar (arrastre) o seleccionar una flor (tap).
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (touch.identifier === moveTouchId.current) continue;
        lookTouches.current.set(touch.identifier, {
          startX: touch.clientX,
          startY: touch.clientY,
          lastX: touch.clientX,
          lastY: touch.clientY,
          startTime: performance.now(),
          dragged: false,
        });
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      for (const touch of Array.from(e.touches)) {
        const info = lookTouches.current.get(touch.identifier);
        if (!info) continue;
        const dx = touch.clientX - info.lastX;
        const dy = touch.clientY - info.lastY;
        info.lastX = touch.clientX;
        info.lastY = touch.clientY;
        if (
          !info.dragged &&
          Math.hypot(
            touch.clientX - info.startX,
            touch.clientY - info.startY
          ) > TAP_MAX_MOVEMENT
        ) {
          info.dragged = true;
        }
        if (info.dragged) {
          touchInputState.lookDeltaX += dx;
          touchInputState.lookDeltaY += dy;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        const info = lookTouches.current.get(touch.identifier);
        if (!info) continue;
        lookTouches.current.delete(touch.identifier);
        const duration = performance.now() - info.startTime;
        if (!info.dragged && duration < TAP_MAX_DURATION) {
          const camera = cameraController.camera;
          if (camera) {
            const ndcX = (touch.clientX / window.innerWidth) * 2 - 1;
            const ndcY = -(touch.clientY / window.innerHeight) * 2 + 1;
            const placement = raycastFlowerAt(camera, ndcX, ndcY);
            if (placement) trySelectPlacement(placement);
          }
        }
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  // Si el componente se desmonta (se cerró un panel, terminó la
  // experiencia), no dejar el input de movimiento "trabado".
  useEffect(() => {
    return () => {
      touchInputState.moveX = 0;
      touchInputState.moveZ = 0;
    };
  }, []);

  return (
    <div
      ref={joystickRef}
      onTouchStart={handleJoystickStart}
      onTouchMove={handleJoystickMove}
      onTouchEnd={endJoystick}
      onTouchCancel={endJoystick}
      className="fixed bottom-8 left-6 z-30 h-28 w-28 select-none rounded-full border border-white/25 bg-white/10 backdrop-blur-sm safe-bottom"
      style={{ touchAction: "none" }}
      aria-label="Joystick para caminar"
    >
      <div
        className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white/70 shadow-lg"
        style={{
          transform: `translate(-50%, -50%) translate(${nubOffset.x}px, ${nubOffset.y}px)`,
          transition: joystickActive ? "none" : "transform 150ms ease-out",
        }}
      />
    </div>
  );
}
