"use client";

import { motion } from "framer-motion";
import { useExperienceStore } from "@/store/experienceStore";
import { giftConfig } from "@/config/giftConfig";
import { setSoundEnabled } from "@/lib/ambientSound";

/**
 * Botón discreto de sonido: enciende o apaga la música ambiental y la
 * brisa/campanitas generadas en el navegador (ver lib/ambientSound.ts).
 * El sonido también se enciende al entrar al jardín (IntroScreen).
 */
export function MusicToggle() {
  const musicEnabled = useExperienceStore((s) => s.musicEnabled);
  const setMusicEnabled = useExperienceStore((s) => s.setMusicEnabled);

  return (
    <motion.button
      type="button"
      onClick={() => {
        // Dentro del gesto: requisito de los navegadores móviles para audio.
        setSoundEnabled(!musicEnabled);
        setMusicEnabled(!musicEnabled);
      }}
      className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full glass-panel px-3.5 py-2.5 text-xs text-white/90 safe-bottom"
      whileTap={{ scale: 0.92 }}
      aria-pressed={musicEnabled}
      aria-label={
        musicEnabled ? "Apagar el sonido ambiental" : "Activar el sonido ambiental"
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
