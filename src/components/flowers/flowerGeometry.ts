import * as THREE from "three";
import type { FlowerVisual, PetalShape } from "@/data/flowers";
import { createSeededRandom } from "@/lib/random";

/**
 * ============================================================
 *  GENERADOR PROCEDURAL DE FLORES
 * ============================================================
 * En vez de cargar modelos 3D externos (pesados y con problemas
 * de licencia), cada especie se construye combinando geometría
 * simple de Three.js: pétalos (mallas curvas paramétricas),
 * un centro esférico, un tallo y un par de hojas. El resultado
 * se combina en UNA sola geometría por especie, lo que permite
 * dibujar cientos de flores con muy pocos draw calls usando
 * InstancedMesh (ver FlowerField.tsx).
 */

interface MeshPart {
  geometry: THREE.BufferGeometry;
  color: THREE.Color;
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
    default:
      return t * t * 0.3;
  }
}

/** Construye un único pétalo en espacio local: crece a lo largo de +X,
 * se curva hacia +Y y su ancho se extiende en Z. */
function createPetalGeometry(
  shape: PetalShape,
  length: number,
  width: number,
  lengthSegments: number,
  widthSegments: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= lengthSegments; i++) {
    const t = i / lengthSegments;
    const w = petalWidthProfile(shape, t) * width;
    const curl = petalCurlProfile(shape, t) * length;
    const x = t * length;
    for (let j = 0; j <= widthSegments; j++) {
      const s = j / widthSegments - 0.5;
      const z = s * w;
      const y = curl - Math.abs(s) * w * 0.18;
      positions.push(x, y, z);
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

/** Combina varias geometrías (con color por parte) en una sola,
 * horneando un atributo de color por vértice. */
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

  let offset = 0;
  nonIndexed.forEach((geo, i) => {
    const posAttr = geo.getAttribute("position");
    if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    const normAttr = geo.getAttribute("normal");
    const color = parts[i].color;

    positions.set(posAttr.array as Float32Array, offset * 3);
    normals.set(normAttr.array as Float32Array, offset * 3);

    for (let v = 0; v < posAttr.count; v++) {
      colors[(offset + v) * 3] = color.r;
      colors[(offset + v) * 3 + 1] = color.g;
      colors[(offset + v) * 3 + 2] = color.b;
    }

    offset += posAttr.count;
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return merged;
}

const OPEN_ANGLE: Record<PetalShape, number> = {
  round: 0.48,
  pointed: 0.95,
  thin: 0.18,
  trumpet: 0.55,
  ruffled: 0.42,
  cluster: 0.3,
};

const BASE_LENGTH: Record<PetalShape, number> = {
  round: 0.4,
  pointed: 0.56,
  thin: 0.5,
  trumpet: 0.42,
  ruffled: 0.44,
  cluster: 0.12,
};

const BASE_WIDTH_RATIO: Record<PetalShape, number> = {
  round: 0.62,
  pointed: 0.36,
  thin: 0.22,
  trumpet: 0.6,
  ruffled: 0.58,
  cluster: 0.5,
};

interface BuildOptions {
  detail: "field" | "showcase";
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

function buildDiscHead(
  visual: FlowerVisual,
  random: () => number,
  headY: number,
  segments: { length: number; width: number },
  parts: MeshPart[]
) {
  const { petalShape, petalCount, layers, scale } = visual;
  const openAngle = OPEN_ANGLE[petalShape];
  const baseLength = BASE_LENGTH[petalShape] * scale;
  const baseWidth = baseLength * BASE_WIDTH_RATIO[petalShape];

  const petalColorMain = new THREE.Color(visual.petalColor);
  const petalColorAlt = new THREE.Color(visual.petalColorAlt);

  for (let layer = 0; layer < layers; layer++) {
    const layerShrink = 1 - layer * 0.22;
    const layerLength = baseLength * layerShrink;
    const layerWidth = baseWidth * layerShrink;
    const layerCount = Math.max(5, Math.round((petalCount / layers) * (1 - layer * 0.1)));
    const attachRadius = 0.05 * scale + layer * 0.015 * scale;
    const layerHeadY = headY + layer * 0.025 * scale;
    const rotationOffset = layer * (Math.PI / layerCount);
    const color = layer % 2 === 0 ? petalColorMain : petalColorAlt;

    const petalGeo = createPetalGeometry(
      petalShape,
      layerLength,
      layerWidth,
      segments.length,
      segments.width
    );

    for (let i = 0; i < layerCount; i++) {
      const jitter = (random() - 0.5) * 0.1;
      const angle = (i / layerCount) * Math.PI * 2 + rotationOffset + jitter;
      const angleOpen = openAngle + (random() - 0.5) * 0.06;
      const matrix = petalMatrix(attachRadius, angleOpen, angle, layerHeadY);
      parts.push({
        geometry: transformedClone(petalGeo, matrix),
        color,
      });
    }
  }

  const centerRadius = 0.07 * scale * (1 + layers * 0.08);
  const centerSegs = segments.length >= 6 ? 12 : 8;
  const centerGeo = new THREE.SphereGeometry(
    centerRadius,
    centerSegs,
    Math.max(6, centerSegs - 4)
  );
  centerGeo.translate(0, headY + 0.01 * scale, 0);
  parts.push({ geometry: centerGeo, color: new THREE.Color(visual.centerColor) });
}

function buildClusterHead(
  visual: FlowerVisual,
  random: () => number,
  headY: number,
  segments: { length: number; width: number },
  parts: MeshPart[]
) {
  const { scale, petalCount } = visual;
  const spikeLength = scale * 0.55;
  const floretSteps = Math.max(6, Math.round(petalCount / 4));
  const petalColorMain = new THREE.Color(visual.petalColor);
  const petalColorAlt = new THREE.Color(visual.petalColorAlt);

  const floretGeo = createPetalGeometry(
    "thin",
    0.1 * scale,
    0.06 * scale,
    Math.max(2, Math.floor(segments.length / 2)),
    Math.max(1, Math.floor(segments.width / 2))
  );

  for (let k = 0; k < floretSteps; k++) {
    const t = k / (floretSteps - 1 || 1);
    const y = headY + t * spikeLength;
    const radius = (1 - t * 0.55) * 0.1 * scale;
    const subPetals = 5;
    const stagger = k * 0.7;
    for (let p = 0; p < subPetals; p++) {
      const angle = (p / subPetals) * Math.PI * 2 + stagger + random() * 0.2;
      const matrix = petalMatrix(radius * 0.5, 0.75, angle, y);
      parts.push({
        geometry: transformedClone(floretGeo, matrix),
        color: p % 2 === 0 ? petalColorMain : petalColorAlt,
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
  parts.push({ geometry: coreGeo, color: new THREE.Color(visual.centerColor) });
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
  const segments =
    options.detail === "showcase"
      ? { length: 8, width: 4 }
      : { length: 4, width: 2 };

  const parts: MeshPart[] = [];
  const stemColor = new THREE.Color(visual.stemColor);

  const stemGeo = new THREE.CylinderGeometry(
    0.018 * visual.scale,
    0.03 * visual.scale,
    visual.stemHeight,
    6
  );
  stemGeo.translate(0, visual.stemHeight / 2, 0);
  parts.push({ geometry: stemGeo, color: stemColor });

  const leafGeo = createPetalGeometry(
    "pointed",
    0.22 * visual.scale,
    0.09 * visual.scale,
    3,
    2
  );
  [0.42, 0.68].forEach((heightRatio, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const angle = side * (0.9 + random() * 0.3);
    const matrix = petalMatrix(
      0.01 * visual.scale,
      -0.35,
      angle,
      visual.stemHeight * heightRatio
    );
    parts.push({ geometry: transformedClone(leafGeo, matrix), color: stemColor });
  });

  if (visual.petalShape === "cluster") {
    buildClusterHead(visual, random, visual.stemHeight, segments, parts);
  } else {
    buildDiscHead(visual, random, visual.stemHeight, segments, parts);
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
