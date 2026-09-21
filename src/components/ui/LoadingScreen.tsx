"use client";

import { motion, AnimatePresence } from "framer-motion";
import { giftConfig } from "@/config/giftConfig";

export function LoadingScreen({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-dusk-900"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7 }}
        >
          <motion.span
            className="text-4xl"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            🌸
          </motion.span>
          <p className="mt-4 text-xs uppercase tracking-[0.25em] text-white/60">
            {giftConfig.loadingLabel}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
