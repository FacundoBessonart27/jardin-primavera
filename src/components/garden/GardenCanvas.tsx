"use client";

import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { useEffect, useState } from "react";
import { GardenScene } from "./GardenScene";
import { QUALITY_PRESETS, type QualitySettings } from "@/lib/quality";

interface GardenCanvasProps {
  quality: QualitySettings;
}

/** Canvas 3D persistente: se monta una sola vez y sirve tanto para la
 * pantalla de apertura como para el jardín interactivo, evitando
 * recargar la escena al pasar de una a otra. */
export function GardenCanvas({ quality }: GardenCanvasProps) {
  const [liveQuality, setLiveQuality] = useState(quality);
  // La calidad detectada puede llegar después de montar el canvas: sin
  // esto, el canvas se quedaba con el valor inicial (medio) para siempre.
  useEffect(() => setLiveQuality(quality), [quality]);

  return (
    <div className="fixed inset-0" aria-hidden>
      <Canvas
        // PCF simple en calidad media: bastante más barato por píxel que
        // la variante suave, con 1024 px casi no se nota la diferencia.
        shadows={liveQuality.shadows ? (liveQuality.softShadows ? "soft" : "percentage") : false}
        dpr={[1, liveQuality.maxDpr]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        camera={{ fov: 42, near: 0.1, far: 600 }}
        onCreated={({ gl }) => {
          gl.setClearColor("#241640");
        }}
      >
        <PerformanceMonitor
          onDecline={() =>
            setLiveQuality((q) =>
              q.tier === "high"
                ? QUALITY_PRESETS.medium
                : QUALITY_PRESETS.low
            )
          }
        >
          <GardenScene quality={liveQuality} />
        </PerformanceMonitor>
      </Canvas>
    </div>
  );
}
