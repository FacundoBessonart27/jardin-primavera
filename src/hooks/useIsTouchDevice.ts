"use client";

import { useEffect, useState } from "react";

/** Detecta si el dispositivo principal de entrada es táctil (para
 * elegir entre controles WASD+mouse o joystick virtual). */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    setIsTouch(query.matches);
    const listener = (event: MediaQueryListEvent) => setIsTouch(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return isTouch;
}
