"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { PLAZA_LEVEL, PLINTH_TOP, heightAt } from "@/lib/terrain";
import { PLAZA, SHRINE, TORII } from "@/lib/gardenPlan";
import { MeshBuilder, createGlowLambert } from "@/lib/meshBuilder";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createShojiTexture } from "@/lib/gardenTextures";
import { WARM_LIGHT, type GlowSpec, type LightPool } from "./GardenProps";

const VERMILION = "#c9462c";
const DARK_WOOD = "#3e2a21";
const WOOD = "#5c3c2a";
const PLASTER = "#efe3cf";
const STONE = "#a39b8f";
const STONE_LIGHT = "#b8b0a3";

/**
 * Techo japonés curvo (a cuatro aguas, con aleros que se levantan en las
 * esquinas): una grilla cuyo perfil es cóncavo (empinado cerca de la
 * cumbrera, casi plano en el alero), más la cara inferior de madera y el
 * canto dorado del alero.
 */
function addCurvedRoof(
  b: MeshBuilder,
  cx: number,
  cz: number,
  yBase: number,
  W: number,
  D: number,
  ridgeHalf: number,
  H: number
) {
  const nx = 36;
  const nz = 28;
  const hx = W / 2;
  const hz = D / 2;
  const thickness = 0.17;
  const heightAtRoof = (x: number, z: number) => {
    const dz = 1 - Math.abs(z) / hz;
    const dx = Math.min(1, Math.max(0, (hx - Math.abs(x)) / (hx - ridgeHalf)));
    const t = Math.max(0, Math.min(dz, dx));
    const corner = (1 - Math.min(1, dz * 2.4)) * (1 - Math.min(1, dx * 2.4));
    const eaveCurve =
      0.14 * Math.pow(Math.abs(x) / hx, 4) * (1 - Math.min(1, dz * 3)) +
      0.14 * Math.pow(Math.abs(z) / hz, 4) * (1 - Math.min(1, dx * 3));
    return yBase + H * Math.pow(t, 1.7) + 0.34 * Math.pow(corner, 1.5) + eaveCurve;
  };

  const top: number[] = [];
  const bottom: number[] = [];
  const topColors: number[] = [];
  const tileA = new THREE.Color("#3b404d");
  const tileB = new THREE.Color("#4a505e");
  const eave = new THREE.Color("#5d6272");
  const under = new THREE.Color("#5b3b2a");
  const c = new THREE.Color();
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = -hx + (i / nx) * W;
      const z = -hz + (j / nz) * D;
      const y = heightAtRoof(x, z);
      top.push(cx + x, y, cz + z);
      bottom.push(cx + x * 0.985, y - thickness, cz + z * 0.985);
      const dz = 1 - Math.abs(z) / hz;
      const dx = Math.min(1, Math.max(0, (hx - Math.abs(x)) / (hx - ridgeHalf)));
      c.copy(i % 2 === 0 ? tileA : tileB);
      if (Math.min(dz, dx) < 0.06) c.copy(eave);
      topColors.push(c.r, c.g, c.b);
    }
  }
  const idx = (i: number, j: number) => j * (nx + 1) + i;
  const topIdx: number[] = [];
  const botIdx: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = idx(i, j);
      const b2 = idx(i + 1, j);
      const c2 = idx(i, j + 1);
      const d = idx(i + 1, j + 1);
      topIdx.push(a, c2, b2, b2, c2, d);
      botIdx.push(a, b2, c2, b2, d, c2);
    }
  }
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute("position", new THREE.Float32BufferAttribute(top, 3));
  topGeo.setAttribute("color", new THREE.Float32BufferAttribute(topColors, 3));
  topGeo.setIndex(topIdx);
  topGeo.computeVertexNormals();
  b.addWithColors(topGeo);

  const botGeo = new THREE.BufferGeometry();
  botGeo.setAttribute("position", new THREE.Float32BufferAttribute(bottom, 3));
  botGeo.setIndex(botIdx);
  botGeo.computeVertexNormals();
  b.add(botGeo, under);

  // Canto del alero (une la cara superior con la inferior en el borde).
  const rim: number[] = [];
  const border: [number, number][] = [];
  for (let i = 0; i < nx; i++) border.push([i, 0]);
  for (let j = 0; j < nz; j++) border.push([nx, j]);
  for (let i = nx; i > 0; i--) border.push([i, nz]);
  for (let j = nz; j > 0; j--) border.push([0, j]);
  for (let k = 0; k < border.length; k++) {
    const [i0, j0] = border[k];
    const [i1, j1] = border[(k + 1) % border.length];
    const a = idx(i0, j0) * 3;
    const b2 = idx(i1, j1) * 3;
    const ta = [top[a], top[a + 1], top[a + 2]];
    const tb = [top[b2], top[b2 + 1], top[b2 + 2]];
    const ba = [bottom[a], bottom[a + 1], bottom[a + 2]];
    const bb = [bottom[b2], bottom[b2 + 1], bottom[b2 + 2]];
    rim.push(...ta, ...ba, ...tb, ...tb, ...ba, ...bb);
  }
  const rimGeo = new THREE.BufferGeometry();
  rimGeo.setAttribute("position", new THREE.Float32BufferAttribute(rim, 3));
  rimGeo.computeVertexNormals();
  b.add(rimGeo, "#c9ad73");

  // Cumbrera con remates.
  const ridgeY = yBase + H + 0.1;
  b.box(ridgeHalf * 2 + 0.5, 0.24, 0.32, cx, ridgeY, cz, "#2b2e37");
  for (const s of [-1, 1]) {
    b.box(0.22, 0.42, 0.34, cx + s * (ridgeHalf + 0.3), ridgeY + 0.14, cz, "#2b2e37", 0, 0, s * 0.35);
  }
}

