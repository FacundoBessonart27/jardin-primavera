import * as THREE from "three";
import { createSeededRandom } from "@/lib/random";

/**
 * Geometría procedural de un cerezo (sakura), en tres piezas:
 *  - trunk: tronco y ramas (tubos cónicos que se curvan y se abren);
 *  - canopy: el volumen de las copas, hecho de varios bultos chicos e
 *    irregulares por racimo (no una esfera por racimo: así la silueta
 *    es despareja y entre bulto y bulto se ven las ramas);
 *  - cards: tarjetas con textura de flores en el borde de cada racimo,
 *    que le dan a la copa el contorno esponjoso y calado.
 *
 * Cada árbol usa su propia semilla (todos distintos, ninguno simétrico)
 * y tiene dos niveles de detalle: "near" para los cercanos y "far", con
 * menos bultos, tarjetas y ramas finas, para los lejanos.
 *
 * Las ramas principales se estiran más hacia +X local: al plantar el
 * árbol se lo gira para que ese lado mire al camino, y así las copas de
 * ambos lados se encuentran por encima formando un túnel.
 */

export interface GeometryArrays {
  positions: number[];
  normals: number[];
  colors: number[];
  uvs: number[];
  indices: number[];
}

export interface TreeGeometry {
  trunk: GeometryArrays;
  canopy: GeometryArrays;
  cards: GeometryArrays;
  /** Centros (locales) de los racimos: de ahí caen los pétalos. */
  clusters: THREE.Vector3[];
}

const BARK_DARK = new THREE.Color("#3b2a27");
const BARK_LIGHT = new THREE.Color("#6d5048");
// Multiplican la textura de flores: sombra suave abajo, luz arriba.
const BLOSSOM_SHADE = new THREE.Color("#c893a3");
const BLOSSOM_LIGHT = new THREE.Color("#ffffff");

const emptyArrays = (): GeometryArrays => ({ positions: [], normals: [], colors: [], uvs: [], indices: [] });

interface Branch {
  points: THREE.Vector3[];
  radii: number[];
}

function curve(a: THREE.Vector3, ctrl: THREE.Vector3, b: THREE.Vector3, steps: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push(
      new THREE.Vector3(
        u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x,
        u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y,
        u * u * a.z + 2 * u * t * ctrl.z + t * t * b.z
      )
    );
  }
  return pts;
}

const _up = new THREE.Vector3(0, 1, 0);
const _x = new THREE.Vector3(1, 0, 0);
const _tangent = new THREE.Vector3();
const _side = new THREE.Vector3();
const _binormal = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _color = new THREE.Color();

/** Tubo por una polilínea con radio variable (anillos de `radial` lados). */
function tube(branch: Branch, radial: number, out: GeometryArrays, random: () => number) {
  const base = out.positions.length / 3;
  const { points, radii } = branch;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const next = points[Math.min(points.length - 1, i + 1)];
    const prev = points[Math.max(0, i - 1)];
    _tangent.subVectors(next, prev).normalize();
    _side.crossVectors(_tangent, Math.abs(_tangent.y) > 0.95 ? _x : _up).normalize();
    _binormal.crossVectors(_side, _tangent).normalize();
    const shade = Math.min(1, p.y / 4.5) * 0.7 + random() * 0.2;
    _color.copy(BARK_DARK).lerp(BARK_LIGHT, shade);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      _normal.copy(_side).multiplyScalar(Math.cos(a)).addScaledVector(_binormal, Math.sin(a));
      // Corteza irregular: el radio varía un poco alrededor del anillo.
      const r = radii[i] * (0.9 + 0.2 * Math.sin(a * 3 + i * 1.7));
      out.positions.push(p.x + _normal.x * r, p.y + _normal.y * r, p.z + _normal.z * r);
      out.normals.push(_normal.x, _normal.y, _normal.z);
      out.colors.push(_color.r, _color.g, _color.b);
      out.uvs.push(0, 0);
    }
  }
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = base + i * radial + j;
      const b = base + i * radial + ((j + 1) % radial);
      const c = base + (i + 1) * radial + j;
      const d = base + (i + 1) * radial + ((j + 1) % radial);
      out.indices.push(a, c, b, b, c, d);
    }
  }
}

