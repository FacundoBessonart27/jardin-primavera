"use client";

import { motion } from "framer-motion";
import { giftConfig } from "@/config/giftConfig";
import { useExperienceStore } from "@/store/experienceStore";
import { returnToGardenHome } from "@/animations/transitions";

export function FinalScreen() {
  const phase = useExperienceStore((s) => s.phase);
  const setPhase = useExperienceStore((s) => s.setPhase);
  const selectFlower = useExperienceStore((s) => s.selectFlower);

  if (phase !== "finale") return null;

  const handleReplay = () => {
    selectFlower(null);
    setPhase("garden");
    returnToGardenHome();
  };

  return (
    <motion.div
      className="relative z-30 flex h-full w-full flex-col items-center justify-center px-6 text-center safe-top safe-bottom"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.6, duration: 1.4 }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-dusk-900/60 via-transparent to-dusk-900/75" />

      <motion.h1
        className="relative font-serif text-4xl text-glow sm:text-6xl"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2, duration: 1 }}
      >
        {giftConfig.finalTitle}
      </motion.h1>

      <motion.p
        className="relative mt-5 max-w-sm text-base leading-relaxed text-white/85 sm:text-lg"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.4, duration: 1 }}
      >
        {giftConfig.finalMessage}
      </motion.p>

      <motion.p
        className="relative mt-4 font-serif text-sm italic text-blossom-100/80"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.8, duration: 1 }}
      >
        {giftConfig.finalSignature}
      </motion.p>

      <motion.button
        type="button"
        onClick={handleReplay}
        className="relative mt-10 rounded-full glass-panel px-6 py-3 text-xs text-white/85 sm:text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 3.2, duration: 1 }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
      >
        🌸 {giftConfig.finalReplayLabel}
      </motion.button>
    </motion.div>
  );
}