function buildShrineBody(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const yP = PLAZA_LEVEL;
  const y0 = PLINTH_TOP;
  const front = SHRINE.z + SHRINE.plinthD / 2;

  // Zócalo de piedra con su coronamiento.
  b.box(SHRINE.plinthW, SHRINE.plinthH + 0.12, SHRINE.plinthD, SHRINE.x, yP + (SHRINE.plinthH - 0.12) / 2, SHRINE.z, STONE);
  b.box(SHRINE.plinthW + 0.2, 0.08, SHRINE.plinthD + 0.2, SHRINE.x, y0 - 0.04, SHRINE.z, STONE_LIGHT);
  // Escalinata.
  const steps = 3;
  const run = SHRINE.stepsDepth / steps;
  for (let i = 0; i < steps; i++) {
    const topY = yP + (SHRINE.plinthH / steps) * (i + 1);
    // El escalón más bajo es el más largo; cada uno apoya contra el zócalo.
    const depth = (steps - i) * run;
    b.box(SHRINE.stepsW, topY - yP + 0.06, depth, SHRINE.x, (topY + yP - 0.06) / 2, front + depth / 2, i % 2 ? STONE : STONE_LIGHT);
  }

  // Salón.
  const hz = SHRINE.hallZ;
  const hw = SHRINE.hallW / 2;
  const hd = SHRINE.hallD / 2;
  b.box(SHRINE.hallW + 0.5, 0.14, SHRINE.hallD + 0.5, SHRINE.x, y0 + 0.07, hz, WOOD);
  const pillarX = [-hw, -hw / 3, hw / 3, hw];
  for (const x of pillarX) {
    for (const z of [hz - hd, hz + hd]) b.cylinder(0.12, 0.13, 2.32, x, y0 + 0.14, z, VERMILION, 10);
  }
  for (const x of [-hw, hw]) b.cylinder(0.12, 0.13, 2.32, x, y0 + 0.14, hz, VERMILION, 10);
  // Paredes de revoque (fondo y costados) con zócalo de madera.
  b.box(SHRINE.hallW - 0.1, 2.0, 0.08, SHRINE.x, y0 + 1.16, hz - hd + 0.02, PLASTER);
  for (const x of [-hw + 0.03, hw - 0.03]) b.box(0.08, 2.0, SHRINE.hallD - 0.1, x, y0 + 1.16, hz, PLASTER);
  // Vigas: solera, nuki y dintel superior alrededor del salón.
  for (const [y, h, col] of [
    [y0 + 0.24, 0.12, VERMILION],
    [y0 + 2.06, 0.16, VERMILION],
    [y0 + 2.34, 0.14, VERMILION],
  ] as [number, number, string][]) {
    b.box(SHRINE.hallW + 0.2, h, 0.16, SHRINE.x, y, hz + hd, col);
    b.box(SHRINE.hallW + 0.2, h, 0.16, SHRINE.x, y, hz - hd, col);
    b.box(0.16, h, SHRINE.hallD + 0.2, -hw, y, hz, col);
    b.box(0.16, h, SHRINE.hallD + 0.2, hw, y, hz, col);
  }
  // Ménsulas (bloque oscuro donde apoya el techo).
  b.box(SHRINE.hallW + 0.6, 0.2, SHRINE.hallD + 0.6, SHRINE.x, y0 + 2.5, hz, DARK_WOOD);

  addCurvedRoof(b, SHRINE.x, hz, y0 + 2.58, 7.9, 6.5, 1.75, 1.8);

  // Caja de ofrendas y campana con su cuerda.
  b.box(0.95, 0.46, 0.46, SHRINE.x, y0 + 0.37, hz + hd + 0.65, DARK_WOOD);
  for (let i = 0; i < 5; i++) b.box(0.9, 0.03, 0.05, SHRINE.x, y0 + 0.61, hz + hd + 0.47 + i * 0.09, WOOD);
  b.sphere(0.15, SHRINE.x, y0 + 2.0, hz + hd + 0.35, "#d8b053");
  b.cylinder(0.035, 0.035, 1.05, SHRINE.x, y0 + 0.9, hz + hd + 0.35, "#d7503f", 6);

  // Shimenawa: cuerda sagrada de paja colgando bajo el alero, con shide
  // (tiras de papel blanco en zigzag).
  const ropeZ = hz + hd + 0.12;
  const segments = 14;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const x0 = -2.2 + t0 * 4.4;
    const x1 = -2.2 + t1 * 4.4;
    const y0r = y0 + 2.0 - Math.sin(Math.PI * t0) * 0.22;
    const y1r = y0 + 2.0 - Math.sin(Math.PI * t1) * 0.22;
    const len = Math.hypot(x1 - x0, y1r - y0r);
    b.box(len + 0.02, 0.13, 0.13, (x0 + x1) / 2, (y0r + y1r) / 2, ropeZ, "#d6c283", 0, 0, Math.atan2(y1r - y0r, x1 - x0));
  }
  for (const x of [-1.4, -0.45, 0.45, 1.4]) {
    const yTop = y0 + 2.0 - Math.sin(Math.PI * ((x + 2.2) / 4.4)) * 0.22 - 0.08;
    for (let k = 0; k < 3; k++) {
      b.box(0.1, 0.13, 0.015, x + (k % 2 ? 0.05 : -0.05), yTop - 0.1 - k * 0.12, ropeZ + 0.02, "#fbf8f0");
    }
  }

  // Tapas negras de los faroles de papel (chōchin).
  for (const s of [-1, 1]) {
    const x = s * 2.05;
    b.cylinder(0.12, 0.12, 0.06, x, y0 + 1.98, hz + hd + 0.3, "#1f1a18", 10);
    b.cylinder(0.12, 0.12, 0.06, x, y0 + 1.38, hz + hd + 0.3, "#1f1a18", 10);
    b.cylinder(0.012, 0.012, 0.3, x, y0 + 2.04, hz + hd + 0.3, "#1f1a18", 4);
    // El farol de papel en sí: brilla con luz propia (ver createGlowLambert).
    b.add(
      new THREE.SphereGeometry(0.2, 10, 8),
      "#ffffff",
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y0 + 1.68, hz + hd + 0.3),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1.45, 1)
      ),
      1
    );
  }
  return b.build();
}


