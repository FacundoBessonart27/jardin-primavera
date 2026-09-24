import * as THREE from "three";
import type { FlowerVisual, PetalShape } from "@/data/flowers";
import { createSeededRandom } from "@/lib/random";

/**
 * ============================================================
 *  GENERADOR PROCEDURAL DE FLORES
 * ============================================================
 * Cada especie se construye combinando geometría de Three.js:
 * pétalos curvos con degradé de color y sombreado horneados por
 * vértice, estambres/pistilo opcionales, un centro con textura,
 * un tallo con una leve curva natural y hojas de tamaño y color
 * variables. Cada pétalo se genera individualmente (no se clona
 * el mismo triángulo N veces) para que ninguna flor se vea como
 * una copia exacta de la de al lado. Todo se combina en UNA sola
 * geometría por especie + variante de apertura, lo que permite
 * dibujar cientos de flores con muy pocos draw calls usando
 * InstancedMesh (ver FlowerField.tsx).
 */

interface MeshPart {
  geometry: THREE.BufferGeometry;
  /** Color plano de respaldo, usado si la geometría no trae su
   * propio atributo de color (degradé o textura horneada). */
  color: THREE.Color;
}

interface PetalOptions {
  /** Irregularidad del borde: pequeña variación de ancho por anillo. */
  edgeNoise?: number;
  /** Cuánto se curvan los bordes hacia adentro (efecto "cuenco"). */
  cupAmount?: number;
  /** Oscurecimiento sutil cerca de los bordes (simula nervaduras). */
  edgeShade?: number;
  /** Torsión total (radianes) de la punta respecto de la base: una
   * ligera hélice, como el pétalo real de un tulipán o una rosa. */
  twist?: number;
  /** Amplitud de una leve ondulación a lo largo del pétalo (además del
   * "cuenco"), para que la superficie no sea un plano curvo perfecto. */
  ripple?: number;
  /** Generador aleatorio determinístico para la irregularidad. */
  random?: () => number;
}

function petalWidthProfile(shape: PetalShape, t: number): number {
  switch (shape) {
    case "round":
      return Math.pow(Math.sin(Math.PI * Math.min(t, 1)), 0.85);
    case "pointed":
      return Math.sin(Math.PI * t) * (1 - 0.2 * t);
    case "thin":
      return Math.sin(Math.PI * t) * 0.55;
    case "trumpet":
      return Math.pow(Math.max(t, 0.001), 0.55);
    case "ruffled":
      return Math.sin(Math.PI * t) * (1 + 0.22 * Math.sin(t * 18));
    case "fringed":
      return Math.sin(Math.PI * t) * (1 + 0.34 * Math.sin(t * 32 + 1.4));
    case "dome":
      return Math.pow(Math.sin(Math.PI * Math.min(t, 1)), 0.85);
    default:
      return Math.sin(Math.PI * t);
  }
}

function petalCurlProfile(shape: PetalShape, t: number): number {
  switch (shape) {
    case "round":
      return t * t * 0.55;
    case "pointed":
      return t * t * 0.35;
    case "thin":
      return t * t * 0.18;
    case "trumpet":
      return Math.sin(t * Math.PI * 0.5) * 0.95;
    case "ruffled":
      return t * t * 0.4 + 0.06 * Math.sin(t * 18);
    case "fringed":
      return t * t * 0.48 + 0.04 * Math.sin(t * 32);
    case "dome":
      return t * t * 0.4;
    default:
      return t * t * 0.3;
  }
}

const CUP_AMOUNT: Record<PetalShape, number> = {
  round: 0.24,
  pointed: 0.17,
  thin: 0.09,
  trumpet: 0.32,
  ruffled: 0.22,
  cluster: 0.12,
  fringed: 0.26,
  dome: 0.2,
};

const EDGE_NOISE: Record<PetalShape, number> = {
  round: 0.06,
  pointed: 0.045,
  thin: 0.03,
  trumpet: 0.06,
  ruffled: 0.05,
  cluster: 0.03,
  fringed: 0.07,
  dome: 0.05,
};

const EDGE_SHADE = 0.32;

