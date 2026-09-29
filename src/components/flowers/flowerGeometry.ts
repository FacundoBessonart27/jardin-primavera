import * as THREE from "three";
import type { FlowerVisual, PetalShape } from "@/data/flowers";
import { createSeededRandom } from "@/lib/random";

/**
 * ============================================================
 *  GENERADOR PROCEDURAL DE FLORES
 * ============================================================
 * Cada especie se construye combinando geometría de Three.js:
 * pétalos con silueta propia (punta redondeada, aguda, aserrada o
 * dentada según la especie), curvados, con degradé de color, sombreado
 * de bordes y oclusión horneados por vértice; sépalos y cáliz que unen
 * la flor al tallo; estambres/pistilo opcionales; un centro con
 * textura; un tallo que se curva de verdad hacia la cabeza floral
 * (inclinada según la especie) y hojas con distintas formas.
 *
 * Cada pétalo se genera individualmente (no se clona el mismo
 * triángulo N veces) para que ninguna flor se vea como una copia
 * exacta de la de al lado. Todo se combina en UNA sola geometría
 * indexada por especie + variante de apertura, lo que permite dibujar
 * cientos de flores con muy pocos draw calls usando InstancedMesh
 * (ver FlowerField.tsx).
 */

interface MeshPart {
  geometry: THREE.BufferGeometry;
  /** Color plano de respaldo, usado si la geometría no trae su
   * propio atributo de color (degradé o textura horneada). */
  color: THREE.Color;
}

/** Silueta y comportamiento de un tipo de pétalo (u hoja). */
interface ShapeSpec {
  /** Ancho relativo (0..1) a lo largo del pétalo, t ∈ [0, 1]. */
  width: (t: number) => number;
  /** Curvatura longitudinal, en fracción del largo (+Y = hacia adentro). */
  curl: (t: number) => number;
  /** Punta redondeada: retrae los bordes del último tramo en arco. */
  tipRound: number;
  /** Punta aserrada/dentada (fracción del largo): clavel, cosmos. */
  teeth: number;
  /** Muesca central en la punta (fracción del largo). */
  notch: number;
  /** Concavidad transversal ("cuenco"). */
  cup: number;
  /** 0 = sección en U suave, 1 = pliegue en V marcado (nervadura central). */
  crease: number;
  edgeNoise: number;
  twist: number;
  ripple: number;
  /** Ondulado del borde (volados). */
  ruffle: number;
  openAngle: number;
  baseLength: number;
  widthRatio: number;
  /** Cuánto más cerradas quedan las capas internas (0 = igual que la externa). */
  closure: number;
}

/** Perfil obovado/ovado: angosto en la base (uña), máximo en `peak` y
 * una punta que termina en `tip` (0 = aguda) con curva elíptica. */
function obovate(t: number, peak: number, base: number, tip: number): number {
  if (t <= peak) return base + (1 - base) * Math.sin((t / peak) * Math.PI * 0.5);
  const u = (t - peak) / (1 - peak);
  return tip + (1 - tip) * Math.sqrt(Math.max(0, 1 - u * u));
}

/** Lígula en forma de cinta (margarita, girasol): ancho casi constante
 * con la punta roma. */
function strap(t: number): number {
  if (t < 0.18) return 0.35 + 0.65 * Math.sin((t / 0.18) * Math.PI * 0.5);
  if (t < 0.8) return 1 - 0.12 * ((t - 0.18) / 0.62);
  const u = (t - 0.8) / 0.2;
  return 0.42 + 0.46 * Math.sqrt(Math.max(0, 1 - u * u));
}

const SHAPES: Record<PetalShape, ShapeSpec> = {
  round: {
    width: (t) => obovate(t, 0.6, 0.22, 0.45),
    curl: (t) => t * t * 0.55,
    tipRound: 0.9, teeth: 0, notch: 0,
    cup: 0.24, crease: 0.15, edgeNoise: 0.06, twist: 0.09, ripple: 0.05, ruffle: 0.03,
    openAngle: 0.48, baseLength: 0.4, widthRatio: 0.72, closure: 0.5,
  },
  pointed: {
    width: (t) => obovate(t, 0.42, 0.42, 0),
    curl: (t) => t * t * 0.35,
    tipRound: 0.15, teeth: 0, notch: 0,
    cup: 0.2, crease: 0.4, edgeNoise: 0.045, twist: 0.15, ripple: 0.035, ruffle: 0,
    openAngle: 0.95, baseLength: 0.5, widthRatio: 0.5, closure: 0.15,
  },
  thin: {
    width: strap,
    curl: (t) => t * t * 0.18,
    tipRound: 0.8, teeth: 0, notch: 0.035,
    cup: 0.09, crease: 0.3, edgeNoise: 0.03, twist: 0.11, ripple: 0.03, ruffle: 0,
    openAngle: 0.18, baseLength: 0.5, widthRatio: 0.2, closure: 0.1,
  },
  trumpet: {
    width: (t) => 0.18 + 0.82 * Math.pow(Math.sin((t * Math.PI) / 2), 0.75),
    curl: (t) => t * 0.25 - t * t * 0.2,
    tipRound: 1, teeth: 0, notch: 0,
    cup: 0.2, crease: 0.1, edgeNoise: 0.06, twist: 0.06, ripple: 0.03, ruffle: 0.06,
    openAngle: 0.5, baseLength: 0.42, widthRatio: 0.6, closure: 0.1,
  },
  cluster: {
    width: (t) => obovate(t, 0.5, 0.25, 0.2),
    curl: (t) => t * t * 0.3,
    tipRound: 0.5, teeth: 0, notch: 0,
    cup: 0.12, crease: 0.2, edgeNoise: 0.03, twist: 0.06, ripple: 0.02, ruffle: 0,
    openAngle: 0.3, baseLength: 0.12, widthRatio: 0.5, closure: 0,
  },
  ruffled: {
    width: (t) => obovate(t, 0.55, 0.2, 0.4) * (1 + 0.08 * Math.sin(t * 14)),
    curl: (t) => t * t * 0.4 + 0.06 * Math.sin(t * 18) * t,
    tipRound: 0.8, teeth: 0, notch: 0,
    cup: 0.22, crease: 0.15, edgeNoise: 0.05, twist: 0.07, ripple: 0.08, ruffle: 0.09,
    openAngle: 0.42, baseLength: 0.44, widthRatio: 0.66, closure: 0.35,
  },
  fringed: {
    width: (t) => 0.14 + 0.86 * Math.pow(t, 0.75),
    curl: (t) => t * t * 0.48,
    tipRound: 0.15, teeth: 0.07, notch: 0,
    cup: 0.26, crease: 0.1, edgeNoise: 0.07, twist: 0.08, ripple: 0.07, ruffle: 0.07,
    openAngle: 0.58, baseLength: 0.36, widthRatio: 0.8, closure: 0.55,
  },
  dome: {
    width: (t) => obovate(t, 0.55, 0.3, 0.55),
    curl: (t) => t * t * 0.4,
    tipRound: 1, teeth: 0, notch: 0,
    cup: 0.2, crease: 0.1, edgeNoise: 0.05, twist: 0.06, ripple: 0.03, ruffle: 0,
    openAngle: 0.5, baseLength: 0.11, widthRatio: 0.85, closure: 0,
  },
  recurved: {
    width: (t) => obovate(t, 0.33, 0.3, 0),
    // Sube desde la garganta y después se arquea hacia atrás y abajo.
    curl: (t) => 0.3 * t - 0.95 * Math.pow(t, 2.2),
    tipRound: 0, teeth: 0, notch: 0,
    cup: 0.25, crease: 0.7, edgeNoise: 0.03, twist: 0.12, ripple: 0.04, ruffle: 0.03,
    openAngle: 0.95, baseLength: 0.5, widthRatio: 0.34, closure: 0.1,
  },
  notched: {
    width: (t) => obovate(t, 0.62, 0.16, 0.72),
    curl: (t) => t * t * 0.12,
    tipRound: 0.35, teeth: 0.06, notch: 0,
    cup: 0.14, crease: 0.25, edgeNoise: 0.04, twist: 0.08, ripple: 0.04, ruffle: 0.02,
    openAngle: 0.12, baseLength: 0.42, widthRatio: 0.62, closure: 0,
  },
  star: {
    width: (t) => obovate(t, 0.45, 0.3, 0),
    curl: (t) => -t * t * 0.1,
    tipRound: 0.25, teeth: 0, notch: 0,
    cup: 0.1, crease: 0.3, edgeNoise: 0.03, twist: 0.15, ripple: 0.02, ruffle: 0,
    openAngle: 0.05, baseLength: 0.07, widthRatio: 0.42, closure: 0,
  },
};

