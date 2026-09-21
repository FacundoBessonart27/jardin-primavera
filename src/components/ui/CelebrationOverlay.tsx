"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const SYMBOLS = ["❤️", "🌸", "✨", "🌷", "💛"];

interface Particle {
  id: number;
  left: number;
  delay: number;
  duration: number;
  drift: number;
  symbol: string;
  size: number;
}

/** Estallido de corazones y pétalos para el momento de "Te amo". Se
 * vuelve a montar (key) cada vez que se dispara, así siempre reinicia
 * la animación desde cero. */
export function CelebrationOverlay() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const count = prefersReducedMotion ? 10 : 32;

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        duration: 3.2 + Math.random() * 2.2,
        drift: (Math.random() - 0.5) * 140,
        symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        size: 16 + Math.random() * 20,
      })),
    [count]
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute bottom-0 select-none"
          style={{ left: `${p.left}%`, fontSize: p.size }}
          initial={{ y: "5vh", x: 0, opacity: 0, rotate: 0 }}
          animate={{
            y: "-120vh",
            x: p.drift,
            opacity: [0, 1, 1, 0],
            rotate: p.drift > 0 ? 180 : -180,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeOut",
          }}
        >
          {p.symbol}
        </motion.span>
      ))}
    </div>
  );
}
