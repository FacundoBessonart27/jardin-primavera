"use client";

import { motion } from "framer-motion";
import { useExperienceStore } from "@/store/experienceStore";
import { useAudio } from "@/hooks/useAudio";
import { giftConfig } from "@/config/giftConfig";
import { setSoundEnabled } from "@/lib/ambientSound";

/** Lo calcula next.config.mjs en el build: true sólo si existe
 * public/audio/ambient.mp3. Sin archivo no se hace ninguna petición. */
const HAS_AMBIENT_MUSIC = process.env.NEXT_PUBLIC_HAS_AMBIENT_MUSIC === "true";

/**
 * Botón discreto de sonido. Nunca reproduce nada por su cuenta: sólo
 * arranca cuando la persona lo toca. Activa el ambiente generado en el
 * navegador (brisa y campanitas, ver lib/ambientSound.ts) y, si hay un
 * archivo de música en /public/audio, también la música (ver
 * hooks/useAudio.ts); si ese archivo no existe, simplemente no suena.
 */
export function MusicToggle() {
  const musicEnabled = useExperienceStore((s) => s.musicEnabled);
  const toggleMusic = useExperienceStore((s) => s.toggleMusic);

  useAudio({
    src: HAS_AMBIENT_MUSIC ? giftConfig.music.src : null,
    volume: giftConfig.music.volume,
    enabled: musicEnabled,
  });

  return (
    <motion.button
      type="button"
      onClick={() => {
        // Dentro del gesto: requisito de los navegadores móviles para audio.
        setSoundEnabled(!musicEnabled);
        toggleMusic();
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
