"use client";

import { useEffect, useState } from "react";
import {
  detectQualityTier,
  QUALITY_PRESETS,
  type QualitySettings,
} from "@/lib/quality";

/**
 * Detecta la potencia aproximada del dispositivo una sola vez y devuelve
 * el set de ajustes gráficos correspondiente (HIGH / MEDIUM / LOW).
 */
export function useDeviceQuality(): QualitySettings {
  const [settings, setSettings] = useState<QualitySettings>(
    QUALITY_PRESETS.medium
  );

  useEffect(() => {
    const tier = detectQualityTier();
    setSettings(QUALITY_PRESETS[tier]);
  }, []);

  return settings;
}
