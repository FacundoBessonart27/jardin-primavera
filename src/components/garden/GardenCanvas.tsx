"use client";

import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { useState } from "react";
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

  return (
    <div className="fixed inset-0" aria-hidden>
      <Canvas
        shadows={liveQuality.shadows}
        dpr={[1, liveQuality.maxDpr]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        camera={{ fov: 42, near: 0.1, far: 100 }}
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
