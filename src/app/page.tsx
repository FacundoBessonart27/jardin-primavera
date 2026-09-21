"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useDeviceQuality } from "@/hooks/useDeviceQuality";
import { useExperienceStore } from "@/store/experienceStore";
import { IntroScreen } from "@/components/ui/IntroScreen";
import { FlowerInfoPanel } from "@/components/ui/FlowerInfoPanel";
import { SpecialFlowerReveal } from "@/components/ui/SpecialFlowerReveal";
import { FinalScreen } from "@/components/ui/FinalScreen";
import { GardenHint } from "@/components/ui/GardenHint";
import { MusicToggle } from "@/components/ui/MusicToggle";
import { LoadingScreen } from "@/components/ui/LoadingScreen";

const GardenCanvas = dynamic(
  () => import("@/components/garden/GardenCanvas").then((m) => m.GardenCanvas),
  { ssr: false }
);

export default function Home() {
  const quality = useDeviceQuality();
  const phase = useExperienceStore((s) => s.phase);
  const selected = useExperienceStore((s) => s.selected);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden">
      <GardenCanvas quality={quality} />

      <GardenHint />
      <MusicToggle />

      <AnimatePresence mode="wait">
        {phase === "intro" && <IntroScreen key="intro" />}
      </AnimatePresence>

      <AnimatePresence>
        {selected && !selected.isSpecial && (
          <FlowerInfoPanel key={selected.instanceId} />
        )}
      </AnimatePresence>

      <AnimatePresence>{selected?.isSpecial && <SpecialFlowerReveal />}</AnimatePresence>

      <AnimatePresence>{phase === "finale" && <FinalScreen />}</AnimatePresence>

      <LoadingScreen visible={loading} />
    </main>
  );
}