/** Formas internas para hojas y sépalos (no son especies). */
const LEAF: ShapeSpec = {
  ...SHAPES.pointed,
  width: (t) => obovate(t, 0.42, 0.1, 0),
  curl: (t) => t * t * 0.3,
  tipRound: 0.1, cup: 0.16, crease: 0.7, edgeNoise: 0.05, ruffle: 0.02,
};
const STRAP_LEAF: ShapeSpec = {
  ...LEAF,
  width: (t) =>
    t < 0.12
      ? 0.55 + 0.45 * Math.sin((t / 0.12) * Math.PI * 0.5)
      : t < 0.62
        ? 1
        : Math.max(0, (1 - t) / 0.38),
  curl: (t) => t * t * 0.5,
  tipRound: 0, cup: 0.3, crease: 0.8, ruffle: 0,
};
const NEEDLE: ShapeSpec = {
  ...LEAF,
  width: (t) => Math.sin(Math.PI * Math.min(1, t)) * (1 - 0.3 * t),
  curl: (t) => t * t * 0.3,
  tipRound: 0, cup: 0.05, crease: 0.5, ruffle: 0,
};
const SEPAL: ShapeSpec = {
  ...LEAF,
  width: (t) => obovate(t, 0.35, 0.3, 0),
  curl: (t) => t * t * 0.4,
  cup: 0.2, crease: 0.5,
};

const EDGE_SHADE = 0.32;

interface PetalOptions {
  /** Irregularidad del borde: pequeña variación de ancho por anillo. */
  edgeNoise?: number;
  /** Cuánto se curvan los bordes (efecto "cuenco"). */
  cupAmount?: number;
  /** Oscurecimiento sutil cerca de los bordes (simula nervaduras). */
  edgeShade?: number;
  /** Torsión total (radianes) de la punta respecto de la base: una
   * ligera hélice, como el pétalo real de un tulipán o una rosa. */
  twist?: number;
  /** Amplitud de una leve ondulación a lo largo del pétalo (además del
   * "cuenco"), para que la superficie no sea un plano curvo perfecto. */
  ripple?: number;
  /** Ondulado del borde (sobrescribe el de la forma). */
  ruffle?: number;
  /** Muesca central en la punta (sobrescribe la de la forma). */
  notch?: number;
  /** Multiplicador de la curvatura longitudinal (negativo = cae). */
  curlScale?: number;
  /** Oclusión horneada en la base del pétalo (0..1): más oscuro donde
   * queda tapado por otros pétalos o por el centro. */
  ao?: number;
  /** Franja de color a lo largo de la nervadura central (ej: lirio). */
  stripe?: { color: THREE.Color; amount: number };
  /** Generador aleatorio determinístico para la irregularidad. */
  random?: () => number;
}