function buildShojiPanels(): THREE.BufferGeometry {
  const panels: THREE.BufferGeometry[] = [];
  const hw = SHRINE.hallW / 2;
  const z = SHRINE.hallZ + SHRINE.hallD / 2 + 0.005;
  const width = (SHRINE.hallW - 0.3) / 3;
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(width - 0.12, 1.72);
    g.translate(-hw + 0.15 + width * (i + 0.5), PLINTH_TOP + 1.16, z);
    panels.push(g);
  }
  // Los costados también dejan pasar la luz.
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(SHRINE.hallD - 1.2, 1.2);
    g.rotateY(s * Math.PI / 2);
    g.translate(s * (hw + 0.005), PLINTH_TOP + 1.2, SHRINE.hallZ + 0.4);
    panels.push(g);
  }
  const merged = new THREE.BufferGeometry();
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  for (const p of panels) {
    const np = p.toNonIndexed();
    pos.push(...(np.getAttribute("position").array as Float32Array));
    uv.push(...(np.getAttribute("uv").array as Float32Array));
    nrm.push(...(np.getAttribute("normal").array as Float32Array));
  }
  merged.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  merged.computeBoundingSphere();
  return merged;
}

/** Torii bermellón sobre el camino, antes de la plaza: el umbral que
 * anuncia la llegada al santuario. Geometría local (X a lo ancho del
 * camino, Z a lo largo). */
