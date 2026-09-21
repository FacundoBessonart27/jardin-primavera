import { create } from "zustand";

export type ExperiencePhase =
  | "intro" // pantalla 1: campo + mensaje + botón
  | "entering" // transición de cámara hacia el jardín
  | "garden" // jardín interactivo
  | "finale"; // pantalla final, después de "Te amo"

export interface SelectedFlower {
  instanceId: string;
  speciesId: string;
  isSpecial: boolean;
  position: [number, number, number];
}

interface ExperienceState {
  phase: ExperiencePhase;
  selected: SelectedFlower | null;
  hoveredInstanceId: string | null;
  foundSpecialFlower: boolean;
  specialRevealDone: boolean;
  shownWhisperCount: number;
  musicEnabled: boolean;

  setPhase: (phase: ExperiencePhase) => void;
  selectFlower: (flower: SelectedFlower | null) => void;
  setHovered: (id: string | null) => void;
  markSpecialFound: () => void;
  completeSpecialReveal: () => void;
  registerWhisperShown: () => void;
  toggleMusic: () => void;
  reset: () => void;
}

const initialState = {
  phase: "intro" as ExperiencePhase,
  selected: null as SelectedFlower | null,
  hoveredInstanceId: null as string | null,
  foundSpecialFlower: false,
  specialRevealDone: false,
  shownWhisperCount: 0,
  musicEnabled: false,
};

export const useExperienceStore = create<ExperienceState>((set) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),

  selectFlower: (flower) => set({ selected: flower }),

  setHovered: (id) => set({ hoveredInstanceId: id }),

  markSpecialFound: () => set({ foundSpecialFlower: true }),

  completeSpecialReveal: () => set({ specialRevealDone: true }),

  registerWhisperShown: () =>
    set((s) => ({ shownWhisperCount: s.shownWhisperCount + 1 })),

  toggleMusic: () => set((s) => ({ musicEnabled: !s.musicEnabled })),

  reset: () =>
    set({
      ...initialState,
      musicEnabled: false,
    }),
}));