function smooth01(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** Construye un único pétalo (u hoja) en espacio local: crece a lo
 * largo de +X, se curva hacia +Y y su ancho se extiende en Z. La
 * silueta sale de `spec` (punta redondeada en arco, aserrada, con
 * muesca o aguda); además hornea un degradé base→punta, un leve
 * sombreado hacia los bordes, oclusión en la base y un atributo
 * `aFlex` (0 en la base, 1 en la punta) que usa el shader de viento
 * para que la punta se mueva sin despegarse la base. */
function createPetalGeometry(
  spec: ShapeSpec,
  length: number,
  width: number,
  lengthSegments: number,
  widthSegments: number,
  gradient?: { base: THREE.Color; tip: THREE.Color },
  options: PetalOptions = {}
): THREE.BufferGeometry {
  const {
    edgeNoise = 0,
    cupAmount = spec.cup,
    edgeShade = EDGE_SHADE,
    twist = 0,
    ripple = 0,
    ruffle = spec.ruffle,
    notch = spec.notch,
    curlScale = 1,
    ao = 0,
    stripe,
    random,
  } = options;

  const positions: number[] = [];
  const colors: number[] | null = gradient ? [] : null;
  const flex: number[] = [];
  const indices: number[] = [];
  const ruffPhase = random ? random() * Math.PI * 2 : 0;
  const crease = spec.crease;
  const tmp = new THREE.Color();

  for (let i = 0; i <= lengthSegments; i++) {
    const t = i / lengthSegments;
    let ringW = spec.width(t) * width;
    if (edgeNoise > 0 && random) {
      ringW *= 1 + (random() - 0.5) * 2 * edgeNoise * Math.min(1, t * 2.2);
    }
    const curl = spec.curl(t) * length * curlScale;
    // Ondulación suave a lo largo del pétalo: evita que la superficie
    // sea un plano curvo perfectamente liso.
    const rippleOffset = ripple ? Math.sin(t * Math.PI * 2.4) * ripple * length : 0;
    // Torsión acumulada desde la base (t=0) hasta la punta.
    const twistAngle = twist * t;
    const cosTw = twist ? Math.cos(twistAngle) : 1;
    const sinTw = twist ? Math.sin(twistAngle) : 0;
    const tipT = t * t * t;
    const isTip = i === lengthSegments;
    // Borde lateral aserrado (clavel): los anillos alternan ancho.
    const sideTooth =
      spec.teeth > 0 && t > 0.4 ? (i % 2 === 0 ? 1 + spec.teeth * 1.6 : 1 - spec.teeth * 1.6) : 1;

    let ringColor: THREE.Color | null = null;
    if (gradient) {
      ringColor = gradient.base.clone().lerp(gradient.tip, Math.pow(t, 0.65));
      if (ao > 0) ringColor.multiplyScalar(1 - ao * (1 - smooth01(t / 0.55)));
    }

    for (let j = 0; j <= widthSegments; j++) {
      const s = j / widthSegments - 0.5;
      const a = Math.abs(s) * 2;
      const w = a > 0.99 ? ringW * sideTooth : ringW;
      const z0 = s * w;
      const cross = crease * a + (1 - crease) * a * a;
      let y0 = curl - cross * w * cupAmount * 0.5 + rippleOffset;
      if (ruffle) {
        y0 += Math.sin(s * Math.PI * 4 + ruffPhase + t * 3) * ruffle * length * Math.pow(a, 1.5) * t * t;
      }

      let x = t * length;
      // Punta redondeada: los bordes del último tramo se retraen en arco.
      if (spec.tipRound) {
        x -= spec.tipRound * w * 0.5 * (1 - Math.sqrt(Math.max(0, 1 - a * a))) * tipT;
      }
      if (isTip) {
        if (spec.teeth && j % 2 === 1) x -= spec.teeth * length;
        if (notch) x -= notch * length * (1 - a) * (1 - a);
      }

      const y = twist ? y0 * cosTw - z0 * sinTw : y0;
      const z = twist ? y0 * sinTw + z0 * cosTw : z0;
      positions.push(x, y, z);
      flex.push(Math.pow(t, 1.3));

      if (colors && ringColor) {
        const shade = 1 - edgeShade * Math.pow(Math.min(1, a), 1.4);
        tmp.copy(ringColor);
        if (stripe && a < 0.34) {
          tmp.lerp(stripe.color, stripe.amount * (1 - a / 0.34) * (1 - t * 0.7));
        }
        colors.push(tmp.r * shade, tmp.g * shade, tmp.b * shade);
      }
    }
  }

  for (let i = 0; i < lengthSegments; i++) {
    for (let j = 0; j < widthSegments; j++) {
      const a = i * (widthSegments + 1) + j;
      const b = a + 1;
      const c = a + widthSegments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (colors) {
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  }
  geometry.setAttribute("aFlex", new THREE.Float32BufferAttribute(flex, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function transformedClone(
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4
): THREE.BufferGeometry {
  const clone = geometry.clone();
  clone.applyMatrix4(matrix);
  return clone;
}

function fillAttribute(geometry: THREE.BufferGeometry, name: string, value: number) {
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute(
    name,
    new THREE.Float32BufferAttribute(new Float32Array(count).fill(value), 1)
  );
}

/** Hornea atributos por vértice para el shader (ver FlowerField.tsx):
 * una fase propia (cada pieza — pétalo, hoja, estambre — aletea con su
 * propio ritmo) y un pequeño offset de rugosidad (el material no se ve
 * perfectamente uniforme en toda la flor). Si la pieza no trae `aFlex`
 * (tallo, cáliz, centro), queda rígida respecto de la planta. */
function withMotion(
  geometry: THREE.BufferGeometry,
  windPhase: number,
  roughOffset: number
): THREE.BufferGeometry {
  fillAttribute(geometry, "aWindPhase", windPhase);
  fillAttribute(geometry, "aRoughOffset", roughOffset);
  if (!geometry.getAttribute("aFlex")) fillAttribute(geometry, "aFlex", 0);
  return geometry;
}

/** `aFlex` creciente a lo largo de +X (filamentos de estambres). */
function setFlexAlongX(geometry: THREE.BufferGeometry, length: number) {
  const pos = geometry.getAttribute("position");
  const flex = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    flex[i] = THREE.MathUtils.clamp(pos.getX(i) / length, 0, 1);
  }
  geometry.setAttribute("aFlex", new THREE.BufferAttribute(flex, 1));
}

/** `aBend`: cuánto se desplaza cada vértice con la flexión del tallo
 * (0 en el suelo, 1 en la punta). Se calcula por altura para tallo y
 * hojas; la cabeza floral usa un valor constante (el de la punta del
 * tallo) para moverse como un bloque unido al tallo. */
function bakeBendFromHeight(geometry: THREE.BufferGeometry, height: number) {
  const pos = geometry.getAttribute("position");
  const bend = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / height, 0, 1);
    bend[i] = t * t;
  }
  geometry.setAttribute("aBend", new THREE.BufferAttribute(bend, 1));
}

/** Curva natural del tallo: una flexión general suave y, en especies de
 * cabeza inclinada, un "cuello" que se arquea más cerca de la punta
 * (como el de un girasol). Devuelve el mismo desplazamiento que aplica,
 * para poder ubicar hojas y cabeza exactamente sobre el tallo. */
function stemOffset(t: number, bend: number, neck: number): number {
  return Math.pow(t, 1.7) * bend + Math.pow(t, 6) * neck;
}

function bendStemGeometry(
  geometry: THREE.BufferGeometry,
  height: number,
  bend: number,
  neck: number,
  dirX: number,
  dirZ: number
) {
  const pos = geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / height, 0, 1);
    const offset = stemOffset(t, bend, neck);
    pos.setX(i, pos.getX(i) + dirX * offset);
    pos.setZ(i, pos.getZ(i) + dirZ * offset);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** Tallo más oscuro al pie (sombra de la propia planta y del pasto) y
 * más claro hacia la flor: le da volumen sin iluminación extra. */
function paintStem(geometry: THREE.BufferGeometry, height: number, stemColor: THREE.Color) {
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / height, 0, 1);
    c.copy(stemColor).multiplyScalar(0.55 + 0.5 * smooth01(t));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** Pinta una geometría (típicamente el centro de la flor) con una
 * textura sutil de variación de color por vértice: ni un amarillo
 * plano ni ruido evidente, sólo un leve moteado orgánico. */
function applyCenterTexture(
  geometry: THREE.BufferGeometry,
  baseColor: THREE.Color,
  amount: number,
  random: () => number
) {
  const pos = geometry.getAttribute("position");
  const darker = baseColor.clone().multiplyScalar(0.7);
  const lighter = baseColor.clone().lerp(new THREE.Color("#ffffff"), 0.22);
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const n = random();
    const c =
      n < 0.5
        ? baseColor.clone().lerp(darker, (0.5 - n) * 1.7 * amount)
        : baseColor.clone().lerp(lighter, (n - 0.5) * 1.3 * amount);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
}

/** Centro tipo disco (margarita, girasol, cosmos): más oscuro en el
 * "ojo", un anillo más claro de polen hacia el borde y un moteado
 * leve; la cara de abajo (tapada por los pétalos) queda en sombra. */
function paintDisc(
  geometry: THREE.BufferGeometry,
  centerColor: THREE.Color,
  petalColor: THREE.Color,
  radius: number,
  random: () => number
) {
  const pos = geometry.getAttribute("position");
  const eye = centerColor.clone().multiplyScalar(0.55);
  const rim = centerColor.clone().lerp(petalColor, 0.3).multiplyScalar(1.08);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const r = Math.min(1, Math.hypot(pos.getX(i), pos.getZ(i)) / radius);
    if (r < 0.55) c.copy(eye).lerp(centerColor, r / 0.55);
    else c.copy(centerColor).lerp(rim, (r - 0.55) / 0.45);
    c.multiplyScalar(1 + (random() - 0.5) * 0.18);
    if (pos.getY(i) < 0) c.multiplyScalar(0.6);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** Pequeña variación de tono/saturación/luz por pétalo: dentro de una
 * misma flor ningún pétalo tiene exactamente el mismo color. */
function jitterColor(color: THREE.Color, random: () => number, amount = 1): THREE.Color {
  return color
    .clone()
    .offsetHSL(
      (random() - 0.5) * 0.02 * amount,
      (random() - 0.5) * 0.08 * amount,
      (random() - 0.5) * 0.06 * amount
    );
}

const FLOAT_ATTRIBUTES = ["aWindPhase", "aRoughOffset", "aFlex", "aBend"] as const;

/** Combina varias geometrías en una sola geometría INDEXADA: comparte
 * vértices entre triángulos vecinos (unas 4 veces menos vértices que
 * la versión no indexada), lo que abarata el shader de vértices y
 * permite más detalle por pétalo con el mismo costo. Si una parte trae
 * su propio color (degradé/textura horneada) se respeta; si no, se
 * rellena con el color plano de esa parte. */
function mergeParts(parts: MeshPart[]): THREE.BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    const geo = part.geometry;
    if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    const count = geo.getAttribute("position").count;
    vertexCount += count;
    indexCount += geo.index ? geo.index.count : count;
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const floats = FLOAT_ATTRIBUTES.map(() => new Float32Array(vertexCount));
  const indices =
    vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

  let vertexOffset = 0;
  let indexOffset = 0;
  for (const part of parts) {
    const geo = part.geometry;
    const posAttr = geo.getAttribute("position");
    const count = posAttr.count;

    positions.set(posAttr.array as Float32Array, vertexOffset * 3);
    normals.set(geo.getAttribute("normal").array as Float32Array, vertexOffset * 3);

    const colorAttr = geo.getAttribute("color");
    if (colorAttr) {
      colors.set(colorAttr.array as Float32Array, vertexOffset * 3);
    } else {
      for (let v = 0; v < count; v++) {
        colors[(vertexOffset + v) * 3] = part.color.r;
        colors[(vertexOffset + v) * 3 + 1] = part.color.g;
        colors[(vertexOffset + v) * 3 + 2] = part.color.b;
      }
    }

    FLOAT_ATTRIBUTES.forEach((name, k) => {
      const attr = geo.getAttribute(name);
      if (attr) floats[k].set(attr.array as Float32Array, vertexOffset);
    });

    if (geo.index) {
      const src = geo.index.array;
      for (let k = 0; k < src.length; k++) indices[indexOffset + k] = src[k] + vertexOffset;
      indexOffset += src.length;
    } else {
      for (let k = 0; k < count; k++) indices[indexOffset + k] = vertexOffset + k;
      indexOffset += count;
    }

    vertexOffset += count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  FLOAT_ATTRIBUTES.forEach((name, k) => {
    merged.setAttribute(name, new THREE.BufferAttribute(floats[k], 1));
  });
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

/** true mientras se construye la versión lejana ("far") de una flor:
 * tallos, hojas, cáliz y centro usan menos segmentos y se omiten los
 * estambres (a esa distancia no se distinguen). */
let farDetail = false;

interface BuildOptions {
  /** "far": versión liviana para flores lejanas (menos segmentos por
   * pétalo y hoja; la silueta y los colores son los mismos). */
  detail: "field" | "showcase" | "far";
  /** 0 = capullo cerrado, 1 = flor completamente abierta. */
  bloom?: number;
}

/** Matriz para colocar un pétalo: base apoyada sobre un anillo de radio
 * `attachRadius` alrededor del eje (a la altura `headY`), abierta
 * `openAngle` radianes desde la horizontal y rotada `placementAngle`
 * alrededor del eje Y. El desplazamiento radial va ANTES de abrir el
 * pétalo: así la base queda sobre el anillo real de inserción aunque el
 * pétalo esté casi vertical (antes se elevaba y se metía hacia el eje). */
function petalMatrix(
  attachRadius: number,
  openAngle: number,
  placementAngle: number,
  headY: number
) {
  const m = new THREE.Matrix4();
  const translateUp = new THREE.Matrix4().makeTranslation(0, headY, 0);
  const rotateY = new THREE.Matrix4().makeRotationY(placementAngle);
  const translateOut = new THREE.Matrix4().makeTranslation(attachRadius, 0, 0);
  const rotateZ = new THREE.Matrix4().makeRotationZ(openAngle);
  m.multiply(translateUp).multiply(rotateY).multiply(translateOut).multiply(rotateZ);
  return m;
}

/** Deriva un tono "garganta" (base del pétalo) más oscuro y cálido a
 * partir del color principal, para que cada pétalo tenga un leve
 * degradé en vez de verse como un plano de color parejo. */
function throatTone(color: THREE.Color, centerColor: THREE.Color): THREE.Color {
  return color.clone().lerp(centerColor, 0.35).multiplyScalar(0.85);
}

function buildDiscHead(
  visual: FlowerVisual,
  random: () => number,
  headY: number,
  segments: { length: number; width: number },
  parts: MeshPart[],
  bloom: number
) {
  const { petalShape, petalCount, layers, scale } = visual;
  const spec = SHAPES[petalShape];
  const widthMul = visual.petalWidth ?? 1;
  const cupMul = visual.petalCup ?? 1;
  const notch = visual.petalNotch ?? spec.notch;
  const closure = visual.petalClosure ?? spec.closure;
  const curlScale = visual.petalCurl ?? 1;
  // bloom 0 (capullo cerrado) → pétalos casi verticales, envolviendo el
  // centro, mucho más cortos; bloom 1 (abierta) → pétalos extendidos.
  // El capullo tiene un ángulo mínimo absoluto: incluso las flores que
  // abiertas son planas (margarita, cerezo) se ven cerradas de pimpollo.
  const openAngleOpen = spec.openAngle * (visual.petalOpen ?? 1) * 0.86;
  const budAngle = Math.min(1.6, Math.max(1.2, openAngleOpen * 1.75));
  const openAngle = THREE.MathUtils.lerp(budAngle, openAngleOpen, bloom);
  const bloomLength = THREE.MathUtils.lerp(0.5, 1, bloom);
  const baseLength = spec.baseLength * scale * bloomLength;
  const baseWidth = baseLength * spec.widthRatio * widthMul;
  const isDisc = visual.centerShape === "disc";

  const petalColorMain = new THREE.Color(visual.petalColor);
  const petalColorAlt = new THREE.Color(visual.petalColorAlt);
  const centerColorObj = new THREE.Color(visual.centerColor);
  const throatMain = throatTone(petalColorMain, centerColorObj);
  const throatAlt = throatTone(petalColorAlt, centerColorObj);
  const stripe =
    petalShape === "recurved" ? { color: centerColorObj, amount: 0.55 } : undefined;

  // El centro se calcula primero: en flores tipo margarita/girasol los
  // pétalos nacen desde el borde del disco, no desde el eje.
  const centerScale = visual.centerScale ?? 1;
  const centerVisibility = THREE.MathUtils.lerp(0.4, 1, bloom);
  const centerRadius = 0.07 * scale * (1 + layers * 0.08) * centerScale * centerVisibility;

  // Flores de pocos pétalos (lirio, tulipán, hibisco, cosmos) reciben
  // más segmentos a lo largo: son pocas piezas y se ven de cerca, así
  // que la curva se nota más suave sin encarecer el campo.
  const perLayer = Math.ceil(petalCount / layers);
  const lengthSegs = segments.length + (perLayer <= 8 ? 2 : 0);

  // Altura entre capas: cada capa hacia adentro sube un poco (como
  // pétalos reales que se van cerrando hacia el centro).
  const heightStep = 0.026 * scale;
  let topLayerHeadY = headY;

  for (let layer = 0; layer < layers; layer++) {
    const frac = layers > 1 ? layer / (layers - 1) : 0;
    const layerShrink = 1 - frac * 0.42;
    const layerLength = baseLength * layerShrink;
    const layerWidth = baseWidth * layerShrink;
    const layerCount = Math.max(3, Math.round((petalCount / layers) * (1 - layer * 0.1)));
    // Las capas internas nacen MÁS CERCA del eje y más arriba: se anidan
    // hacia el centro, con superposición y profundidad reales.
    let attachRadius = Math.max(0.014 * scale, 0.052 * scale - layer * 0.013 * scale);
    if (isDisc && centerScale > 0) {
      attachRadius = Math.max(attachRadius, centerRadius * (0.82 - layer * 0.12));
    }
    const layerHeadY = headY + layer * heightStep;
    topLayerHeadY = layerHeadY;
    // Capas internas más cerradas: la rosa y el clavel forman una copa
    // apretada en el centro en vez de un abanico plano.
    const layerOpen = Math.min(1.45, openAngle * (1 + layer * closure));
    const rotationOffset = layer * (Math.PI / layerCount) + random() * 0.3;
    const isAlt = layer % 2 === 1;
    const tipColor = isAlt ? petalColorAlt : petalColorMain;
    const baseColor = isAlt ? throatAlt : throatMain;
    const ao = 0.12 + frac * 0.3;

    for (let i = 0; i < layerCount; i++) {
      const jitter = (random() - 0.5) * 0.18;
      const angle = (i / layerCount) * Math.PI * 2 + rotationOffset + jitter;
      let open = layerOpen + (random() - 0.5) * 0.1;
      let len = layerLength * (0.86 + random() * 0.28);
      let wid = layerWidth * (0.84 + random() * 0.32);
      const petalRadius = attachRadius * (0.9 + random() * 0.22);
      const petalHeadY = layerHeadY + (random() - 0.5) * heightStep * 0.7;
      let cup = spec.cup * cupMul * (0.78 + random() * 0.5);
      const twist = spec.twist * (random() < 0.5 ? -1 : 1) * (0.6 + random() * 0.7);
      const ripple = spec.ripple * (0.5 + random() * 0.9);
      let tip = jitterColor(tipColor, random);

      // Labelo de orquídea: el pétalo inferior es más grande, más
      // cóncavo, cae hacia adelante y tiene el color del centro.
      if (visual.lip && layer === 0 && i === 0) {
        len *= 1.2;
        wid *= 1.45;
        open -= 0.4;
        cup *= 2.2;
        tip = tip.lerp(centerColorObj, 0.65);
      }

      const petalGeo = withMotion(
        createPetalGeometry(
          spec,
          len,
          wid,
          lengthSegs,
          segments.width,
          { base: baseColor, tip },
          { edgeNoise: spec.edgeNoise, cupAmount: cup, twist, ripple, notch, curlScale, ao, stripe, random }
        ),
        random() * Math.PI * 2,
        (random() - 0.5) * 0.18
      );

      parts.push({
        geometry: transformedClone(petalGeo, petalMatrix(petalRadius, open, angle, petalHeadY)),
        color: tip,
      });
    }
  }

  if (centerScale > 0) {
    const centerSegs = farDetail ? 6 : segments.length >= 6 ? 14 : 10;
    const centerGeo = new THREE.SphereGeometry(
      centerRadius,
      centerSegs,
      Math.max(6, centerSegs - 4)
    );

    if (isDisc) {
      // Disco compacto de florecitas apretadas, no una bocha redonda:
      // esfera achatada con un leve relieve radial granulado.
      centerGeo.scale(1, 0.32, 1);
      const cPos = centerGeo.getAttribute("position");
      for (let i = 0; i < cPos.count; i++) {
        const cx = cPos.getX(i);
        const cy = cPos.getY(i);
        const cz = cPos.getZ(i);
        const r = Math.sqrt(cx * cx + cz * cz);
        const bump = (Math.sin(r * 70 + cx * 30) * 0.5 + 0.5) * 0.09 * centerRadius;
        cPos.setY(i, cy + (cy > 0 ? bump : 0));
      }
      cPos.needsUpdate = true;
      centerGeo.computeVertexNormals();
      paintDisc(centerGeo, centerColorObj, petalColorMain, centerRadius, random);
    } else {
      applyCenterTexture(centerGeo, centerColorObj, 0.55, random);
    }

    // Anidado dentro del anillo de pétalos más interno, no flotando.
    centerGeo.translate(0, topLayerHeadY + 0.012 * scale, 0);
    withMotion(centerGeo, (random() - 0.5) * 0.6, (random() - 0.5) * 0.1);
    parts.push({ geometry: centerGeo, color: centerColorObj });
  }

  if (!farDetail) buildStamens(visual, topLayerHeadY, random, parts);
}

function buildStamens(
  visual: FlowerVisual,
  headY: number,
  random: () => number,
  parts: MeshPart[]
) {
  const s = visual.stamens;
  if (!s) return;
  const sc = visual.scale;
  const filamentColor = new THREE.Color(s.filamentColor);
  const antherColor = new THREE.Color(s.antherColor);
  const pistilLength = s.length * sc * 1.08;

  if (s.column) {
    // Columna estaminal (hibisco): una columna larga y levemente
    // curvada, con las anteras agrupadas en su tercio superior y cinco
    // estigmas oscuros en la punta.
    const columnGeo = new THREE.CylinderGeometry(0.008 * sc, 0.014 * sc, pistilLength, 6, 3);
    columnGeo.translate(0, pistilLength / 2, 0);
    const cPos = columnGeo.getAttribute("position");
    const flex = new Float32Array(cPos.count);
    for (let i = 0; i < cPos.count; i++) {
      const t = cPos.getY(i) / pistilLength;
      cPos.setX(i, cPos.getX(i) + t * t * 0.06 * sc);
      flex[i] = t * 0.5;
    }
    columnGeo.computeVertexNormals();
    columnGeo.setAttribute("aFlex", new THREE.BufferAttribute(flex, 1));
    columnGeo.translate(0, headY, 0);
    withMotion(columnGeo, random() * Math.PI * 2, (random() - 0.5) * 0.06);
    parts.push({ geometry: columnGeo, color: filamentColor });

    const columnPhase = random() * Math.PI * 2;
    for (let i = 0; i < s.count; i++) {
      const t = 0.62 + random() * 0.3;
      const ang = i * 2.4 + random() * 0.4;
      const antherGeo = new THREE.SphereGeometry(0.012 * sc, 5, 4);
      antherGeo.scale(1.3, 0.9, 0.9);
      antherGeo.translate(
        Math.cos(ang) * 0.014 * sc + t * t * 0.06 * sc,
        headY + pistilLength * t,
        Math.sin(ang) * 0.014 * sc
      );
      fillAttribute(antherGeo, "aFlex", t * 0.5);
      withMotion(antherGeo, columnPhase, (random() - 0.5) * 0.08);
      parts.push({ geometry: antherGeo, color: antherColor });
    }
    const stigmaColor = new THREE.Color(visual.centerColor);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const stigmaGeo = new THREE.SphereGeometry(0.011 * sc, 5, 4);
      stigmaGeo.translate(
        Math.cos(ang) * 0.016 * sc + 0.06 * sc,
        headY + pistilLength + 0.01 * sc,
        Math.sin(ang) * 0.016 * sc
      );
      fillAttribute(stigmaGeo, "aFlex", 0.5);
      withMotion(stigmaGeo, columnPhase, 0);
      parts.push({ geometry: stigmaGeo, color: stigmaColor });
    }
    return;
  }

  for (let i = 0; i < s.count; i++) {
    const angle = (i / s.count) * Math.PI * 2 + random() * 0.35;
    const length = s.length * sc * (0.85 + random() * 0.3);
    const tilt = 0.3 + random() * 0.3;
    // Estambres delicados: cada uno oscila con su propia fase.
    const stamenPhase = random() * Math.PI * 2;

    const filamentGeo = new THREE.CylinderGeometry(0.004 * sc, 0.006 * sc, length, 5, 1, true);
    filamentGeo.rotateZ(Math.PI / 2);
    filamentGeo.translate(length / 2, 0, 0);
    setFlexAlongX(filamentGeo, length);
    withMotion(filamentGeo, stamenPhase, (random() - 0.5) * 0.08);
    const matrix = petalMatrix(0.025 * sc, tilt, angle, headY);
    parts.push({ geometry: transformedClone(filamentGeo, matrix), color: filamentColor });

    // Antera alargada (no una bolita), como en los estambres reales.
    const antherGeo = new THREE.SphereGeometry(0.016 * sc, 5, 4);
    antherGeo.scale(2, 0.8, 0.8);
    antherGeo.translate(length, 0, 0);
    fillAttribute(antherGeo, "aFlex", 1);
    withMotion(antherGeo, stamenPhase, (random() - 0.5) * 0.08);
    parts.push({ geometry: transformedClone(antherGeo, matrix), color: antherColor });
  }

  // Pistilo central: una columna algo más gruesa que sube derecha por
  // el medio, con un pequeño bulbo en la punta.
  const pistilGeo = new THREE.CylinderGeometry(0.007 * sc, 0.01 * sc, pistilLength, 6, 1, true);
  pistilGeo.translate(0, pistilLength / 2, 0);
  pistilGeo.translate(0, headY, 0);
  withMotion(pistilGeo, (random() - 0.5) * 0.4, (random() - 0.5) * 0.06);
  parts.push({ geometry: pistilGeo, color: filamentColor });

  const pistilTipGeo = new THREE.SphereGeometry(0.014 * sc, 6, 5);
  pistilTipGeo.translate(0, headY + pistilLength, 0);
  withMotion(pistilTipGeo, (random() - 0.5) * 0.4, (random() - 0.5) * 0.06);
  parts.push({ geometry: pistilTipGeo, color: antherColor });
}

/** Espiga (lavanda, jacinto). Las florcitas se abren de abajo hacia
 * arriba, como en las espigas reales: en un capullo sólo las de la base
 * están abiertas y la punta sigue cerrada. */
function buildClusterHead(
  visual: FlowerVisual,
  random: () => number,
  headY: number,
  segments: { length: number; width: number },
  parts: MeshPart[],
  bloom: number
) {
  const { scale, petalCount } = visual;
  const spec = SHAPES.thin;
  const spikeLength = scale * 0.55 * THREE.MathUtils.lerp(0.58, 1, bloom);
  // Versión lejana (detalle "far"): menos florcitas, cada una un quad.
  const far = segments.length <= 3;
  const floretSteps = Math.max(far ? 4 : 6, Math.round((petalCount / 4) * (far ? 0.6 : 1)));
  const petalColorMain = new THREE.Color(visual.petalColor);
  const petalColorAlt = new THREE.Color(visual.petalColorAlt);
  const centerColorObj = new THREE.Color(visual.centerColor);
  const throatMain = throatTone(petalColorMain, centerColorObj);
  const throatAlt = throatTone(petalColorAlt, centerColorObj);

  for (let k = 0; k < floretSteps; k++) {
    const t = k / (floretSteps - 1 || 1);
    const y = headY + t * spikeLength;
    const radius = (1 - t * 0.55) * 0.1 * scale;
    const opened = t <= bloom * 1.15 + 0.05;
    const subPetals = far ? 3 : 5;
    const stagger = k * 0.7;
    for (let p = 0; p < subPetals; p++) {
      const angle = (p / subPetals) * Math.PI * 2 + stagger + random() * 0.2;
      const useAlt = p % 2 === 0;
      const sizeJitter = (0.82 + random() * 0.32) * (opened ? 1 : 0.55);
      const twist = spec.twist * (random() < 0.5 ? -1 : 1) * (0.6 + random() * 0.7);
      const ripple = spec.ripple * (0.5 + random() * 0.9);
      const tip = jitterColor(useAlt ? petalColorAlt : petalColorMain, random, 1.4);
      const floretGeo = withMotion(
        createPetalGeometry(
          spec,
          0.1 * scale * sizeJitter * (far ? 1.25 : 1),
          0.038 * scale * sizeJitter * (far ? 1.3 : 1),
          far ? 1 : Math.max(2, Math.floor(segments.length / 2)),
          far ? 1 : Math.max(2, Math.floor(segments.width / 2)),
          { base: useAlt ? throatAlt : throatMain, tip },
          { edgeNoise: 0.04, twist, ripple, ao: 0.2, random }
        ),
        random() * Math.PI * 2,
        (random() - 0.5) * 0.16
      );
      const matrix = petalMatrix(radius * 0.5, opened ? 0.75 : 1.35, angle, y);
      parts.push({ geometry: transformedClone(floretGeo, matrix), color: tip });
    }
  }

  const coreGeo = new THREE.CylinderGeometry(0.015 * scale, 0.02 * scale, spikeLength, 6);
  coreGeo.translate(0, headY + spikeLength / 2, 0);
  withMotion(coreGeo, 0, (random() - 0.5) * 0.06);
  parts.push({ geometry: coreGeo, color: centerColorObj });
}

const _up = new THREE.Vector3(0, 1, 0);

/** Arreglo "domo" (hortensia/mophead): una bocha cubierta de florcitas
 * de 4 pétalos, cada una orientada según la superficie de la bocha
 * (como flores reales, no pétalos sueltos en abanico), distribuidas con
 * espiral áurea para que no se amontonen. Cada florcita tiene su propio
 * tamaño, giro y mezcla de color, para que la cabeza se lea como un
 * ramillete de muchas flores pequeñas y no como una bocha uniforme. */
function buildDomeHead(
  visual: FlowerVisual,
  random: () => number,
  headY: number,
  segments: { length: number; width: number },
  parts: MeshPart[],
  bloom: number
) {
  const { scale, petalCount } = visual;
  const spec = SHAPES.dome;
  const domeRadius = 0.34 * scale * THREE.MathUtils.lerp(0.6, 1, bloom);
  const floretSize = 0.1 * scale;
  const petalColorMain = new THREE.Color(visual.petalColor);
  const petalColorAlt = new THREE.Color(visual.petalColorAlt);
  const centerColorObj = new THREE.Color(visual.centerColor);
  const throatMain = throatTone(petalColorMain, centerColorObj);
  const throatAlt = throatTone(petalColorAlt, centerColorObj);
  const GOLDEN_ANGLE = 2.399963;
  const normal = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const floretMatrix = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);

  // Versión lejana: la mitad de florcitas, más grandes, cada pétalo un quad
  // (de lejos la bocha se lee igual de llena).
  const far = segments.length <= 3;
  const floretCount = Math.round(Math.max(30, petalCount) * (far ? 0.5 : 1));
  for (let i = 0; i < floretCount; i++) {
    const u = (i + 0.5) / floretCount;
    // 0 = polo superior; llega por debajo del ecuador para que la bocha
    // envuelva la punta del tallo en vez de apoyarse encima como un disco.
    const phi = Math.acos(1 - u * 1.5);
    const theta = i * GOLDEN_ANGLE + random() * 0.15;
    normal.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    quat.setFromUnitVectors(_up, normal);
    floretMatrix.compose(
      new THREE.Vector3(
        normal.x * domeRadius,
        headY + (normal.y + 0.5) * domeRadius * 0.9,
        normal.z * domeRadius
      ),
      quat,
      one
    );
    const openAngle = 0.12 + random() * 0.12;
    const useAlt = random() < 0.35;
    const floretScale = (0.68 + random() * 0.58) * (far ? 1.4 : 1);
    const twist = spec.twist * (random() < 0.5 ? -1 : 1) * (0.6 + random() * 0.7);
    const ripple = spec.ripple * (0.5 + random() * 0.9);
    const tip = jitterColor(useAlt ? petalColorAlt : petalColorMain, random, 1.5);
    // Las florcitas de abajo quedan en sombra bajo las de arriba.
    const ao = 0.15 + Math.min(1, phi / (Math.PI / 2)) * 0.3;

    const floretGeo = withMotion(
      createPetalGeometry(
        spec,
        floretSize * 0.9 * floretScale,
        floretSize * 0.9 * 0.9 * floretScale,
        far ? 1 : Math.max(2, Math.floor(segments.length / 2)),
        far ? 1 : Math.max(2, Math.floor(segments.width / 2)),
        { base: useAlt ? throatAlt : throatMain, tip },
        { edgeNoise: 0.05, twist, ripple, ao, random }
      ),
      random() * Math.PI * 2,
      (random() - 0.5) * 0.16
    );

    const rot = random() * Math.PI;
    for (let p = 0; p < 4; p++) {
      const matrix = petalMatrix(0.006 * scale, openAngle, (p / 4) * Math.PI * 2 + rot, 0).premultiply(
        floretMatrix
      );
      parts.push({ geometry: transformedClone(floretGeo, matrix), color: tip });
    }
  }
}

/** Ramillete tipo umbela (jazmín): varias florcitas sobre pedicelos
 * cortos que salen de un mismo punto. Cada florcita abierta tiene un
 * tubo y cinco pétalos en estrella levemente torcidos (como un
 * molinete); las que todavía no abrieron son pimpollos alargados de
 * color rosado. La apertura (`bloom`) decide cuántas están abiertas. */
function buildUmbelHead(
  visual: FlowerVisual,
  random: () => number,
  headY: number,
  segments: { length: number; width: number },
  parts: MeshPart[],
  bloom: number
) {
  const { scale } = visual;
  const spec = SHAPES.star;
  // Versión lejana: pétalos de un solo tramo y sin tubo.
  const far = segments.length <= 3;
  const florets = Math.max(4, visual.petalCount);
  const openFraction = THREE.MathUtils.lerp(0.15, 0.9, bloom);
  const petalColor = new THREE.Color(visual.petalColor);
  const budColor = new THREE.Color(visual.petalColorAlt);
  const centerColorObj = new THREE.Color(visual.centerColor);
  const stemColor = new THREE.Color(visual.stemColor);
  const throat = throatTone(petalColor, centerColorObj);
  const GOLDEN_ANGLE = 2.399963;
  const quat = new THREE.Quaternion();
  const dir = new THREE.Vector3();
  const floretMatrix = new THREE.Matrix4();

  for (let f = 0; f < florets; f++) {
    const az = f * GOLDEN_ANGLE + random() * 0.3;
    const el = THREE.MathUtils.lerp(1.45, 0.5, Math.sqrt((f + 0.5) / florets));
    dir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    quat.setFromUnitVectors(_up, dir);
    const pedLen = (0.06 + random() * 0.06) * scale;
    const phase = random() * Math.PI * 2;

    const pedicel = new THREE.CylinderGeometry(0.004 * scale, 0.005 * scale, pedLen, 4, 1, true);
    pedicel.translate(0, pedLen / 2, 0);
    pedicel.applyQuaternion(quat);
    pedicel.translate(0, headY, 0);
    withMotion(pedicel, phase, 0);
    parts.push({ geometry: pedicel, color: stemColor });

    floretMatrix.compose(
      new THREE.Vector3(dir.x * pedLen, headY + dir.y * pedLen, dir.z * pedLen),
      quat,
      new THREE.Vector3(1, 1, 1)
    );

    if (random() < openFraction) {
      const tubeLen = 0.035 * scale;
      if (!far) {
        const tube = new THREE.CylinderGeometry(0.008 * scale, 0.005 * scale, tubeLen, 5, 1, true);
        tube.translate(0, tubeLen / 2, 0);
        tube.applyMatrix4(floretMatrix);
        withMotion(tube, phase, 0);
        parts.push({ geometry: tube, color: petalColor.clone().lerp(budColor, 0.25) });
      }

      const rot = random() * Math.PI;
      for (let p = 0; p < 5; p++) {
        const len = spec.baseLength * scale * (0.9 + random() * 0.2);
        const tip = jitterColor(petalColor, random, 0.6);
        const petal = createPetalGeometry(
          spec,
          len,
          len * spec.widthRatio,
          far ? 1 : Math.max(3, Math.floor(segments.length * 0.6)),
          far ? 1 : 2,
          { base: throat, tip },
          { edgeNoise: spec.edgeNoise, twist: 0.35, ripple: 0.02, ao: 0.1, random }
        );
        const m = petalMatrix(0.004 * scale, spec.openAngle + (random() - 0.5) * 0.1, (p / 5) * Math.PI * 2 + rot, tubeLen);
        petal.applyMatrix4(m.premultiply(floretMatrix));
        withMotion(petal, phase + p * 0.3, (random() - 0.5) * 0.12);
        parts.push({ geometry: petal, color: tip });
      }
    } else {
      const bud = new THREE.SphereGeometry(0.013 * scale, 5, 4);
      bud.scale(1, 2.3, 1);
      bud.translate(0, 0.028 * scale, 0);
      bud.applyMatrix4(floretMatrix);
      fillAttribute(bud, "aFlex", 0.3);
      withMotion(bud, phase, (random() - 0.5) * 0.08);
      parts.push({ geometry: bud, color: jitterColor(budColor, random, 1.2) });
    }
  }
}

/** Cáliz: transición entre el tallo y la base de la cabeza floral, con
 * sépalos verdes que abrazan el capullo cuando está cerrado y se doblan
 * hacia atrás cuando la flor se abre. En el clavel es un tubo largo. */
function buildCalyx(
  visual: FlowerVisual,
  headY: number,
  random: () => number,
  parts: MeshPart[],
  bloom: number,
  withSepals: boolean
) {
  const scale = visual.scale;
  const lengthMul = visual.calyxLength ?? 1;
  const tubular = lengthMul > 1.5;
  const calyxHeight = 0.055 * scale * (0.8 + random() * 0.4) * lengthMul;
  const stemWidth = visual.stemWidth ?? 1;
  const bottomRadius = 0.02 * scale * stemWidth * (tubular ? 1.35 : 1);
  const topRadius = Math.max(
    bottomRadius * 1.25,
    0.048 * scale * (0.9 + random() * 0.2) * (tubular ? 0.82 : 1)
  );
  const calyxGeo = new THREE.CylinderGeometry(
    topRadius,
    bottomRadius,
    calyxHeight,
    farDetail ? 5 : 7,
    tubular && !farDetail ? 3 : 1,
    true
  );
  calyxGeo.translate(0, calyxHeight / 2 - calyxHeight * 0.15, 0);
  // Un poco de solape con la base de los pétalos para que no se lea
  // como una pieza flotante separada.
  calyxGeo.translate(0, headY - calyxHeight * 0.55, 0);
  const calyxColor = new THREE.Color(visual.stemColor).lerp(new THREE.Color("#2f5c34"), 0.3);
  withMotion(calyxGeo, (random() - 0.5) * 0.5, (random() - 0.5) * 0.06);
  parts.push({ geometry: calyxGeo, color: calyxColor });

  if (!withSepals) return;

  const calyxTop = headY + calyxHeight * 0.3;
  const sepalBase = calyxColor.clone().multiplyScalar(0.85);
  const sepalTip = calyxColor.clone().lerp(new THREE.Color("#9fcf7a"), 0.25);
  const count = 5;
  for (let i = 0; i < count; i++) {
    const len = 0.075 * scale * (0.85 + random() * 0.3) * (tubular ? 0.55 : 1);
    const open = tubular
      ? THREE.MathUtils.lerp(1.3, 0.95, bloom)
      : THREE.MathUtils.lerp(1.25, -0.5, bloom) + (random() - 0.5) * 0.25;
    const sepal = withMotion(
      createPetalGeometry(SEPAL, len, len * 0.45, farDetail ? 1 : 3, farDetail ? 1 : 2, { base: sepalBase, tip: sepalTip }, {
        edgeNoise: 0.04,
        edgeShade: 0.2,
        twist: (random() - 0.5) * 0.3,
        ao: 0.1,
        random,
      }),
      random() * Math.PI * 2,
      (random() - 0.5) * 0.08
    );
    const angle = (i / count) * Math.PI * 2 + random() * 0.4;
    parts.push({
      geometry: transformedClone(sepal, petalMatrix(topRadius * 0.85, open, angle, calyxTop - 0.012 * scale)),
      color: calyxColor,
    });
  }
}

interface StemFrame {
  baseX: number;
  baseZ: number;
  dirX: number;
  dirZ: number;
  height: number;
  bend: number;
  neck: number;
}

function offsetOnStem(frame: StemFrame, y: number): [number, number] {
  const t = THREE.MathUtils.clamp(y / frame.height, 0, 1);
  const o = stemOffset(t, frame.bend, frame.neck);
  return [frame.baseX + frame.dirX * o, frame.baseZ + frame.dirZ * o];
}

/** Hojas según el estilo de la especie. Todas se apoyan exactamente
 * sobre el tallo curvo (no sobre un eje recto imaginario), siguen una
 * filotaxis aproximada (ángulo áureo) y tienen tamaño, inclinación,
 * torsión y tono propios. */
function buildLeaves(
  visual: FlowerVisual,
  random: () => number,
  frame: StemFrame,
  parts: MeshPart[],
  isMainStem: boolean
) {
  const s = visual.scale;
  const leafScale = visual.leafScale ?? 1;
  const style = visual.leafStyle ?? "broad";
  const stemColor = new THREE.Color(visual.stemColor);
  const H = frame.height;

  const leaves: {
    spec: ShapeSpec;
    length: number;
    width: number;
    y: number;
    open: number;
    angle: number;
    curlScale: number;
    segs: [number, number];
  }[] = [];

  const reduce = (n: number) => (isMainStem ? n : Math.max(1, Math.ceil(n * 0.4)));
  const phyllo = random() * Math.PI * 2;

  if (style === "strap") {
    // Hojas largas en cinta que nacen al pie y se arquean hacia afuera.
    const count = reduce(3 + Math.floor(random() * 2));
    for (let i = 0; i < count; i++) {
      leaves.push({
        spec: STRAP_LEAF,
        length: visual.stemHeight * (0.42 + random() * 0.28) * Math.sqrt(leafScale),
        width: 0.055 * s * leafScale * (0.85 + random() * 0.3),
        y: H * (0.01 + random() * 0.04),
        open: 1.05 + random() * 0.3,
        angle: phyllo + (i / count) * Math.PI * 2 + (random() - 0.5) * 0.6,
        curlScale: -(1 + random() * 0.6),
        segs: [6, 2],
      });
    }
  } else if (style === "narrow") {
    const count = reduce(4 + Math.floor(random() * 3));
    for (let i = 0; i < count; i++) {
      const len = 0.2 * s * leafScale * (0.8 + random() * 0.4);
      leaves.push({
        spec: LEAF,
        length: len,
        width: len * 0.16,
        y: H * (0.12 + (i / count) * 0.62 + random() * 0.06),
        open: 0.45 + random() * 0.35,
        angle: phyllo + i * 2.4 + random() * 0.5,
        curlScale: -0.9,
        segs: [4, 2],
      });
    }
  } else if (style === "feathery") {
    // Hojas muy divididas: pequeños abanicos de segmentos finísimos.
    const groups = reduce(4);
    for (let g = 0; g < groups; g++) {
      const y = H * (0.18 + (g / groups) * 0.55 + random() * 0.05);
      const base = phyllo + g * 2.4;
      const needles = 3 + Math.floor(random() * 2);
      for (let n = 0; n < needles; n++) {
        leaves.push({
          spec: NEEDLE,
          length: 0.13 * s * leafScale * (0.75 + random() * 0.5),
          width: 0.012 * s * leafScale,
          y: y + (random() - 0.5) * 0.02,
          open: 0.25 + random() * 0.45,
          angle: base + (n - (needles - 1) / 2) * 0.45,
          curlScale: -0.5,
          segs: [3, 1],
        });
      }
    }
  } else {
    const count = reduce(2 + (random() < 0.4 ? 1 : 0) + (leafScale > 1.3 ? 1 : 0));
    for (let i = 0; i < count; i++) {
      const len = 0.22 * s * leafScale * (0.75 + random() * 0.5);
      leaves.push({
        spec: LEAF,
        length: len,
        width: len * 0.45,
        y: H * (0.22 + (i / count) * 0.48 + random() * 0.08),
        open: -0.2 - random() * 0.3,
        angle: phyllo + i * 2.4 + random() * 0.6,
        curlScale: 1,
        segs: [4, 2],
      });
    }
  }

  for (const leaf of leaves) {
    const leafTip = stemColor
      .clone()
      .lerp(new THREE.Color(random() < 0.5 ? "#dff2c8" : "#6bd08a"), 0.16 + random() * 0.14);
    const geo = withMotion(
      createPetalGeometry(
        leaf.spec,
        leaf.length,
        leaf.width,
        farDetail ? Math.min(2, leaf.segs[0]) : leaf.segs[0],
        farDetail ? 1 : leaf.segs[1],
        { base: stemColor.clone().multiplyScalar(0.8), tip: leafTip },
        {
          edgeNoise: 0.05,
          edgeShade: 0.22,
          cupAmount: leaf.spec.cup * (0.7 + random() * 0.6),
          twist: leaf.spec.twist * (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.8),
          ripple: leaf.spec.ripple * (0.6 + random() * 0.8),
          curlScale: leaf.curlScale,
          ao: 0.15,
          random,
        }
      ),
      random() * Math.PI * 2,
      (random() - 0.5) * 0.1
    );
    const [ox, oz] = offsetOnStem(frame, leaf.y);
    const matrix = petalMatrix(0.012 * s, leaf.open, leaf.angle, leaf.y).premultiply(
      new THREE.Matrix4().makeTranslation(ox, 0, oz)
    );
    const placed = transformedClone(geo, matrix);
    bakeBendFromHeight(placed, visual.stemHeight);
    parts.push({ geometry: placed, color: stemColor });
  }
}

/** Un tallo completo: tallo curvo, hojas, cáliz y cabeza floral. La
 * cabeza se arma en su propio espacio y después se apoya exactamente
 * en la punta del tallo, inclinada según la especie y continuando la
 * curva del tallo (el "cuello"), así no quedan piezas desalineadas. */
function buildStem(
  visual: FlowerVisual,
  random: () => number,
  segments: { length: number; width: number },
  bloom: number,
  parts: MeshPart[],
  stemIndex: number,
  stemCount: number
) {
  const isMain = stemIndex === 0;
  const s = visual.scale;
  const stemColor = new THREE.Color(visual.stemColor);
  const H = visual.stemHeight * (isMain ? 1 : 0.7 + random() * 0.25);

  // El tallo principal se arquea siempre hacia +X local: la rotación
  // de cada instancia en el campo decide hacia dónde mira la flor.
  // Los tallos secundarios de una mata salen hacia afuera.
  const spreadAngle = isMain ? 0 : (stemIndex / stemCount) * Math.PI * 2 + random() * 0.9;
  const baseR = isMain ? 0 : (0.03 + random() * 0.04) * Math.max(0.6, s);
  const dirX = Math.cos(spreadAngle);
  const dirZ = Math.sin(spreadAngle);
  const tilt = (visual.headTilt ?? 0) * (0.85 + random() * 0.3);
  const frame: StemFrame = {
    baseX: dirX * baseR,
    baseZ: dirZ * baseR,
    dirX,
    dirZ,
    height: H,
    bend: H * (0.035 + tilt * 0.09 + (isMain ? 0 : 0.16)),
    neck: H * tilt * 0.12,
  };

  const radiusMul = (isMain ? 1 : 0.85) * (visual.stemWidth ?? 1);
  const stemGeo = new THREE.CylinderGeometry(
    0.018 * s * radiusMul,
    0.03 * s * radiusMul,
    H,
    farDetail ? 4 : 7,
    farDetail ? 3 : 6,
    true
  );
  stemGeo.translate(0, H / 2, 0);
  bendStemGeometry(stemGeo, H, frame.bend, frame.neck, dirX, dirZ);
  stemGeo.translate(frame.baseX, 0, frame.baseZ);
  paintStem(stemGeo, H, stemColor);
  // Fase 0: el tallo es el "ancla" del viento; todo lo demás aletea con
  // su propia fase alrededor de él.
  withMotion(stemGeo, 0, (random() - 0.5) * 0.05);
  bakeBendFromHeight(stemGeo, visual.stemHeight);
  parts.push({ geometry: stemGeo, color: stemColor });

  buildLeaves(visual, random, frame, parts, isMain);

  const headParts: MeshPart[] = [];
  const shape = visual.petalShape;
  const isDiscHead = shape !== "cluster" && shape !== "dome" && shape !== "star";
  buildCalyx(visual, 0, random, headParts, bloom, isDiscHead);
  if (shape === "cluster") buildClusterHead(visual, random, 0, segments, headParts, bloom);
  else if (shape === "dome") buildDomeHead(visual, random, 0, segments, headParts, bloom);
  else if (shape === "star") buildUmbelHead(visual, random, 0, segments, headParts, bloom);
  else buildDiscHead(visual, random, 0, segments, headParts, bloom);

  const tipOffset = frame.bend + frame.neck;
  const stemTangent = Math.atan((1.7 * frame.bend + 6 * frame.neck) / H);
  const faceTilt = Math.max(stemTangent, tilt + stemTangent * 0.4);
  const headScale = isMain ? 1 : 0.8 + random() * 0.12;
  const headMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(frame.baseX + dirX * tipOffset, H, frame.baseZ + dirZ * tipOffset),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dirZ, 0, -dirX), faceTilt),
    new THREE.Vector3(headScale, headScale, headScale)
  );
  const pivotBend = Math.min(1, (H / visual.stemHeight) ** 2);
  for (const part of headParts) {
    part.geometry.applyMatrix4(headMatrix);
    fillAttribute(part.geometry, "aBend", pivotBend);
    parts.push(part);
  }
}

/**
 * Construye la geometría completa (tallos + hojas + cabezas florales)
 * de una especie, ya combinada en un único BufferGeometry indexado con
 * color por vértice horneado. `seed` determina la variación (ángulos,
 * jitter) de forma determinística para que no cambie entre renders.
 */
export function buildFlowerGeometry(
  visual: FlowerVisual,
  seed: number,
  options: BuildOptions = { detail: "field" }
): THREE.BufferGeometry {
  const random = createSeededRandom(seed);
  const bloom = options.bloom ?? 1;
  const segments =
    options.detail === "showcase"
      ? { length: 9, width: 6 }
      : options.detail === "far"
        ? { length: 2, width: 1 }
        : { length: 5, width: 4 };

  const parts: MeshPart[] = [];
  const stemCount = Math.max(1, visual.clump ?? 1);
  farDetail = options.detail === "far";
  try {
    for (let k = 0; k < stemCount; k++) {
      buildStem(visual, random, segments, bloom, parts, k, stemCount);
    }
  } finally {
    farDetail = false;
  }

  const merged = mergeParts(parts);
  merged.computeBoundingSphere();
  return merged;
}

/** Hashea un string (id de especie) a un entero, usado como semilla. */
export function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
