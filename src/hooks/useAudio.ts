"use client";

import { useEffect, useRef } from "react";

interface UseAudioOptions {
  src: string;
  volume: number;
  enabled: boolean;
}

/**
 * Controla un <audio> ambiental opcional. Nunca se reproduce solo:
 * sólo arranca cuando `enabled` pasa a true por una acción del usuario
 * (ver MusicToggle). Si el archivo no existe todavía, falla en
 * silencio para no romper el resto de la experiencia.
 */
export function useAudio({ src, volume, enabled }: UseAudioOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0;
    audio.preload = "none";
    audioRef.current = audio;

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let raf = 0;
    const fadeTo = (target: number) => {
      cancelAnimationFrame(raf);
      const step = () => {
        const diff = target - audio.volume;
        if (Math.abs(diff) < 0.01) {
          audio.volume = target;
          if (target === 0) audio.pause();
          return;
        }
        audio.volume += diff * 0.08;
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    if (enabled) {
      audio
        .play()
        .then(() => fadeTo(volume))
        .catch(() => {
          // El archivo puede no existir aún o el navegador bloqueó el
          // autoplay; la experiencia sigue funcionando sin música.
        });
    } else {
      fadeTo(0);
    }

    return () => cancelAnimationFrame(raf);
  }, [enabled, volume]);
}
