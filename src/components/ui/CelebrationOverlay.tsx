"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const PETAL_TONES: [string, string][] = [
  ["#ffe7ef", "#ff9dc3"],
  ["#ffffff", "#ffc9dd"],
  ["#fff3d6", "#ffd688"],
  ["#ffd6e8", "#f06a9e"],
];

interface Particle {
  id: number;
  left: number;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
  size: number;
  glint: boolean;
  tone: [string, string];
}

/**
 * Lluvia de pétalos (dibujados, no emojis) con algunos destellos
 * dorados, en la misma paleta del jardín.
 *  - Por defecto: un breve estallido al presionar el botón final.
 *  - `continuous`: pétalos que siguen cayendo despacio, en bucle, de
 *    fondo detrás del mensaje final.
 */
export function CelebrationOverlay({ continuous = false }: { continuous?: boolean }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const count = prefersReducedMotion ? 8 : continuous ? 18 : 30;

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: continuous ? Math.random() * 9 : Math.random() * 0.6,
        duration: continuous ? 10 + Math.random() * 6 : 3.4 + Math.random() * 2,
        drift: (Math.random() - 0.5) * 160,
        spin: (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 260),
        size: 10 + Math.random() * 12,
        glint: Math.random() < 0.2,
        tone: PETAL_TONES[Math.floor(Math.random() * PETAL_TONES.length)],
      })),
    [count, continuous]
  );

  return (
    <div
      className={`pointer-events-none fixed inset-0 overflow-hidden ${continuous ? "z-20" : "z-40"}`}
      aria-hidden
    >
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 block"
          style={{
            left: `${p.left}%`,
            width: p.glint ? 4 : p.size * 0.7,
            height: p.glint ? 4 : p.size,
            borderRadius: p.glint ? "9999px" : "80% 0 80% 0",
            background: p.glint
              ? "#ffe3a0"
              : `linear-gradient(135deg, ${p.tone[0]}, ${p.tone[1]})`,
            boxShadow: p.glint
              ? "0 0 8px 2px rgba(255, 214, 136, 0.7)"
              : "0 0 6px rgba(255, 200, 220, 0.3)",
          }}
          initial={{ y: "-8vh", x: 0, opacity: 0, rotate: 0 }}
          animate={{
            y: "110vh",
            x: [0, p.drift * 0.5, p.drift],
            opacity: [0, 0.95, 0.95, 0],
            rotate: p.spin,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeInOut",
            repeat: continuous ? Infinity : 0,
          }}
        />
      ))}
    </div>
  );
}