// Icosaedros base indexados: cada bulto de follaje es una versión
// deformada de uno de ellos. El de 42 vértices (80 caras) se usa para el
// bulto principal de los racimos cercanos, así de cerca no se ven facetas;
// el de 12 vértices (20 caras), para los bultos chicos y los árboles lejanos.
function indexedIcosahedron(detail: number) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.getAttribute("position");
  const verts: THREE.Vector3[] = [];
  const index: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    let k = verts.findIndex((w) => w.distanceToSquared(v) < 1e-6);
    if (k === -1) {
      k = verts.length;
      verts.push(v);
    }
    index.push(k);
  }
  g.dispose();
  return { verts, index };
}
const ICO_LOW = indexedIcosahedron(0);
const ICO_HIGH = indexedIcosahedron(1);

/** Un bulto de follaje: icosaedro deformado, achatado y girado al azar. */
function lump(
  center: THREE.Vector3,
  radius: number,
  clusterCenter: THREE.Vector3,
  tint: number,
  out: GeometryArrays,
  random: () => number,
  smooth = false
) {
  const ICO = smooth ? ICO_HIGH : ICO_LOW;
  const base = out.positions.length / 3;
  const sx = 0.9 + random() * 0.35;
  const sy = 0.62 + random() * 0.22;
  const sz = 0.9 + random() * 0.35;
  const rot = new THREE.Euler(random() * Math.PI, random() * Math.PI, random() * Math.PI);
  const q = new THREE.Quaternion().setFromEuler(rot);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const toCluster = new THREE.Vector3();
  for (const v of ICO.verts) {
    const jitter = smooth ? 0.88 + random() * 0.24 : 0.82 + random() * 0.32;
    p.copy(v).applyQuaternion(q).multiplyScalar(radius * jitter);
    p.set(p.x * sx, p.y * sy, p.z * sz).add(center);
    // Normal suave: mitad la del bulto, mitad "hacia afuera" del racimo,
    // así el conjunto se ilumina como un volumen de flores.
    n.copy(v).applyQuaternion(q);
    toCluster.subVectors(p, clusterCenter).normalize();
    n.lerp(toCluster, 0.55).normalize();
    out.positions.push(p.x, p.y, p.z);
    out.normals.push(n.x, n.y, n.z);
    const light = THREE.MathUtils.clamp(n.y * 0.5 + 0.55, 0, 1) * 0.85 + tint;
    _color.copy(BLOSSOM_SHADE).lerp(BLOSSOM_LIGHT, Math.min(1, light));
    out.colors.push(_color.r, _color.g, _color.b);
    // Proyección plana continua (sin costuras) sobre la textura repetible.
    out.uvs.push(p.x * 1.1 + p.z * 0.7, p.y * 1.1 + p.x * 0.4);
  }
  for (const k of ICO.index) out.indices.push(base + k);
}

const QUAD = [
  [-0.5, -0.5, 0, 0],
  [0.5, -0.5, 1, 0],
  [0.5, 0.5, 1, 1],
  [-0.5, 0.5, 0, 1],
];

