"use client";

import { motion } from "framer-motion";
import { giftConfig } from "@/config/giftConfig";
import { useExperienceStore } from "@/store/experienceStore";
import { playEnterGardenTransition } from "@/animations/transitions";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

export function IntroScreen() {
  const phase = useExperienceStore((s) => s.phase);
  const prefersReducedMotion = usePrefersReducedMotion();

  if (phase !== "intro") return null;

  const handleEnter = () => {
    playEnterGardenTransition(prefersReducedMotion);
  };

  return (
    <motion.div
      className="relative z-20 flex h-full w-full flex-col items-center justify-center px-6 text-center safe-top safe-bottom"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.8 } }}
      transition={{ duration: 1.2 }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-dusk-900/55 via-transparent to-dusk-900/70" />

      <motion.p
        className="relative font-serif text-base italic text-blossom-100/90 sm:text-lg"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 1 }}
      >
        {giftConfig.openingKicker}
      </motion.p>

      <motion.h1
        className="relative mt-4 max-w-md font-serif text-4xl font-semibold leading-tight text-glow sm:text-6xl"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 1 }}
      >
        {giftConfig.openingTitle}
      </motion.h1>

      <motion.p
        className="relative mt-5 max-w-sm text-sm text-white/80 sm:text-base"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 1 }}
      >
        {giftConfig.openingSubtitle}
      </motion.p>

      <motion.button
        type="button"
        onClick={handleEnter}
        className="group relative mt-10 overflow-hidden rounded-full bg-shimmer-gold px-8 py-4 text-sm font-semibold tracking-wide text-dusk-900 shadow-[0_10px_40px_rgba(247,185,85,0.35)] sm:text-base animate-shimmer"
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.4, duration: 0.9 }}
        whileHover={{ scale: 1.045 }}
        whileTap={{ scale: 0.96 }}
      >
        <span className="relative">{giftConfig.enterButtonLabel}</span>
      </motion.button>

      <motion.p
        className="relative mt-6 text-[11px] uppercase tracking-[0.2em] text-white/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 1 }}
      >
        {giftConfig.recipientName}
      </motion.p>
    </motion.div>
  );
}
