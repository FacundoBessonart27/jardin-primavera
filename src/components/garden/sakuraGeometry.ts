import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createSeededRandom } from "@/lib/random";

/**
 * Geometría procedural de un cerezo (sakura), en tres piezas que se
 * dibujan instanciadas:
 *  - trunk: tronco y ramas (tubos cónicos que se curvan y se abren);
 *  - blobs: el volumen de cada racimo de flores (esferas irregulares);
 *  - cards: tarjetas con textura de flores alrededor de cada racimo,
 *    que le dan a la copa el borde esponjoso y calado de un sakura.
 *
 * Las ramas principales se estiran más hacia +X local: al plantar el
 * árbol se lo gira para que ese lado mire al camino, y así las copas de
 * ambos lados se encuentran por encima formando un túnel.
 */

export interface SakuraVariant {
  trunk: THREE.BufferGeometry;
  blobs: THREE.BufferGeometry;
  cards: THREE.BufferGeometry;
  /** Centros (locales) de los racimos: de ahí caen los pétalos. */
  clusters: THREE.Vector3[];
}

const BARK_DARK = new THREE.Color("#3b2a27");
const BARK_LIGHT = new THREE.Color("#6d5048");
// Multiplican la textura de flores: sombra suave abajo, luz arriba.
const BLOSSOM_DEEP = new THREE.Color("#b98a98");
const BLOSSOM_LIGHT = new THREE.Color("#ffffff");

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

/** Tubo por una polilínea con radio variable (anillos de `radial` lados). */
function tube(
  branch: Branch,
  radial: number,
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  random: () => number
) {
  const base = positions.length / 3;
  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const color = new THREE.Color();
  const { points, radii } = branch;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const next = points[Math.min(points.length - 1, i + 1)];
    const prev = points[Math.max(0, i - 1)];
    tangent.subVectors(next, prev).normalize();
    side.crossVectors(tangent, Math.abs(tangent.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    binormal.crossVectors(side, tangent).normalize();
    const shade = Math.min(1, p.y / 4.5) * 0.7 + random() * 0.2;
    color.copy(BARK_DARK).lerp(BARK_LIGHT, shade);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      normal.copy(side).multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a));
      // Corteza irregular: el radio varía un poco alrededor del anillo.
      const r = radii[i] * (0.9 + 0.2 * Math.sin(a * 3 + i * 1.7));
      positions.push(p.x + normal.x * r, p.y + normal.y * r, p.z + normal.z * r);
      normals.push(normal.x, normal.y, normal.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = base + i * radial + j;
      const b = base + i * radial + ((j + 1) % radial);
      const c = base + (i + 1) * radial + j;
      const d = base + (i + 1) * radial + ((j + 1) % radial);
      indices.push(a, c, b, b, c, d);
    }
  }
}

