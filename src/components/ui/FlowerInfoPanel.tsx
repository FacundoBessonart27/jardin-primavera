"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getFlowerById } from "@/data/flowers";
import { giftConfig } from "@/config/giftConfig";
import { useExperienceStore } from "@/store/experienceStore";
import { focusOnFlower, returnToGardenHome } from "@/animations/transitions";
import { FlowerShowcase } from "@/components/flowers/FlowerShowcase";

const WHISPER_CHANCE = 0.45;
const MAX_WHISPERS = 5;

export function FlowerInfoPanel() {
  const selected = useExperienceStore((s) => s.selected);
  const selectFlower = useExperienceStore((s) => s.selectFlower);
  const shownWhisperCount = useExperienceStore((s) => s.shownWhisperCount);
  const registerWhisperShown = useExperienceStore((s) => s.registerWhisperShown);
  const markSpecialFound = useExperienceStore((s) => s.markSpecialFound);

  const [whisper, setWhisper] = useState<string | null>(null);

  const species = useMemo(
    () => (selected ? getFlowerById(selected.speciesId) : undefined),
    [selected]
  );

  useEffect(() => {
    if (!selected || selected.isSpecial) {
      setWhisper(null);
      return;
    }

    focusOnFlower(selected.position);

    if (
      shownWhisperCount < MAX_WHISPERS &&
      Math.random() < WHISPER_CHANCE
    ) {
      const phrase =
        giftConfig.hiddenWhispers[
          shownWhisperCount % giftConfig.hiddenWhispers.length
        ];
      setWhisper(phrase);
      registerWhisperShown();
    } else {
      setWhisper(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.instanceId]);

  useEffect(() => {
    if (selected?.isSpecial) markSpecialFound();
  }, [selected?.isSpecial, markSpecialFound]);

  if (!selected || selected.isSpecial || !species) return null;

  const handleClose = () => {
    selectFlower(null);
    returnToGardenHome();
  };

  return (
    <motion.div
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 sm:inset-0 sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="absolute inset-0 -z-10 bg-dusk-900/30 sm:backdrop-blur-sm"
        onClick={handleClose}
      />

      <motion.div
        className="glass-panel no-scrollbar w-full max-w-sm overflow-y-auto rounded-t-3xl p-5 sm:max-h-[85vh] sm:rounded-3xl sm:p-6"
        initial={{ y: 60, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-gold-300/80">
              {species.content.meaning}
            </p>
            <h2 className="mt-1 font-serif text-3xl text-white">
              {species.content.emoji} {species.content.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar"
            className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/80 hover:bg-white/20"
          >
            ✕
          </button>
        </div>

        <FlowerShowcase speciesId={species.id} visual={species.visual} />

        <p className="mt-2 text-sm leading-relaxed text-white/80">
          {species.content.description}
        </p>

        <p className="mt-4 border-l-2 border-blossom-400/60 pl-3 font-serif text-base italic text-blossom-100">
          "{species.content.romanticLine}"
        </p>

        {whisper && (
          <motion.p
            className="mt-4 rounded-xl bg-white/5 px-3 py-2 text-center text-sm text-gold-200"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            {whisper}
          </motion.p>
        )}
      </motion.div>
    </motion.div>
  );
}