function buildTorii(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const span = TORII.halfSpan;
  for (const s of [-1, 1]) {
    b.cylinder(0.15, 0.18, 3.4, s * span, 0, 0, VERMILION, 12);
    b.cylinder(0.21, 0.22, 0.34, s * span, -0.04, 0, "#1d1717", 12);
  }
  b.box(span * 2 + 0.9, 0.2, 0.16, 0, 2.62, 0, VERMILION);
  b.box(0.2, 0.5, 0.14, 0, 2.97, 0, VERMILION);
  b.box(0.52, 0.64, 0.07, 0, 2.97, 0.1, "#231918");
  b.box(0.42, 0.52, 0.02, 0, 2.97, 0.14, "#caa14a");
  b.box(span * 2 + 1.3, 0.2, 0.3, 0, 3.3, 0, VERMILION);
  // Kasagi: la viga superior negra, curvada hacia arriba en las puntas.
  const kasagi = new THREE.BoxGeometry(span * 2 + 2.2, 0.24, 0.42, 24, 1, 1);
  const pos = kasagi.getAttribute("position");
  const half = span + 1.1;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const k = Math.pow(Math.abs(x) / half, 2.4);
    pos.setY(i, pos.getY(i) + k * 0.3 + (pos.getY(i) > 0 ? k * 0.05 : 0));
  }
  kasagi.computeVertexNormals();
  b.add(kasagi, "#241c1c", new THREE.Matrix4().makeTranslation(0, 3.54, 0));
  return b.build();
}

/** Halos (faroles de papel y shoji) y charcos de luz del santuario. */
export function shrineLights(): { glows: GlowSpec[]; pools: LightPool[] } {
  const y0 = PLINTH_TOP;
  const front = SHRINE.hallZ + SHRINE.hallD / 2;
  const paper = new THREE.Color("#ff9a5c");
  return {
    glows: [
      ...[-2.05, 2.05].map((x) => ({ x, y: y0 + 1.68, z: front + 0.3, size: 1.3, color: paper, opacity: 0.85 })),
      ...[-1.75, 0, 1.75].map((x) => ({ x, y: y0 + 1.15, z: front + 0.2, size: 2.8, color: WARM_LIGHT, opacity: 0.38 })),
    ],
    pools: [
      { x: SHRINE.x, z: SHRINE.z + SHRINE.plinthD / 2 + 0.9, radius: 3.6, strength: 0.9 },
      { x: PLAZA.x, z: PLAZA.z - 1.5, radius: 5, strength: 0.45 },
    ],
  };
}

/**
 * Santuario al final del camino: zócalo de piedra con escalinata, salón
 * de madera bermellón con shoji iluminados desde adentro, techo curvo de
 * tejas, shimenawa, campana y faroles de papel. Más el torii del
 * acceso. Todo junto son 5 mallas (piedra/madera/techo, shoji, faroles
 * de papel, torii) y ninguna luz real: el brillo cálido son materiales
 * emisivos, halos y charcos de luz.
 */
export function Shrine({ shadows }: { shadows: boolean }) {
  // El torii (ya ubicado en su lugar) va unido al cuerpo del santuario:
  // mismo material, un draw call menos.
  const body = useMemo(() => {
    const torii = buildTorii();
    torii.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(TORII.x, heightAt(TORII.x, TORII.z) - 0.05, TORII.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(TORII.dx, TORII.dz)),
        new THREE.Vector3(1, 1, 1)
      )
    );
    const merged = mergeGeometries([buildShrineBody(), torii], false)!;
    merged.computeBoundingSphere();
    return merged;
  }, []);
  const shoji = useMemo(() => buildShojiPanels(), []);
  const materials = useMemo(() => {
    const shojiTex = createShojiTexture();
    return {
      // Los faroles de papel van dentro del cuerpo, con brillo propio.
      body: createGlowLambert(new THREE.Color("#ff7a45").multiplyScalar(1.4), { side: THREE.DoubleSide }),
      shoji: new THREE.MeshLambertMaterial({
        map: shojiTex,
        emissive: new THREE.Color("#ffae5c"),
        emissiveMap: shojiTex,
        emissiveIntensity: 0.95,
        side: THREE.DoubleSide,
      }),
    };
  }, []);

  return (
    <group>
      <mesh geometry={body} material={materials.body} castShadow={shadows} receiveShadow />
      <mesh geometry={shoji} material={materials.shoji} />
    </group>
  );
}