/** Torsión base (radianes, punta vs. base) por forma: una leve hélice
 * a lo largo del pétalo, como en un pétalo real, nunca un plano recto. */
const TWIST_AMOUNT: Record<PetalShape, number> = {
  round: 0.09,
  pointed: 0.15,
  thin: 0.11,
  trumpet: 0.06,
  ruffled: 0.07,
  cluster: 0.06,
  fringed: 0.08,
  dome: 0.06,
};

/** Amplitud de una ondulación suave adicional a lo largo del pétalo
 * (además del "cuenco" de `cupAmount`), para romper la superficie
 * curva perfecta que da el aspecto "de plástico". */
const RIPPLE_AMOUNT: Record<PetalShape, number> = {
  round: 0.05,
  pointed: 0.035,
  thin: 0.03,
  trumpet: 0.03,
  ruffled: 0.08,
  cluster: 0.02,
  fringed: 0.07,
  dome: 0.03,
};

/** Construye un único pétalo en espacio local: crece a lo largo de +X,
 * se curva hacia +Y (con un leve efecto "cuenco" hacia los bordes) y
 * su ancho se extiende en Z. Hornea un degradé de color base→punta y
 * un leve sombreado hacia los bordes (simula nervaduras/profundidad),
 * y si se pasa `random`, agrega una irregularidad sutil en el borde
 * para que no sea un contorno perfectamente liso. */
