"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { specialFlower } from "@/data/flowers";
import { giftConfig } from "@/config/giftConfig";
import { useExperienceStore } from "@/store/experienceStore";
import { focusOnFlower, pullBackForFinale } from "@/animations/transitions";
import { FlowerShowcase } from "@/components/flowers/FlowerShowcase";
import { CelebrationOverlay } from "./CelebrationOverlay";

export function SpecialFlowerReveal() {
  const selected = useExperienceStore((s) => s.selected);
  const setPhase = useExperienceStore((s) => s.setPhase);
  const selectFlower = useExperienceStore((s) => s.selectFlower);
  const completeSpecialReveal = useExperienceStore(
    (s) => s.completeSpecialReveal
  );
  const [celebrating, setCelebrating] = useState(false);

  const isOpen = Boolean(selected?.isSpecial);

  useEffect(() => {
    if (isOpen && selected) {
      focusOnFlower(selected.position);
    }
  }, [isOpen, selected]);

  const handleLoveClick = () => {
    setCelebrating(true);
    completeSpecialReveal();
    pullBackForFinale();
    window.setTimeout(() => {
      selectFlower(null);
      setPhase("finale");
    }, 1600);
  };

  if (!isOpen) return null;

  return (
    <>
      {celebrating && <CelebrationOverlay />}

      <motion.div
        className="fixed inset-0 z-30 flex items-center justify-center px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 -z-10 bg-dusk-900/55 backdrop-blur-sm" />

        <motion.div
          className="glass-panel no-scrollbar w-full max-w-sm overflow-y-auto rounded-3xl p-6 text-center sm:max-h-[85vh]"
          initial={{ y: 50, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 30, opacity: 0, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
        >
          <motion.p
            className="text-[11px] uppercase tracking-[0.3em] text-gold-300"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {giftConfig.specialFlowerTitle} {specialFlower.content.emoji}
          </motion.p>

          <FlowerShowcase
            speciesId={specialFlower.id}
            visual={specialFlower.visual}
          />

          <div className="mt-2 space-y-1 font-serif text-lg italic leading-relaxed text-white">
            {giftConfig.specialFlowerMessage.map((line, i) =>
              line === "" ? (
                <div key={i} className="h-2" />
              ) : (
                <p key={i}>{line}</p>
              )
            )}
          </div>

          {!celebrating && (
            <motion.button
              type="button"
              onClick={handleLoveClick}
              className="mt-6 rounded-full bg-shimmer-gold px-8 py-3.5 text-sm font-semibold text-dusk-900 shadow-[0_10px_40px_rgba(240,70,138,0.35)] animate-shimmer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {giftConfig.specialFlowerButtonLabel}
            </motion.button>
          )}
        </motion.div>
      </motion.div>
    </>
  );
}
