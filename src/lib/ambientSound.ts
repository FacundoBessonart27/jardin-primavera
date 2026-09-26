/**
 * Todo el sonido de la experiencia, en un solo lugar:
 *  - la música ambiental (public/audio/ambient.mp3), en un único
 *    <audio> compartido para que nunca suenen dos copias a la vez;
 *  - una brisa muy suave generada en el navegador (Web Audio, ruido
 *    "marrón" filtrado) con ráfagas lentas y un susurro de hojas;
 *  - campanitas breves al tocar una flor, al descubrir una flor con
 *    mensaje y al encontrar la flor especial.
 *
 * Nunca suena solo: se activa desde un gesto de la persona (el botón
 * de entrada al jardín o el botón de sonido), requisito de los
 * navegadores para reproducir audio. Si aun así el navegador lo
 * bloquea, se reintenta en el siguiente toque/tecla. Al apagarlo, la
 * música se pausa y el contexto de audio se suspende para no gastar
 * batería.
 */

import { giftConfig } from "@/config/giftConfig";
import { withBasePath } from "./basePath";

type ChimeKind = "select" | "discover" | "special" | "finale";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;
let suspendTimer = 0;
let music: HTMLAudioElement | null = null;
let musicFadeRaf = 0;
let retryArmed = false;

function createBrownNoise(context: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

function lfo(context: AudioContext, frequency: number, depth: number, target: AudioParam) {
  const osc = context.createOscillator();
  osc.frequency.value = frequency;
  const gain = context.createGain();
  gain.gain.value = depth;
  osc.connect(gain).connect(target);
  osc.start();
}

function buildAmbience(context: AudioContext, out: AudioNode) {
  const noise = context.createBufferSource();
  noise.buffer = createBrownNoise(context, 4);
  noise.loop = true;

  // Brisa: graves suaves, con ráfagas lentas de volumen y de "brillo".
  const windFilter = context.createBiquadFilter();
  windFilter.type = "lowpass";
  windFilter.frequency.value = 520;
  windFilter.Q.value = 0.6;
  const windGain = context.createGain();
  windGain.gain.value = 0.16;
  lfo(context, 0.07, 0.08, windGain.gain);
  lfo(context, 0.045, 180, windFilter.frequency);
  noise.connect(windFilter).connect(windGain).connect(out);

  // Hojas: la misma fuente, mucho más aguda y casi imperceptible.
  const leafFilter = context.createBiquadFilter();
  leafFilter.type = "highpass";
  leafFilter.frequency.value = 1800;
  const leafGain = context.createGain();
  leafGain.gain.value = 0.012;
  lfo(context, 0.21, 0.01, leafGain.gain);
  noise.connect(leafFilter).connect(leafGain).connect(out);

  noise.start();
}

function ensureContext(): boolean {
  if (ctx && master) return true;
  if (typeof window === "undefined") return false;
  const Ctor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return false;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  buildAmbience(ctx, master);
  return true;
}

/** El único <audio> de música de toda la app (se crea la primera vez). */
function getMusic(): HTMLAudioElement | null {
  if (music) return music;
  if (typeof window === "undefined" || !giftConfig.music.src) return null;
  // withBasePath: en GitHub Pages el archivo vive en /jardin-primavera/audio/...
  music = new Audio(withBasePath(giftConfig.music.src));
  music.loop = true;
  music.preload = "auto";
  music.volume = 0;
  return music;
}

/** Fundido de volumen por tiempo. En iOS `volume` es de sólo lectura:
 * ahí el fundido no tiene efecto, pero la pausa final igual ocurre. */
function fadeMusic(target: number, seconds: number) {
  const audio = music;
  if (!audio) return;
  cancelAnimationFrame(musicFadeRaf);
  const from = audio.volume;
  const start = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / (seconds * 1000));
    audio.volume = Math.min(1, Math.max(0, from + (target - from) * k));
    if (k < 1) {
      musicFadeRaf = requestAnimationFrame(step);
    } else if (target === 0 && !enabled) {
      audio.pause();
    }
  };
  musicFadeRaf = requestAnimationFrame(step);
}

/** Si el navegador bloqueó la reproducción, vuelve a intentarlo en el
 * próximo gesto de la persona (toque, click o tecla). */
function retryOnNextGesture() {
  if (retryArmed || typeof window === "undefined") return;
  retryArmed = true;
  const events = ["pointerdown", "touchend", "keydown"] as const;
  const retry = () => {
    events.forEach((type) => window.removeEventListener(type, retry, true));
    retryArmed = false;
    if (!enabled) return;
    if (ctx) void ctx.resume().catch(() => {});
    startMusic();
  };
  events.forEach((type) => window.addEventListener(type, retry, true));
}

function startMusic() {
  const audio = getMusic();
  if (!audio) return;
  const attempt = audio.play();
  if (!attempt) return;
  attempt
    .then(() => {
      if (enabled) fadeMusic(giftConfig.music.volume, 2.5);
      else audio.pause();
    })
    .catch((error: unknown) => {
      // NotAllowedError = política de autoplay: no es un error, se
      // reintenta con el próximo gesto. Otros casos (p. ej. una pausa
      // que interrumpió el play) no requieren hacer nada.
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        retryOnNextGesture();
      }
    });
}

/** Enciende o apaga todo el sonido (música + brisa, con un fundido
 * suave). Llamarlo desde el manejador del click/tap para que los
 * navegadores lo permitan. */
export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (on) {
    // La música primero: play() tiene que ocurrir dentro del gesto.
    startMusic();
    if (!ensureContext() || !ctx || !master) return;
    window.clearTimeout(suspendTimer);
    void ctx.resume().catch(() => retryOnNextGesture());
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.8);
  } else {
    fadeMusic(0, 0.8);
    if (!ctx || !master) return;
    const context = ctx;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(0, context.currentTime, 0.3);
    suspendTimer = window.setTimeout(() => {
      if (!enabled) void context.suspend();
    }, 1600);
  }
}

const CHIMES: Record<ChimeKind, { notes: number[]; spacing: number; peak: number; decay: number }> = {
  select: { notes: [880], spacing: 0, peak: 0.03, decay: 1.2 },
  discover: { notes: [659.25, 783.99, 987.77], spacing: 0.11, peak: 0.045, decay: 1.8 },
  special: { notes: [523.25, 659.25, 783.99, 1046.5, 1318.51], spacing: 0.16, peak: 0.05, decay: 2.4 },
  finale: { notes: [392, 523.25, 659.25, 783.99, 1046.5], spacing: 0.22, peak: 0.045, decay: 3 },
};

/** Campanita breve (seno + un armónico muy leve). No suena si el sonido
 * está apagado. */
export function playChime(kind: ChimeKind) {
  if (!enabled || !ctx || !master) return;
  const { notes, spacing, peak, decay } = CHIMES[kind];
  notes.forEach((frequency, i) => {
    const t = ctx!.currentTime + 0.02 + i * spacing;
    const gain = ctx!.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    gain.connect(master!);

    const tone = ctx!.createOscillator();
    tone.type = "sine";
    tone.frequency.value = frequency;
    tone.connect(gain);

    const shimmer = ctx!.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.value = frequency * 2.01;
    const shimmerGain = ctx!.createGain();
    shimmerGain.gain.value = 0.25;
    shimmer.connect(shimmerGain).connect(gain);

    tone.start(t);
    shimmer.start(t);
    tone.stop(t + decay + 0.1);
    shimmer.stop(t + decay + 0.1);
  });
}
