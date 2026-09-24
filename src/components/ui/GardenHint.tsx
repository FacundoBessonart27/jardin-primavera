"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { giftConfig } from "@/config/giftConfig";
import { useExperienceStore } from "@/store/experienceStore";
import { useIsTouchDevice } from "@/hooks/useIsTouchDevice";

/** Pequeño texto de ayuda que aparece al entrar al jardín y se
 * desvanece solo después de unos segundos o en la primera selección.
 * En escritorio menciona el joystick de mira/movimiento; en celular,
 * el mensaje personalizable de giftConfig (pensado para tap). */
export function GardenHint() {
  const phase = useExperienceStore((s) => s.phase);
  const selected = useExperienceStore((s) => s.selected);
  const isTouch = useIsTouchDevice();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (phase !== "garden") {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 5200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (selected) setVisible(false);
  }, [selected]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="pointer-events-none fixed left-1/2 top-6 z-20 -translate-x-1/2 rounded-full glass-panel px-4 py-2 text-xs text-white/85 safe-top sm:top-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          {isTouch
            ? giftConfig.gardenHint
            : "Mirá una flor con la mira y hacé click para descubrirla ✨"}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