function createPetalGeometry(
  shape: PetalShape,
  length: number,
  width: number,
  lengthSegments: number,
  widthSegments: number,
  gradient?: { base: THREE.Color; tip: THREE.Color },
  options: PetalOptions = {}
): THREE.BufferGeometry {
  const {
    edgeNoise = 0,
    cupAmount = CUP_AMOUNT[shape],
    edgeShade = EDGE_SHADE,
    twist = 0,
    ripple = 0,
    random,
  } = options;

  const positions: number[] = [];
  const colors: number[] | null = gradient ? [] : null;
  const indices: number[] = [];

  for (let i = 0; i <= lengthSegments; i++) {
    const t = i / lengthSegments;
    let w = petalWidthProfile(shape, t) * width;
    if (edgeNoise > 0 && random) {
      w *= 1 + (random() - 0.5) * 2 * edgeNoise * Math.min(1, t * 2.2);
    }
    const curl = petalCurlProfile(shape, t) * length;
    const x = t * length;
    // Ondulación suave a lo largo del pétalo (independiente del ancho
    // de cada anillo): evita que la superficie sea un plano curvo
    // perfectamente liso.
    const rippleOffset = ripple ? Math.sin(t * Math.PI * 2.4) * ripple * length : 0;
    // Torsión acumulada desde la base (t=0, sin torsión) hasta la
    // punta: rota el perfil transversal (cuenco) alrededor del eje
    // largo del pétalo, como una leve hélice.
    const twistAngle = twist * t;
    const cosTw = twist ? Math.cos(twistAngle) : 1;
    const sinTw = twist ? Math.sin(twistAngle) : 0;

    let ringColor: THREE.Color | null = null;
    if (gradient) {
      ringColor = gradient.base.clone().lerp(gradient.tip, Math.pow(t, 0.65));
    }

    for (let j = 0; j <= widthSegments; j++) {
      const s = j / widthSegments - 0.5;
      const z0 = s * w;
      const y0 = curl - Math.abs(s) * w * cupAmount + rippleOffset;
      const y = twist ? y0 * cosTw - z0 * sinTw : y0;
      const z = twist ? y0 * sinTw + z0 * cosTw : z0;
      positions.push(x, y, z);

      if (colors && ringColor) {
        const shade = 1 - edgeShade * Math.pow(Math.min(1, Math.abs(s) * 2), 1.4);
        colors.push(ringColor.r * shade, ringColor.g * shade, ringColor.b * shade);
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
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  if (colors) {
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  }
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

/** Hornea dos atributos por vértice para el viento en el shader (ver
 * material en FlowerField.tsx): una fase propia (para que cada pieza —
 * tallo, pétalo, hoja — oscile de forma independiente y no como un
 * único objeto rígido) y un pequeño offset de rugosidad (para que el
 * material no se vea perfectamente uniforme en toda la flor). Ambos
 * son constantes dentro de una misma pieza: no hace falta variar
 * dentro del pétalo para que el efecto se note. */
function withMotion(
  geometry: THREE.BufferGeometry,
  windPhase: number,
  roughOffset: number
): THREE.BufferGeometry {
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute(
    "aWindPhase",
    new THREE.Float32BufferAttribute(new Float32Array(count).fill(windPhase), 1)
  );
  geometry.setAttribute(
    "aRoughOffset",
    new THREE.Float32BufferAttribute(new Float32Array(count).fill(roughOffset), 1)
  );
  return geometry;
}

/** Da una leve curva natural al tallo (no es un cilindro perfectamente
 * recto "clavado" en el suelo), doblándolo progresivamente hacia la
 * punta en una dirección aleatoria por flor. */
function bendStemGeometry(
  geometry: THREE.BufferGeometry,
  height: number,
  bendAmount: number,
  dirX: number,
  dirZ: number
) {
  const pos = geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / height, 0, 1);
    const bend = Math.pow(t, 1.7) * bendAmount;
    pos.setX(i, pos.getX(i) + dirX * bend);
    pos.setZ(i, pos.getZ(i) + dirZ * bend);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
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

/** Combina varias geometrías en una sola. Si una parte trae su propio
 * atributo de color (degradé/textura horneada), se respeta tal cual;
 * si no, se rellena con el color plano de esa parte (tallo, etc). */
function mergeParts(parts: MeshPart[]): THREE.BufferGeometry {
  let vertexCount = 0;
  const nonIndexed = parts.map((part) => {
    const geo = part.geometry.index
      ? part.geometry.toNonIndexed()
      : part.geometry;
    vertexCount += geo.getAttribute("position").count;
    return geo;
  });

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const windPhases = new Float32Array(vertexCount);
  const roughOffsets = new Float32Array(vertexCount);

  let offset = 0;
  nonIndexed.forEach((geo, i) => {
    const posAttr = geo.getAttribute("position");
    if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    const normAttr = geo.getAttribute("normal");
    const gradientColorAttr = geo.getAttribute("color");
    const phaseAttr = geo.getAttribute("aWindPhase");
    const roughAttr = geo.getAttribute("aRoughOffset");
    const flatColor = parts[i].color;

    positions.set(posAttr.array as Float32Array, offset * 3);
    normals.set(normAttr.array as Float32Array, offset * 3);
    if (phaseAttr) windPhases.set(phaseAttr.array as Float32Array, offset);
    if (roughAttr) roughOffsets.set(roughAttr.array as Float32Array, offset);

    if (gradientColorAttr) {
      colors.set(gradientColorAttr.array as Float32Array, offset * 3);
    } else {
      for (let v = 0; v < posAttr.count; v++) {
        colors[(offset + v) * 3] = flatColor.r;
        colors[(offset + v) * 3 + 1] = flatColor.g;
        colors[(offset + v) * 3 + 2] = flatColor.b;
      }
    }

    offset += posAttr.count;
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  merged.setAttribute("aWindPhase", new THREE.BufferAttribute(windPhases, 1));
  merged.setAttribute("aRoughOffset", new THREE.BufferAttribute(roughOffsets, 1));
  return merged;
}

const OPEN_ANGLE: Record<PetalShape, number> = {
  round: 0.48,
  pointed: 0.95,
  thin: 0.18,
  trumpet: 0.55,
  ruffled: 0.42,
  cluster: 0.3,
  fringed: 0.58,
  dome: 0.5,
};

const BASE_LENGTH: Record<PetalShape, number> = {
  round: 0.4,
  pointed: 0.56,
  thin: 0.5,
  trumpet: 0.42,
  ruffled: 0.44,
  cluster: 0.12,
  fringed: 0.36,
  dome: 0.11,
};

const BASE_WIDTH_RATIO: Record<PetalShape, number> = {
  round: 0.62,
  pointed: 0.36,
  thin: 0.22,
  trumpet: 0.6,
  ruffled: 0.58,
  cluster: 0.5,
  fringed: 0.68,
  dome: 0.85,
};

interface BuildOptions {
  detail: "field" | "showcase";
  /** 0 = capullo entreabierto, 1 = flor completamente abierta. */
  bloom?: number;
}

/** Matriz para colocar un pétalo: base desplazada `attachRadius` desde el
 * eje central, abierta `openAngle` radianes desde la horizontal y rotada
 * `placementAngle` alrededor del eje Y. */
function petalMatrix(
  attachRadius: number,
  openAngle: number,
  placementAngle: number,
  headY: number
) {
  const m = new THREE.Matrix4();
  const translateUp = new THREE.Matrix4().makeTranslation(0, headY, 0);
  const rotateY = new THREE.Matrix4().makeRotationY(placementAngle);
  const rotateZ = new THREE.Matrix4().makeRotationZ(openAngle);
  const translateOut = new THREE.Matrix4().makeTranslation(
    attachRadius,
    0,
    0
  );
  m.multiply(translateUp).multiply(rotateY).multiply(rotateZ).multiply(
    translateOut
  );
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
  // bloom 0 (capullo cerrado) → pétalos casi verticales, envolviendo el
  // centro, mucho más cortos; bloom 1 (abierta) → pétalos extendidos,
  // como una flor recién abierta. El rango es amplio para que un
  // capullo se lea realmente como capullo y no como "una flor un poco
  // menos abierta".
  const openAngle = OPEN_ANGLE[petalShape] * THREE.MathUtils.lerp(1.75, 0.86, bloom);
  const bloomLength = THREE.MathUtils.lerp(0.5, 1, bloom);
  const baseLength = BASE_LENGTH[petalShape] * scale * bloomLength;
  const baseWidth = baseLength * BASE_WIDTH_RATIO[petalShape];
  const edgeNoise = EDGE_NOISE[petalShape];

  const petalColorMain = new THREE.Color(visual.petalColor);
  const petalColorAlt = new THREE.Color(visual.petalColorAlt);
  const centerColorObj = new THREE.Color(visual.centerColor);
  const throatMain = throatTone(petalColorMain, centerColorObj);
  const throatAlt = throatTone(petalColorAlt, centerColorObj);

  // Altura entre capas: cada capa hacia adentro sube un poco (como
  // pétalos reales que se van cerrando hacia el centro).
  const heightStep = 0.026 * scale;
  let topLayerHeadY = headY;

  for (let layer = 0; layer < layers; layer++) {
    const layerShrink = 1 - layer * 0.22;
    const layerLength = baseLength * layerShrink;
    const layerWidth = baseWidth * layerShrink;
    const layerCount = Math.max(5, Math.round((petalCount / layers) * (1 - layer * 0.1)));
    // Las capas más internas (layer alto) nacen MÁS CERCA del eje, no
    // más lejos: así se anidan hacia el centro en vez de "flotar" hacia
    // afuera, dando la superposición y profundidad de una flor real de
    // varias capas (rosa, dalia, peonía).
    const attachRadius = Math.max(0.014 * scale, 0.052 * scale - layer * 0.013 * scale);
    const layerHeadY = headY + layer * heightStep;
    topLayerHeadY = layerHeadY;
    const rotationOffset = layer * (Math.PI / layerCount);
    const isAlt = layer % 2 === 1;
    const tipColor = isAlt ? petalColorAlt : petalColorMain;
    const baseColor = isAlt ? throatAlt : throatMain;

    for (let i = 0; i < layerCount; i++) {
      // Ángulo menos perfectamente regular: además del jitter angular,
      // el radio y la altura de cada pétalo también varían un poco, así
      // no quedan en un anillo geométricamente perfecto.
      const jitter = (random() - 0.5) * 0.18;
      const angle = (i / layerCount) * Math.PI * 2 + rotationOffset + jitter;
      const angleOpen = openAngle + (random() - 0.5) * 0.1;
      const lengthJitter = 0.86 + random() * 0.28;
      const widthJitter = 0.84 + random() * 0.32;
      const petalRadius = attachRadius * (0.9 + random() * 0.22);
      const petalHeadY = layerHeadY + (random() - 0.5) * heightStep * 0.7;
      // Curvatura (cuenco) propia por pétalo: algunos más planos, otros
      // más cóncavos, en vez de que todos compartan exactamente el
      // mismo perfil transversal.
      const cupAmount = CUP_AMOUNT[petalShape] * (0.78 + random() * 0.5);
      // Torsión y ondulación con signo e intensidad propios por pétalo:
      // ninguno se tuerce exactamente igual que el de al lado.
      const twist = TWIST_AMOUNT[petalShape] * (random() < 0.5 ? -1 : 1) * (0.6 + random() * 0.7);
      const ripple = RIPPLE_AMOUNT[petalShape] * (0.5 + random() * 0.9);
      const windPhase = random() * Math.PI * 2;
      const roughOffset = (random() - 0.5) * 0.18;

      // Cada pétalo se genera individualmente (no se clona el mismo
      // triángulo): tamaño y borde propios, para que ninguna flor sea
      // idéntica a la de al lado.
      const petalGeo = withMotion(
        createPetalGeometry(
          petalShape,
          layerLength * lengthJitter,
          layerWidth * widthJitter,
          segments.length,
          segments.width,
          { base: baseColor, tip: tipColor },
          { edgeNoise, cupAmount, twist, ripple, random }
        ),
        windPhase,
        roughOffset
      );

      const matrix = petalMatrix(petalRadius, angleOpen, angle, petalHeadY);
      parts.push({
        geometry: transformedClone(petalGeo, matrix),
        color: tipColor,
      });
    }
  }

  const centerScale = visual.centerScale ?? 1;
  if (centerScale > 0) {
    // En capullo el centro casi no se ve (los pétalos lo envuelven); al
    // abrirse se revela por completo.
    const centerVisibility = THREE.MathUtils.lerp(0.4, 1, bloom);
    const centerRadius = 0.07 * scale * (1 + layers * 0.08) * centerScale * centerVisibility;
    const centerSegs = segments.length >= 6 ? 12 : 8;
    const centerGeo = new THREE.SphereGeometry(
      centerRadius,
      centerSegs,
      Math.max(6, centerSegs - 4)
    );

    if (visual.centerShape === "disc") {
      // Centro tipo margarita/caléndula: un disco compacto de florecitas
      // apretadas, no una bocha redonda. Se achata la esfera y se le
      // agrega un leve relieve radial para sugerir textura granulada
      // en vez de una tapa perfectamente lisa.
      centerGeo.scale(1, 0.32, 1);
      const cPos = centerGeo.getAttribute("position");
      for (let i = 0; i < cPos.count; i++) {
        const cx = cPos.getX(i);
        const cy = cPos.getY(i);
        const cz = cPos.getZ(i);
        const r = Math.sqrt(cx * cx + cz * cz);
        const bump = (Math.sin(r * 70 + cx * 30) * 0.5 + 0.5) * 0.09 * centerRadius;
        cPos.setY(i, cy + bump);
      }
      cPos.needsUpdate = true;
      centerGeo.computeVertexNormals();
    }

    // Se ubica a la altura de la capa más interna (no siempre `headY`),
    // así queda anidado dentro del último anillo de pétalos en vez de
    // flotar separado por encima de ellos.
    centerGeo.translate(0, topLayerHeadY + 0.012 * scale, 0);
    applyCenterTexture(centerGeo, centerColorObj, 0.55, random);
    withMotion(centerGeo, (random() - 0.5) * 0.6, (random() - 0.5) * 0.1);
    parts.push({ geometry: centerGeo, color: centerColorObj });
  }

  buildStamens(visual, topLayerHeadY, random, parts);
}

function buildStamens(
  visual: FlowerVisual,
  headY: number,
  random: () => number,
  parts: MeshPart[]
) {
  const s = visual.stamens;
  if (!s) return;
  const filamentColor = new THREE.Color(s.filamentColor);
  const antherColor = new THREE.Color(s.antherColor);

  for (let i = 0; i < s.count; i++) {
    const angle = (i / s.count) * Math.PI * 2 + random() * 0.35;
    const length = s.length * visual.scale * (0.85 + random() * 0.3);
    const tilt = 0.3 + random() * 0.3;
    // Estambres delicados: cada uno oscila con su propia fase, muy
    // independiente del resto de la flor.
    const stamenPhase = random() * Math.PI * 2;

    const filamentGeo = new THREE.CylinderGeometry(
      0.004 * visual.scale,
      0.006 * visual.scale,
      length,
      5
    );
    filamentGeo.rotateZ(Math.PI / 2);
    filamentGeo.translate(length / 2, 0, 0);
    withMotion(filamentGeo, stamenPhase, (random() - 0.5) * 0.08);
    const matrix = petalMatrix(0.025 * visual.scale, tilt, angle, headY);
    parts.push({
      geometry: transformedClone(filamentGeo, matrix),
      color: filamentColor,
    });

    const antherGeo = new THREE.SphereGeometry(0.02 * visual.scale, 6, 5);
    antherGeo.translate(length, 0, 0);
    withMotion(antherGeo, stamenPhase, (random() - 0.5) * 0.08);
    parts.push({
      geometry: transformedClone(antherGeo, matrix),
      color: antherColor,
    });
  }

  // Pistilo central: una columna algo más gruesa que sube derecha por
  // el medio, con un pequeño bulbo en la punta. Detalle barato que
  // ancla visualmente el centro de flores con estambres (ej: lirio).
  const pistilLength = s.length * visual.scale * 1.08;
  const pistilGeo = new THREE.CylinderGeometry(
    0.007 * visual.scale,
    0.01 * visual.scale,
    pistilLength,
    6
  );
  pistilGeo.translate(0, pistilLength / 2, 0);
  pistilGeo.translate(0, headY, 0);
  withMotion(pistilGeo, (random() - 0.5) * 0.4, (random() - 0.5) * 0.06);
  parts.push({ geometry: pistilGeo, color: filamentColor });

  const pistilTipGeo = new THREE.SphereGeometry(0.014 * visual.scale, 6, 5);
  pistilTipGeo.translate(0, headY + pistilLength, 0);
  withMotion(pistilTipGeo, (random() - 0.5) * 0.4, (random() - 0.5) * 0.06);
  parts.push({ geometry: pistilTipGeo, color: antherColor });
}

function buildClusterHead(
  visual: FlowerVisual,
  random: () => number,
  headY: number,
  segments: { length: number; width: number },
  parts: MeshPart[],
  bloom: number
) {
  const { scale, petalCount } = visual;
  const spikeLength = scale * 0.55 * THREE.MathUtils.lerp(0.58, 1, bloom);
  const floretSteps = Math.max(6, Math.round(petalCount / 4));
  const petalColorMain = new THREE.Color(visual.petalColor);
  const petalColorAlt = new THREE.Color(visual.petalColorAlt);
  const centerColorObj = new THREE.Color(visual.centerColor);
  const throatMain = throatTone(petalColorMain, centerColorObj);
  const throatAlt = throatTone(petalColorAlt, centerColorObj);

  for (let k = 0; k < floretSteps; k++) {
    const t = k / (floretSteps - 1 || 1);
    const y = headY + t * spikeLength;
    const radius = (1 - t * 0.55) * 0.1 * scale;
    const subPetals = 5;
    const stagger = k * 0.7;
    for (let p = 0; p < subPetals; p++) {
      const angle = (p / subPetals) * Math.PI * 2 + stagger + random() * 0.2;
      const useAlt = p % 2 === 0;
      const sizeJitter = 0.82 + random() * 0.32;
      const twist = TWIST_AMOUNT.thin * (random() < 0.5 ? -1 : 1) * (0.6 + random() * 0.7);
      const ripple = RIPPLE_AMOUNT.thin * (0.5 + random() * 0.9);
      const floretGeo = withMotion(
        createPetalGeometry(
          "thin",
          0.1 * scale * sizeJitter,
          0.06 * scale * sizeJitter,
          Math.max(2, Math.floor(segments.length / 2)),
          Math.max(1, Math.floor(segments.width / 2)),
          { base: useAlt ? throatAlt : throatMain, tip: useAlt ? petalColorAlt : petalColorMain },
          { edgeNoise: 0.04, twist, ripple, random }
        ),
        random() * Math.PI * 2,
        (random() - 0.5) * 0.16
      );
      const matrix = petalMatrix(radius * 0.5, 0.75, angle, y);
      parts.push({
        geometry: transformedClone(floretGeo, matrix),
        color: useAlt ? petalColorAlt : petalColorMain,
      });
    }
  }

  const coreGeo = new THREE.CylinderGeometry(
    0.015 * scale,
    0.02 * scale,
    spikeLength,
    6
  );
  coreGeo.translate(0, headY + spikeLength / 2, 0);
  withMotion(coreGeo, 0, (random() - 0.5) * 0.06);
  parts.push({ geometry: coreGeo, color: centerColorObj });
}

/** Arreglo "domo": muchas florcitas de 4 pétalos cubriendo una
 * semiesfera (tipo hortensia/mophead), distribuidas con espiral
 * áurea para que no se amontonen en el centro ni en el borde. Cada
 * florcita tiene su propio tamaño y una mezcla de color levemente
 * distinta, para que la cabeza floral se lea como un ramillete real
 * de muchas flores pequeñas y no como una sola bocha uniforme. */
function buildDomeHead(
  visual: FlowerVisual,
  random: () => number,
  headY: number,
  segments: { length: number; width: number },
  parts: MeshPart[],
  bloom: number
) {
  const { scale, petalCount } = visual;
  const domeRadius = 0.34 * scale * THREE.MathUtils.lerp(0.6, 1, bloom);
  const floretSize = 0.1 * scale;
  const petalColorMain = new THREE.Color(visual.petalColor);
  const petalColorAlt = new THREE.Color(visual.petalColorAlt);
  const centerColorObj = new THREE.Color(visual.centerColor);
  const throatMain = throatTone(petalColorMain, centerColorObj);
  const throatAlt = throatTone(petalColorAlt, centerColorObj);
  const GOLDEN_ANGLE = 2.399963;

  const floretCount = Math.max(30, petalCount);
  for (let i = 0; i < floretCount; i++) {
    const u = (i + 0.5) / floretCount;
    const phi = Math.acos(1 - u); // 0 = polo superior, PI/2 = ecuador
    const theta = i * GOLDEN_ANGLE + random() * 0.15;

    const ringRadius = Math.sin(phi) * domeRadius;
    const y = headY + Math.cos(phi) * domeRadius * 0.9;
    const openAngle = 0.5 + phi * 0.3;
    const mixT = random();
    const useAlt = mixT < 0.35;
    const floretScale = 0.68 + random() * 0.58;

    const twist = TWIST_AMOUNT.round * (random() < 0.5 ? -1 : 1) * (0.6 + random() * 0.7);
    const ripple = RIPPLE_AMOUNT.round * (0.5 + random() * 0.9);
    const floretGeo = withMotion(
      createPetalGeometry(
        "round",
        floretSize * 0.9 * floretScale,
        floretSize * 0.9 * 0.9 * floretScale,
        Math.max(2, Math.floor(segments.length / 2)),
        Math.max(2, Math.floor(segments.width / 2)),
        { base: useAlt ? throatAlt : throatMain, tip: useAlt ? petalColorAlt : petalColorMain },
        { edgeNoise: 0.05, twist, ripple, random }
      ),
      random() * Math.PI * 2,
      (random() - 0.5) * 0.16
    );

    for (let p = 0; p < 4; p++) {
      const angle = theta + (p - 1.5) * 0.13;
      const matrix = petalMatrix(ringRadius, openAngle, angle, y);
      parts.push({
        geometry: transformedClone(floretGeo, matrix),
        color: useAlt ? petalColorAlt : petalColorMain,
      });
    }
  }
}

/** Pequeño "cáliz": un cono corto y apenas más ancho que la punta del
 * tallo, que hace de transición natural entre el tallo y la base de la
 * cabeza floral (en vez de que los pétalos salgan pegados directo a la
 * punta de un cilindro). Barato: un solo cono de pocos segmentos. */
function buildCalyx(
  visual: FlowerVisual,
  headY: number,
  random: () => number,
  parts: MeshPart[]
) {
  const scale = visual.scale;
  const calyxHeight = 0.055 * scale * (0.8 + random() * 0.4);
  const topRadius = 0.048 * scale * (0.9 + random() * 0.2);
  const bottomRadius = 0.02 * scale;
  const calyxGeo = new THREE.CylinderGeometry(topRadius, bottomRadius, calyxHeight, 6);
  calyxGeo.translate(0, calyxHeight / 2 - calyxHeight * 0.15, 0);
  // Un poco de solape con la base de los pétalos (en vez de terminar
  // justo debajo) para que no se lea como una pieza flotante separada.
  calyxGeo.translate(0, headY - calyxHeight * 0.55, 0);
  const calyxColor = new THREE.Color(visual.stemColor).lerp(new THREE.Color("#2f5c34"), 0.3);
  withMotion(calyxGeo, (random() - 0.5) * 0.5, (random() - 0.5) * 0.06);
  parts.push({ geometry: calyxGeo, color: calyxColor });
}

/**
 * Construye la geometría completa (tallo + hojas + cabeza floral) de
 * una especie, ya combinada en un único BufferGeometry con color por
 * vértice horneado. `seed` determina la variación (ángulos, jitter)
 * de forma determinística para que no cambie entre renders.
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
      ? { length: 9, width: 5 }
      : { length: 5, width: 3 };

  const parts: MeshPart[] = [];
  const stemColor = new THREE.Color(visual.stemColor);

  // --- Tallo, con una leve curva natural (no perfectamente recto) ---
  const stemGeo = new THREE.CylinderGeometry(
    0.018 * visual.scale,
    0.03 * visual.scale,
    visual.stemHeight,
    7
  );
  stemGeo.translate(0, visual.stemHeight / 2, 0);
  const bendAngle = random() * Math.PI * 2;
  bendStemGeometry(
    stemGeo,
    visual.stemHeight,
    0.04 * visual.stemHeight,
    Math.cos(bendAngle),
    Math.sin(bendAngle)
  );
  // Fase 0: el tallo es el "ancla" del viento, todo lo demás (pétalos,
  // hojas, centro) oscila con su propia fase relativa a él.
  withMotion(stemGeo, 0, (random() - 0.5) * 0.05);
  parts.push({ geometry: stemGeo, color: stemColor });

  // --- Hojas: cantidad, tamaño, ángulo y tono variables ---
  const leafCount = random() < 0.6 ? 2 : 3;
  for (let i = 0; i < leafCount; i++) {
    const heightRatio = 0.32 + (i / leafCount) * 0.5 + random() * 0.1;
    const side = i % 2 === 0 ? 1 : -1;
    const angle = side * (0.85 + random() * 0.4);
    const leafScale = 0.75 + random() * 0.5;
    const leafLight = stemColor
      .clone()
      .lerp(new THREE.Color(random() < 0.5 ? "#dff2c8" : "#6bd08a"), 0.16 + random() * 0.14);

    const leafTwist = TWIST_AMOUNT.pointed * (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.8);
    const leafRipple = RIPPLE_AMOUNT.pointed * (0.6 + random() * 0.8);
    const leafGeo = withMotion(
      createPetalGeometry(
        "pointed",
        0.22 * visual.scale * leafScale,
        0.09 * visual.scale * leafScale,
        3,
        2,
        { base: stemColor, tip: leafLight },
        { edgeNoise: 0.05, cupAmount: 0.1 + random() * 0.08, twist: leafTwist, ripple: leafRipple, random }
      ),
      random() * Math.PI * 2,
      (random() - 0.5) * 0.1
    );
    const matrix = petalMatrix(
      0.01 * visual.scale,
      -0.35 - random() * 0.15,
      angle,
      visual.stemHeight * Math.min(0.85, heightRatio)
    );
    parts.push({ geometry: transformedClone(leafGeo, matrix), color: stemColor });
  }

  buildCalyx(visual, visual.stemHeight, random, parts);

  if (visual.petalShape === "cluster") {
    buildClusterHead(visual, random, visual.stemHeight, segments, parts, bloom);
  } else if (visual.petalShape === "dome") {
    buildDomeHead(visual, random, visual.stemHeight, segments, parts, bloom);
  } else {
    buildDiscHead(visual, random, visual.stemHeight, segments, parts, bloom);
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
