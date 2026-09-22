"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/** Mira central + aviso discreto de "click para caminar" en
 * escritorio. El aviso desaparece apenas se activa el mouse
 * bloqueado (modo caminar) y vuelve a aparecer si se libera (por
 * ejemplo, al abrir el panel de una flor). */
export function DesktopWalkHUD() {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const onChange = () => setLocked(Boolean(document.pointerLockElement));
    document.addEventListener("pointerlockchange", onChange);
    onChange();
    return () => document.removeEventListener("pointerlockchange", onChange);
  }, []);

  return (
    <>
      <div
        className="pointer-events-none fixed left-1/2 top-1/2 z-20 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow-[0_0_6px_rgba(0,0,0,0.6)]"
        aria-hidden
      />
      <AnimatePresence>
        {!locked && (
          <motion.div
            className="pointer-events-none fixed bottom-24 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full glass-panel px-4 py-2 text-xs text-white/85"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            Hacé click para caminar · WASD + mouse · Shift para correr
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
