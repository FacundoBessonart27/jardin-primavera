"use client";

import { motion } from "framer-motion";
import { useExperienceStore } from "@/store/experienceStore";
import { useAudio } from "@/hooks/useAudio";
import { giftConfig } from "@/config/giftConfig";

/**
 * Botón discreto de música ambiental. Nunca reproduce sonido por su
 * cuenta: sólo arranca cuando la persona lo toca. Si todavía no
 * agregaste un archivo en /public/audio, el toque simplemente no
 * suena (ver hooks/useAudio.ts) sin romper nada.
 */
export function MusicToggle() {
  const musicEnabled = useExperienceStore((s) => s.musicEnabled);
  const toggleMusic = useExperienceStore((s) => s.toggleMusic);

  useAudio({
    src: giftConfig.music.src,
    volume: giftConfig.music.volume,
    enabled: musicEnabled,
  });

  return (
    <motion.button
      type="button"
      onClick={toggleMusic}
      className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full glass-panel px-3.5 py-2.5 text-xs text-white/90 safe-bottom"
      whileTap={{ scale: 0.92 }}
      aria-pressed={musicEnabled}
      aria-label={
        musicEnabled ? "Pausar música ambiental" : "Reproducir música ambiental"
      }
    >
      <span className="relative flex h-2 w-2">
        {musicEnabled && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-300 opacity-60" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            musicEnabled ? "bg-gold-300" : "bg-white/40"
          }`}
        />
      </span>
      {musicEnabled ? "🔊" : "🔈"} {giftConfig.music.label}
    </motion.button>
  );
}