function fromArrays(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[] | null,
  uvs?: number[]
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  if (uvs) geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  if (indices) geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

function buildVariant(seed: number, detail: number): SakuraVariant {
  const random = createSeededRandom(seed);
  const branches: Branch[] = [];
  const clusters: { center: THREE.Vector3; radius: number }[] = [];

  // --- Tronco: un poco inclinado hacia +X, con una leve S. ---
  const height = 2.1 + random() * 0.45;
  const trunkTop = new THREE.Vector3(0.32 + random() * 0.15, height, (random() - 0.5) * 0.3);
  const trunkPts = curve(
    new THREE.Vector3(0, -0.1, 0),
    new THREE.Vector3(-0.12, height * 0.55, (random() - 0.5) * 0.25),
    trunkTop,
    6
  );
  branches.push({
    points: trunkPts,
    radii: trunkPts.map((_, i) => 0.26 - (i / (trunkPts.length - 1)) * 0.11 + (i === 0 ? 0.06 : 0)),
  });

  // --- Ramas principales, abiertas y levemente colgantes en la punta. ---
  const limbs = [
    { az: -0.45 + (random() - 0.5) * 0.3, len: 2.6 + random() * 0.5, el: 0.42 },
    { az: 0.5 + (random() - 0.5) * 0.3, len: 2.5 + random() * 0.5, el: 0.46 },
    { az: 1.9 + (random() - 0.5) * 0.4, len: 1.8 + random() * 0.4, el: 0.62 },
    { az: -2.0 + (random() - 0.5) * 0.4, len: 1.8 + random() * 0.4, el: 0.6 },
    { az: Math.PI + (random() - 0.5) * 0.4, len: 1.5 + random() * 0.4, el: 0.75 },
  ];
  for (const limb of limbs) {
    const dir = new THREE.Vector3(
      Math.cos(limb.az) * Math.cos(limb.el),
      Math.sin(limb.el),
      -Math.sin(limb.az) * Math.cos(limb.el)
    );
    const start = trunkTop.clone().add(new THREE.Vector3(0, -0.15, 0));
    const end = start.clone().addScaledVector(dir, limb.len);
    end.y -= limb.len * 0.12; // la punta cae un poco
    const ctrl = start.clone().addScaledVector(dir, limb.len * 0.5);
    ctrl.y += limb.len * 0.28;
    const pts = curve(start, ctrl, end, 5);
    branches.push({ points: pts, radii: pts.map((_, i) => 0.13 - (i / (pts.length - 1)) * 0.085) });
    clusters.push({ center: end.clone().add(new THREE.Vector3(0, 0.28, 0)), radius: 0.95 + random() * 0.25 });
    // Un racimo intermedio sobre la rama (se omite en calidad reducida:
    // las tarjetas vecinas alcanzan para que la copa se vea llena).
    const midRadius = 0.75 + random() * 0.2;
    if (detail >= 1) {
      clusters.push({ center: pts[3].clone().add(new THREE.Vector3(0, 0.45, 0)), radius: midRadius });
    }

    // Ramas secundarias que abren la copa.
    for (const turn of [-0.7, 0.7]) {
      const from = pts[3];
      const az = limb.az + turn + (random() - 0.5) * 0.3;
      const el = limb.el * 0.7 + 0.1;
      const d2 = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el));
      const len = 0.9 + random() * 0.5;
      const e2 = from.clone().addScaledVector(d2, len);
      e2.y -= 0.12;
      const c2 = from.clone().addScaledVector(d2, len * 0.5);
      c2.y += 0.2;
      const p2 = curve(from, c2, e2, 3);
      branches.push({ points: p2, radii: p2.map((_, i) => 0.06 - (i / (p2.length - 1)) * 0.035) });
      clusters.push({ center: e2.clone().add(new THREE.Vector3(0, 0.22, 0)), radius: 0.7 + random() * 0.25 });
    }
  }
  // Coronilla.
  clusters.push({ center: trunkTop.clone().add(new THREE.Vector3(0.2, 1.3, 0)), radius: 1.05 });

  // --- Tronco + ramas en una sola geometría ---
  const tp: number[] = [];
  const tn: number[] = [];
  const tc: number[] = [];
  const ti: number[] = [];
  branches.forEach((b, i) => tube(b, i === 0 ? 8 : 6, tp, tn, tc, ti, random));
  const trunk = fromArrays(tp, tn, tc, ti);

  // --- Volumen de los racimos ---
  const bp: number[] = [];
  const bn: number[] = [];
  const bc: number[] = [];
  const bu: number[] = [];
  const color = new THREE.Color();
  for (const cl of clusters) {
    const ico = new THREE.IcosahedronGeometry(cl.radius * 0.7, 1);
    const pos = ico.getAttribute("position");
    const uv = ico.getAttribute("uv");
    const tint = random() * 0.25;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const n = new THREE.Vector3(x, y, z).normalize();
      const bump = 1 + 0.16 * Math.sin(x * 5.1 + z * 3.3 + seed) + 0.1 * Math.sin(y * 7.3 + x * 2.1);
      bp.push(cl.center.x + x * bump, cl.center.y + y * bump * 0.74, cl.center.z + z * bump);
      bn.push(n.x, n.y, n.z);
      bu.push(uv.getX(i) * 3, uv.getY(i) * 2);
      const light = Math.min(1, Math.max(0, n.y * 0.5 + 0.5)) * 0.8 + tint;
      color.copy(BLOSSOM_DEEP).lerp(BLOSSOM_LIGHT, Math.min(1, light));
      bc.push(color.r, color.g, color.b);
    }
    ico.dispose();
  }
  // Indexada: cada vértice compartido se procesa una sola vez (la
  // versión sin índice procesaba cada uno hasta seis veces, en el
  // render y otra vez en el pase de sombras).
  const blobs = mergeVertices(fromArrays(bp, bn, bc, null, bu), 1e-4);
  blobs.computeBoundingSphere();

  // --- Tarjetas de flores alrededor de cada racimo ---
  const cp: number[] = [];
  const cn: number[] = [];
  const cc: number[] = [];
  const cu: number[] = [];
  const ci: number[] = [];
  const perCluster = Math.max(6, Math.round(20 * detail));
  const quadCorner = [
    [-0.5, -0.5, 0, 0],
    [0.5, -0.5, 1, 0],
    [0.5, 0.5, 1, 1],
    [-0.5, 0.5, 0, 1],
  ];
  const axisU = new THREE.Vector3();
  const axisV = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  for (const cl of clusters) {
    for (let k = 0; k < perCluster; k++) {
      // Punto sobre la superficie (achatada) del racimo.
      const u = random() * 2 - 1;
      const phi = random() * Math.PI * 2;
      const sq = Math.sqrt(1 - u * u);
      nrm.set(sq * Math.cos(phi), u * 0.8 + 0.1, sq * Math.sin(phi)).normalize();
      const dist = cl.radius * (0.72 + random() * 0.32);
      const center = cl.center.clone().addScaledVector(nrm, dist);
      center.y -= dist * nrm.y * 0.26;
      // Con menos tarjetas (calidad reducida), cada una un poco más grande.
      const size = (0.55 + random() * 0.3) * (1 + (1 - Math.min(1, detail)) * 0.35);
      // Orientación al azar: desde cualquier ángulo se ven flores.
      axisU.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
      axisV.crossVectors(nrm, axisU).normalize();
      axisU.crossVectors(axisV, nrm).normalize();
      const base = cp.length / 3;
      const tone = 0.88 + random() * 0.14;
      for (const [a, b, uu, vv] of quadCorner) {
        cp.push(
          center.x + (axisU.x * a + axisV.x * b) * size,
          center.y + (axisU.y * a + axisV.y * b) * size,
          center.z + (axisU.z * a + axisV.z * b) * size
        );
        // Normal "esférica" (hacia afuera del racimo): la copa se ilumina
        // como un volumen y no como tarjetas planas sueltas.
        cn.push(nrm.x, nrm.y, nrm.z);
        cc.push(tone, tone * (0.96 + random() * 0.04), tone);
        cu.push(uu, vv);
      }
      ci.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const cards = fromArrays(cp, cn, cc, ci, cu);

  return { trunk, blobs, cards, clusters: clusters.map((c) => c.center) };
}

const cache = new Map<string, SakuraVariant>();

export const SAKURA_VARIANT_COUNT = 3;

export function getSakuraVariant(index: number, detail: number): SakuraVariant {
  const key = `${index}-${detail}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const variant = buildVariant(9001 + index * 7919, detail);
  cache.set(key, variant);
  return variant;
}
