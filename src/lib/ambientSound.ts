/**
 * Ambiente sonoro generado en el navegador (Web Audio), sin archivos:
 *  - una brisa muy suave (ruido "marrón" filtrado) con ráfagas lentas
 *    y un susurro de hojas todavía más bajo;
 *  - campanitas breves al tocar una flor, al descubrir una flor con
 *    mensaje y al encontrar la flor especial.
 *
 * Nunca suena solo: se activa únicamente desde el botón de sonido (un
 * gesto de la persona, requisito de los navegadores móviles). Al
 * apagarlo, el contexto de audio se suspende para no gastar batería.
 */

type ChimeKind = "select" | "discover" | "special" | "finale";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;
let suspendTimer = 0;

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

/** Enciende o apaga el ambiente (con un fundido suave). Llamarlo desde
 * el manejador del click/tap para que los navegadores lo permitan. */
export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (on) {
    if (!ensureContext() || !ctx || !master) return;
    window.clearTimeout(suspendTimer);
    void ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.8);
  } else if (ctx && master) {
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