function cardsAround(
  center: THREE.Vector3,
  radius: number,
  count: number,
  sizeBoost: number,
  out: GeometryArrays,
  random: () => number
) {
  const nrm = new THREE.Vector3();
  const axisU = new THREE.Vector3();
  const axisV = new THREE.Vector3();
  for (let k = 0; k < count; k++) {
    // Punto sobre la superficie (achatada) del racimo, más hacia los
    // costados y arriba (debajo casi no se ven).
    const u = random() * 1.6 - 0.6;
    const phi = random() * Math.PI * 2;
    const sq = Math.sqrt(Math.max(0, 1 - u * u));
    nrm.set(sq * Math.cos(phi), u * 0.8 + 0.1, sq * Math.sin(phi)).normalize();
    const dist = radius * (0.72 + random() * 0.34);
    const c = center.clone().addScaledVector(nrm, dist);
    c.y -= dist * nrm.y * 0.28;
    const size = (0.55 + random() * 0.3) * sizeBoost;
    axisU.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
    axisV.crossVectors(nrm, axisU).normalize();
    axisU.crossVectors(axisV, nrm).normalize();
    const base = out.positions.length / 3;
    const tone = 0.88 + random() * 0.14;
    for (const [a, b, uu, vv] of QUAD) {
      out.positions.push(
        c.x + (axisU.x * a + axisV.x * b) * size,
        c.y + (axisU.y * a + axisV.y * b) * size,
        c.z + (axisU.z * a + axisV.z * b) * size
      );
      // Normal "esférica" (hacia afuera del racimo).
      out.normals.push(nrm.x, nrm.y, nrm.z);
      out.colors.push(tone, tone * 0.97, tone);
      out.uvs.push(uu, vv);
    }
    out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/**
 * Un árbol completo. `detail` (0..1) sólo cambia cuánto cuesta el nivel
 * cercano; `lod` = "far" es la versión liviana para árboles lejanos. La
 * forma general (tronco, ramas, dónde están los racimos) es la misma en
 * ambos niveles, para que el cambio de detalle no se note.
 */
export function buildSakuraTree(seed: number, detail: number, lod: "near" | "far"): TreeGeometry {
  // Generadores separados: la estructura (ramas y racimos) sale idéntica
  // en los dos niveles de detalle aunque cada uno use distinta cantidad
  // de números al azar para la corteza o los bultos.
  const random = createSeededRandom(seed);
  const barkRandom = createSeededRandom(seed + 17);
  const leafRandom = createSeededRandom(seed + 31);
  const branches: Branch[] = [];
  const twigs: Branch[] = [];
  const clusters: { center: THREE.Vector3; radius: number }[] = [];

  // --- Tronco: un poco inclinado hacia +X, con una leve S. ---
  const height = 2.0 + random() * 0.55;
  const trunkTop = new THREE.Vector3(0.28 + random() * 0.2, height, (random() - 0.5) * 0.35);
  const trunkPts = curve(
    new THREE.Vector3(0, -0.1, 0),
    new THREE.Vector3(-0.15 + random() * 0.1, height * 0.55, (random() - 0.5) * 0.3),
    trunkTop,
    6
  );
  branches.push({
    points: trunkPts,
    radii: trunkPts.map((_, i) => 0.26 - (i / (trunkPts.length - 1)) * 0.11 + (i === 0 ? 0.06 : 0)),
  });

  // --- Ramas principales: 4 a 6, abiertas, más largas hacia +X. ---
  const limbCount = 4 + Math.floor(random() * 3);
  for (let l = 0; l < limbCount; l++) {
    // Ángulos repartidos alrededor pero con sesgo hacia +X (el camino).
    const base = (l / limbCount) * Math.PI * 2 - Math.PI * 0.35;
    const az = base * 0.85 + (random() - 0.5) * 0.5;
    const towardPath = Math.cos(az);
    const len = 1.5 + random() * 0.5 + Math.max(0, towardPath) * 1.0;
    const el = 0.42 + random() * 0.3 - Math.max(0, towardPath) * 0.08;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el));
    const start = trunkTop.clone().add(new THREE.Vector3(0, -0.1 - random() * 0.3, 0));
    const end = start.clone().addScaledVector(dir, len);
    end.y -= len * (0.08 + random() * 0.1); // la punta cae un poco
    const ctrl = start.clone().addScaledVector(dir, len * 0.5);
    ctrl.y += len * (0.2 + random() * 0.15);
    const pts = curve(start, ctrl, end, lod === "near" ? 5 : 3);
    branches.push({ points: pts, radii: pts.map((_, i) => 0.13 - (i / (pts.length - 1)) * 0.085) });
    clusters.push({ center: end.clone().add(new THREE.Vector3(0, 0.25, 0)), radius: 0.9 + random() * 0.35 });

    const mid = curve(start, ctrl, end, 5)[3];
    // Racimo intermedio (no en todas las ramas: la copa queda despareja).
    if (random() < 0.7 && (lod === "far" || detail >= 0.5)) {
      clusters.push({ center: mid.clone().add(new THREE.Vector3(0, 0.42, 0)), radius: 0.62 + random() * 0.25 });
    }

    // Ramas secundarias que abren la copa (1 o 2 por rama).
    const forks = random() < 0.5 ? [-0.75, 0.7] : [random() < 0.5 ? -0.7 : 0.7];
    for (const turn of forks) {
      const az2 = az + turn + (random() - 0.5) * 0.35;
      const el2 = el * 0.7 + 0.1;
      const d2 = new THREE.Vector3(Math.cos(az2) * Math.cos(el2), Math.sin(el2), -Math.sin(az2) * Math.cos(el2));
      const len2 = 0.8 + random() * 0.6;
      const e2 = mid.clone().addScaledVector(d2, len2);
      e2.y -= 0.1;
      const c2 = mid.clone().addScaledVector(d2, len2 * 0.5);
      c2.y += 0.2;
      const p2 = curve(mid, c2, e2, 3);
      twigs.push({ points: p2, radii: p2.map((_, i) => 0.06 - (i / (p2.length - 1)) * 0.035) });
      clusters.push({ center: e2.clone().add(new THREE.Vector3(0, 0.2, 0)), radius: 0.62 + random() * 0.3 });
    }
  }
  // Coronilla, corrida hacia el camino.
  clusters.push({ center: trunkTop.clone().add(new THREE.Vector3(0.3, 1.2 + random() * 0.3, 0)), radius: 1.0 });

  // --- Tronco + ramas ---
  const trunk = emptyArrays();
  branches.forEach((b, i) => tube(b, i === 0 ? (lod === "near" ? 8 : 6) : lod === "near" ? 6 : 5, trunk, barkRandom));
  // Las ramitas finas sólo se dibujan de cerca (de lejos las tapa la copa).
  if (lod === "near") twigs.forEach((b) => tube(b, 5, trunk, barkRandom));

  // --- Copas: varios bultos por racimo ---
  const canopy = emptyArrays();
  const cards = emptyArrays();
  const lumpsPerCluster = lod === "far" ? 2 : detail >= 0.8 ? 4 : 3;
  const cardsPerCluster = lod === "far" ? 2 : Math.max(5, Math.round(16 * detail));
  const sizeBoost = lod === "far" ? 1.5 : 1 + (1 - Math.min(1, detail)) * 0.35;
  const offset = new THREE.Vector3();
  for (const cl of clusters) {
    const tint = leafRandom() * 0.2;
    for (let k = 0; k < lumpsPerCluster; k++) {
      // El primer bulto va al centro; los demás, corridos a los costados y
      // arriba, más chicos: la silueta del racimo queda irregular.
      if (k === 0) offset.set(0, 0, 0);
      else {
        const a = leafRandom() * Math.PI * 2;
        offset.set(Math.cos(a) * cl.radius * 0.55, (leafRandom() - 0.2) * cl.radius * 0.4, Math.sin(a) * cl.radius * 0.55);
      }
      const r = cl.radius * (k === 0 ? (lod === "far" ? 0.75 : 0.62) : 0.42 + leafRandom() * 0.18);
      lump(cl.center.clone().add(offset), r, cl.center, tint, canopy, leafRandom, k === 0 && lod === "near");
    }
    cardsAround(cl.center, cl.radius, cardsPerCluster, sizeBoost, cards, leafRandom);
  }

  return { trunk, canopy, cards, clusters: clusters.map((c) => c.center) };
}
