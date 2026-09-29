/**
 * Plano del jardín: la "arquitectura de paisaje" de toda la escena, en
 * un solo lugar y sin depender de Three.js ni de React.
 *
 * El recorrido va de sur a norte:
 *   entrada (z ≈ +10) → canteros de bienvenida → bifurcación en dos
 *   lazos (este / oeste) con sectores de una especie dominante → túnel
 *   de sakura → puente sobre el arroyo → torii → plaza con el círculo
 *   de flores (y la flor especial) → santuario al fondo (z ≈ -53).
 *
 * Todo lo demás lee de acá: el relieve (terrain.ts), el suelo y los
 * caminos, la distribución de flores, árboles, faroles, bancos, el
 * agua y las colisiones del jugador. Las funciones de consulta
 * (distancia a caminos, a agua, obstáculos) están pensadas para
 * llamarse miles de veces al construir la escena y unas pocas por
 * frame al caminar.
 */

export interface Vec2 {
  x: number;
  z: number;
}

// ---------------------------------------------------------------------
// Curvas
// ---------------------------------------------------------------------

/** Catmull-Rom uniforme por los puntos de control, remuestreada a
 * distancia constante (para que las cintas y la colocación a lo largo
 * del camino tengan un paso parejo). */
function smoothPolyline(control: Vec2[], spacing: number): Vec2[] {
  const dense: Vec2[] = [];
  const n = control.length;
  const at = (i: number): Vec2 => {
    if (i < 0) {
      const a = control[0];
      const b = control[1];
      return { x: 2 * a.x - b.x, z: 2 * a.z - b.z };
    }
    if (i >= n) {
      const a = control[n - 1];
      const b = control[n - 2];
      return { x: 2 * a.x - b.x, z: 2 * a.z - b.z };
    }
    return control[i];
  };
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const steps = 28;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      dense.push({
        x:
          0.5 *
          (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z:
          0.5 *
          (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
            (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      });
    }
  }
  dense.push(control[n - 1]);

  const out: Vec2[] = [dense[0]];
  let carried = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i];
    let segLen = Math.hypot(b.x - a.x, b.z - a.z);
    let startX = a.x;
    let startZ = a.z;
    while (carried + segLen >= spacing) {
      const need = spacing - carried;
      const k = need / segLen;
      startX += (b.x - startX) * k;
      startZ += (b.z - startZ) * k;
      out.push({ x: startX, z: startZ });
      segLen -= need;
      carried = 0;
    }
    carried += segLen;
  }
  const last = dense[dense.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.z - tail.z) > spacing * 0.3) out.push(last);
  return out;
}

export interface GardenPath {
  id: string;
  kind: "main" | "secondary";
  halfWidth: number;
  points: Vec2[];
  /** Distancia acumulada a lo largo del camino en cada punto. */
  lengths: number[];
  length: number;
}

function makePath(
  id: string,
  kind: GardenPath["kind"],
  halfWidth: number,
  control: Vec2[]
): GardenPath {
  const points = smoothPolyline(control, 0.4);
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(
      lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
    );
  }
  return { id, kind, halfWidth, points, lengths, length: lengths[lengths.length - 1] };
}

const v = (x: number, z: number): Vec2 => ({ x, z });

// Puntos del camino principal (los secundarios nacen y mueren en ellos).
const MAIN_CONTROL = [
  v(0, 14),
  v(0.2, 7),
  v(-1.6, 0),
  v(-3.0, -7),
  v(-1.6, -14),
  v(1.8, -20),
  v(2.8, -26),
  v(1.4, -31.5),
  v(0, -36),
  v(0, -40),
];

export const PATHS: GardenPath[] = [
  makePath("main", "main", 1.05, MAIN_CONTROL),
  makePath("east-loop", "secondary", 0.72, [
    MAIN_CONTROL[1],
    v(5.5, 5),
    v(10, 0),
    v(11, -7.5),
    v(8, -14),
    v(4.8, -18.2),
    MAIN_CONTROL[5],
  ]),
  makePath("west-loop", "secondary", 0.72, [
    MAIN_CONTROL[2],
    v(-6.5, 1.5),
    v(-11.5, -3.5),
    v(-12.5, -11.5),
    v(-9, -18),
    v(-4.5, -21),
    MAIN_CONTROL[5],
  ]),
  makePath("pond-walk", "secondary", 0.62, [
    MAIN_CONTROL[7],
    v(-1.8, -34.5),
    v(-4.2, -38),
    v(-4.9, -41.5),
    v(-4.2, -43.6),
  ]),
  makePath("east-walk", "secondary", 0.62, [
    MAIN_CONTROL[8],
    v(3.6, -37.8),
    v(6.2, -40.6),
    v(6.1, -43.2),
    v(4.3, -44.4),
  ]),
];

export const MAIN_PATH = PATHS[0];

/** Punto y dirección (normalizada) del camino a una distancia `s`. */
export function samplePath(path: GardenPath, s: number): { x: number; z: number; tx: number; tz: number } {
  const clamped = Math.max(0, Math.min(path.length, s));
  let lo = 0;
  let hi = path.lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path.lengths[mid] <= clamped) lo = mid;
    else hi = mid;
  }
  const a = path.points[lo];
  const b = path.points[hi];
  const segLen = path.lengths[hi] - path.lengths[lo] || 1;
  const k = (clamped - path.lengths[lo]) / segLen;
  const tx = (b.x - a.x) / segLen;
  const tz = (b.z - a.z) / segLen;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, tx, tz };
}

// ---------------------------------------------------------------------
// Distancia a caminos (grilla de segmentos para consultas rápidas)
// ---------------------------------------------------------------------

interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  hw: number;
  main: boolean;
}

const GRID_CELL = 4;
const GRID_MIN_X = -44;
const GRID_MIN_Z = -84;
const GRID_COLS = 22;
const GRID_ROWS = 34;
/** Más allá de esta distancia al borde del camino, las consultas
 * devuelven un valor grande (nadie necesita más precisión). */
const PATH_QUERY_RANGE = 4.5;

let segmentGrid: Segment[][] | null = null;

function buildSegmentGrid(): Segment[][] {
  const grid: Segment[][] = Array.from({ length: GRID_COLS * GRID_ROWS }, () => []);
  for (const path of PATHS) {
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1];
      const b = path.points[i];
      const seg: Segment = {
        ax: a.x,
        az: a.z,
        bx: b.x,
        bz: b.z,
        hw: path.halfWidth,
        main: path.kind === "main",
      };
      const pad = path.halfWidth + PATH_QUERY_RANGE;
      const c0 = Math.floor((Math.min(a.x, b.x) - pad - GRID_MIN_X) / GRID_CELL);
      const c1 = Math.floor((Math.max(a.x, b.x) + pad - GRID_MIN_X) / GRID_CELL);
      const r0 = Math.floor((Math.min(a.z, b.z) - pad - GRID_MIN_Z) / GRID_CELL);
      const r1 = Math.floor((Math.max(a.z, b.z) + pad - GRID_MIN_Z) / GRID_CELL);
      for (let r = Math.max(0, r0); r <= Math.min(GRID_ROWS - 1, r1); r++) {
        for (let c = Math.max(0, c0); c <= Math.min(GRID_COLS - 1, c1); c++) {
          grid[r * GRID_COLS + c].push(seg);
        }
      }
    }
  }
  return grid;
}

function segDistance(px: number, pz: number, s: Segment): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len2 = dx * dx + dz * dz || 1e-6;
  let t = ((px - s.ax) * dx + (pz - s.az) * dz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = s.ax + dx * t - px;
  const cz = s.az + dz * t - pz;
  return Math.sqrt(cx * cx + cz * cz);
}

export interface PathQuery {
  /** Distancia al borde del camino más cercano (negativa = adentro). */
  edge: number;
  /** Distancia al eje de ese camino. */
  center: number;
  halfWidth: number;
  main: boolean;
}

const _query: PathQuery = { edge: 99, center: 99, halfWidth: 1, main: false };

/** Consulta el camino más cercano a (x, z). Devuelve un objeto
 * reutilizado: copiar los valores si hace falta guardarlos. */
export function queryPaths(x: number, z: number): PathQuery {
  if (!segmentGrid) segmentGrid = buildSegmentGrid();
  _query.edge = 99;
  _query.center = 99;
  const c = Math.floor((x - GRID_MIN_X) / GRID_CELL);
  const r = Math.floor((z - GRID_MIN_Z) / GRID_CELL);
  if (c < 0 || r < 0 || c >= GRID_COLS || r >= GRID_ROWS) return _query;
  const cell = segmentGrid[r * GRID_COLS + c];
  for (let i = 0; i < cell.length; i++) {
    const s = cell[i];
    const d = segDistance(x, z, s);
    const edge = d - s.hw;
    if (edge < _query.edge) {
      _query.edge = edge;
      _query.center = d;
      _query.halfWidth = s.hw;
      _query.main = s.main;
    }
  }
  return _query;
}

export function pathEdgeDistance(x: number, z: number): number {
  return queryPaths(x, z).edge;
}

// ---------------------------------------------------------------------
// Límite del jardín
// ---------------------------------------------------------------------

export const BOUNDARY = { cx: 0, cz: -22, rx: 24, rz: 36.5 };
/** Hasta dónde puede caminar el jugador (en radios normalizados). */
export const WALK_LIMIT = 0.955;

/** Radio normalizado respecto de la elipse del jardín (1 = borde). */
export function boundaryRadius(x: number, z: number): number {
  const nx = (x - BOUNDARY.cx) / BOUNDARY.rx;
  const nz = (z - BOUNDARY.cz) / BOUNDARY.rz;
  return Math.sqrt(nx * nx + nz * nz);
}

// ---------------------------------------------------------------------
// Agua: estanque + arroyo
// ---------------------------------------------------------------------

export const POND = { x: -10.3, z: -44.6, rx: 3.5, rz: 2.7, rot: 0.25 };

/** Distancia normalizada al estanque (1 ≈ la orilla), con una orilla
 * levemente irregular. */
export function pondRadius(x: number, z: number): number {
  const dx = x - POND.x;
  const dz = z - POND.z;
  const c = Math.cos(POND.rot);
  const s = Math.sin(POND.rot);
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  const a = Math.atan2(lz, lx);
  const wobble = 1 + 0.07 * Math.sin(a * 3 + 0.8) + 0.05 * Math.sin(a * 5 + 2.1);
  return Math.sqrt((lx / POND.rx) ** 2 + (lz / POND.rz) ** 2) / wobble;
}

export const STREAM = makePath("stream", "secondary", 1.0, [
  v(-10.2, -41.2),
  v(-9.2, -37.5),
  v(-6.5, -33.4),
  v(-2.5, -30.8),
  v(2.5, -29.6),
  v(7, -30.2),
  v(11.5, -31),
  v(16, -28.6),
  v(21.5, -24.5),
  v(27, -21.5),
]);

let streamBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;

/** Distancia al eje del arroyo (valor grande si está lejos). */
export function streamDistance(x: number, z: number): number {
  if (!streamBounds) {
    streamBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const p of STREAM.points) {
      streamBounds.minX = Math.min(streamBounds.minX, p.x);
      streamBounds.maxX = Math.max(streamBounds.maxX, p.x);
      streamBounds.minZ = Math.min(streamBounds.minZ, p.z);
      streamBounds.maxZ = Math.max(streamBounds.maxZ, p.z);
    }
  }
  const b = streamBounds;
  if (x < b.minX - 3 || x > b.maxX + 3 || z < b.minZ - 3 || z > b.maxZ + 3) return 99;
  let best = 99;
  const pts = STREAM.points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const c = pts[i];
    // Descarte barato por caja antes de calcular la distancia exacta.
    if (
      x < Math.min(a.x, c.x) - 3 ||
      x > Math.max(a.x, c.x) + 3 ||
      z < Math.min(a.z, c.z) - 3 ||
      z > Math.max(a.z, c.z) + 3
    ) {
      continue;
    }
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const len2 = dx * dx + dz * dz || 1e-6;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
    if (d < best) best = d;
  }
  return best;
}

/** Puente: donde el camino principal cruza el arroyo. */
export const BRIDGE = (() => {
  let best = { s: 0, d: Infinity };
  for (let i = 0; i < MAIN_PATH.points.length; i++) {
    const p = MAIN_PATH.points[i];
    const d = streamDistance(p.x, p.z);
    if (d < best.d) best = { s: MAIN_PATH.lengths[i], d };
  }
  const c = samplePath(MAIN_PATH, best.s);
  return {
    x: c.x,
    z: c.z,
    /** Dirección del puente (la del camino en el cruce). */
    dx: c.tx,
    dz: c.tz,
    s: best.s,
    halfLength: 2.7,
    halfWidth: 0.9,
    arch: 0.42,
  };
})();

/** Coordenadas locales del puente: `u` a lo largo, `w` a lo ancho. */
export function bridgeLocal(x: number, z: number): { u: number; w: number } {
  const rx = x - BRIDGE.x;
  const rz = z - BRIDGE.z;
  return { u: rx * BRIDGE.dx + rz * BRIDGE.dz, w: -rx * BRIDGE.dz + rz * BRIDGE.dx };
}

export function isOnBridge(x: number, z: number): boolean {
  const { u, w } = bridgeLocal(x, z);
  return Math.abs(u) <= BRIDGE.halfLength && Math.abs(w) <= BRIDGE.halfWidth - 0.12;
}

/** true si (x, z) es agua donde no se puede caminar. */
export function isWater(x: number, z: number): boolean {
  if (pondRadius(x, z) < 1.12) return true;
  return streamDistance(x, z) < 1.2;
}

// ---------------------------------------------------------------------
// Plaza final y santuario
// ---------------------------------------------------------------------

export const PLAZA = { x: 0, z: -44, radius: 4.6, bedRadius: 1.85 };

export const SHRINE = {
  x: 0,
  z: -52.6,
  /** Zócalo de piedra. */
  plinthW: 8.4,
  plinthD: 6.2,
  plinthH: 0.72,
  /** Escalinata en la cara sur. */
  stepsW: 3.2,
  stepsDepth: 1.15,
  /** Edificio sobre el zócalo. */
  hallX: 0,
  hallZ: -53.2,
  hallW: 5.4,
  hallD: 3.9,
};

/** Posición del torii (sobre el camino principal, antes de la plaza). */
export const TORII = (() => {
  let s = MAIN_PATH.length - 3.2;
  for (let i = 0; i < MAIN_PATH.points.length; i++) {
    if (MAIN_PATH.points[i].z <= -37.3) {
      s = MAIN_PATH.lengths[i];
      break;
    }
  }
  const p = samplePath(MAIN_PATH, s);
  return { x: p.x, z: p.z, dx: p.tx, dz: p.tz, s, halfSpan: 1.7 };
})();

// ---------------------------------------------------------------------
// Canteros (sectores con una especie dominante)
// ---------------------------------------------------------------------

export interface FlowerBed {
  id: string;
  /** Especie dominante. */
  species: string;
  /** Especies que acompañan en menor proporción. */
  companions: string[];
  x: number;
  z: number;
  rx: number;
  rz: number;
  rot: number;
  /** 0..1: qué tan tupido es el cantero (los prados son ralos). */
  density: number;
  /** Fase propia para la silueta irregular del borde. */
  seed: number;
}

const bed = (
  id: string,
  species: string,
  companions: string[],
  x: number,
  z: number,
  rx: number,
  rz: number,
  rot: number,
  density: number
): FlowerBed => ({ id, species, companions, x, z, rx, rz, rot, density, seed: id.length * 1.37 + x * 0.21 });

export const FLOWER_BEDS: FlowerBed[] = [
  // Bienvenida
  bed("tulipanes", "tulipan", ["jacinto"], -4.6, 7.2, 3.0, 2.2, 0.3, 1),
  bed("prado-margaritas", "margarita", ["jazmin", "calendula"], 4.6, 9.4, 3.4, 2.4, -0.2, 0.5),
  bed("rosas", "rosa", ["clavel"], 4.4, 1.2, 2.6, 1.8, 0.6, 1),
  bed("prado-oeste", "margarita", ["cosmos"], -12, 3.6, 3.4, 2.4, 0.4, 0.42),
  // Lazos
  bed("lavanda", "lavanda", [], -6.8, -3.2, 4.2, 1.4, 0.9, 1),
  bed("girasoles", "girasol", ["calendula"], 15.2, -5.5, 3.0, 2.4, 0.2, 0.85),
  bed("hibiscos", "hibisco", ["dalia"], 6.2, -8.2, 2.6, 2.2, 0, 0.95),
  bed("peonias", "peonia", ["rosa"], -7.4, -10.8, 2.6, 2.3, 0.4, 1),
  bed("orquideas", "orquidea", ["jazmin"], -16.4, -12, 2.4, 2.0, 0.3, 0.9),
  bed("dalias", "dalia", ["hibisco"], 1.9, -11.4, 2.1, 1.6, 0.2, 0.9),
  bed("cosmos", "cosmos", ["margarita"], 15.4, -15, 3.2, 2.6, 0.5, 0.65),
  // Túnel de sakura y centro
  bed("cerezos-oeste", "cerezo", ["jazmin"], -3.4, -18.6, 2.2, 1.3, 0.5, 0.8),
  bed("cerezos-este", "cerezo", ["margarita"], 5.6, -24.2, 2.0, 1.4, -0.3, 0.8),
  bed("claveles", "clavel", ["rosa"], -9.2, -25.5, 2.8, 2.2, -0.3, 1),
  bed("lirios", "lirio", ["jazmin"], 9.6, -23.6, 2.8, 2.1, 0.2, 0.95),
  bed("hortensias", "hortensia", [], -16, -28, 3.0, 2.4, 0, 0.95),
  bed("jacintos", "jacinto", ["tulipan"], -4.6, -26.2, 2.0, 1.6, 0.4, 0.9),
  // Más allá del arroyo
  bed("calendulas", "calendula", ["cosmos"], 13.6, -37.5, 3.0, 2.4, 0.3, 0.8),
  bed("jazmines", "jazmin", ["cerezo"], -6.4, -50.8, 2.2, 1.6, 0.2, 0.9),
  bed("rosas-santuario", "rosa", ["peonia"], 6.6, -51.8, 2.2, 1.6, -0.2, 0.9),
];

/** Distancia normalizada al cantero (1 ≈ borde), con silueta orgánica. */
export function bedRadius(b: FlowerBed, x: number, z: number): number {
  const dx = x - b.x;
  const dz = z - b.z;
  // Descarte rápido antes de la cuenta completa.
  const reach = Math.max(b.rx, b.rz) * 1.5;
  if (dx > reach || dx < -reach || dz > reach || dz < -reach) return 9;
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  const a = Math.atan2(lz, lx);
  const wobble =
    1 + 0.13 * Math.sin(a * 2 + b.seed) + 0.08 * Math.sin(a * 3 + b.seed * 2.3) + 0.05 * Math.sin(a * 5 + b.seed * 0.7);
  return Math.sqrt((lx / b.rx) ** 2 + (lz / b.rz) ** 2) / wobble;
}

/** El cantero que contiene a (x, z), si hay alguno. */
export function bedAt(x: number, z: number): { bed: FlowerBed; r: number } | null {
  let best: { bed: FlowerBed; r: number } | null = null;
  for (const b of FLOWER_BEDS) {
    const r = bedRadius(b, x, z);
    if (r < 1 && (!best || r < best.r)) best = { bed: b, r };
  }
  return best;
}

/** 0..1: cuánto de "tierra de cantero" hay en (x, z) (borde suave). */
export function bedMask(x: number, z: number): number {
  let m = 0;
  for (const b of FLOWER_BEDS) {
    const r = bedRadius(b, x, z);
    if (r < 1.25) m = Math.max(m, 1 - smooth(0.75, 1.2, r));
  }
  return m;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------
// Árboles de sakura, faroles, bancos y piedras
// ---------------------------------------------------------------------

export interface TreePlacement {
  x: number;
  z: number;
  yaw: number;
  scale: number;
  variant: number;
  lean: number;
}

export interface PropPlacement {
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function isClearForProp(x: number, z: number, pathMargin: number): boolean {
  if (boundaryRadius(x, z) > 0.94) return false;
  if (pathEdgeDistance(x, z) < pathMargin) return false;
  if (pondRadius(x, z) < 1.45) return false;
  if (streamDistance(x, z) < 2.3) return false;
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.radius + 0.9) return false;
  if (
    Math.abs(x - SHRINE.x) < SHRINE.plinthW / 2 + 1.2 &&
    Math.abs(z - SHRINE.z) < SHRINE.plinthD / 2 + 1.2
  ) {
    return false;
  }
  return true;
}

function sideOffset(path: GardenPath, s: number, side: number, offset: number) {
  const p = samplePath(path, s);
  // Normal hacia la izquierda del recorrido (side = 1) o derecha (-1).
  const nx = -p.tz * side;
  const nz = p.tx * side;
  return { x: p.x + nx * offset, z: p.z + nz * offset, nx, nz };
}

/** Rotación Y que apunta el +X local hacia la dirección (dx, dz). */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

export const LANTERNS: PropPlacement[] = (() => {
  const list: PropPlacement[] = [];
  const onPath = (path: GardenPath, s: number, side: number, extra = 0.75) => {
    const p = sideOffset(path, s, side, path.halfWidth + extra);
    if (list.some((l) => Math.hypot(l.x - p.x, l.z - p.z) < 1.2)) return;
    if (pathEdgeDistance(p.x, p.z) < 0.3) return;
    list.push({ x: p.x, z: p.z, yaw: yawToward(-p.nx, -p.nz), scale: 1 });
  };
  // Entrada
  onPath(MAIN_PATH, 5.5, 1);
  onPath(MAIN_PATH, 5.5, -1);
  // A lo largo del camino principal
  onPath(MAIN_PATH, 16.5, -1);
  onPath(MAIN_PATH, 27.5, 1, 0.55);
  // A cada lado del puente, en las orillas
  onPath(MAIN_PATH, BRIDGE.s - BRIDGE.halfLength - 0.7, 1, 0.45);
  onPath(MAIN_PATH, BRIDGE.s + BRIDGE.halfLength + 0.7, -1, 0.45);
  // Junto al torii
  onPath(MAIN_PATH, TORII.s - 1.9, 1, 0.8);
  onPath(MAIN_PATH, TORII.s - 1.9, -1, 0.8);
  // Lazos secundarios
  onPath(PATHS[1], PATHS[1].length * 0.45, 1);
  onPath(PATHS[2], PATHS[2].length * 0.45, -1);
  // Plaza: cuatro faroles alrededor y un par al pie de la escalinata.
  for (const a of [0.62, 2.52, 3.76, 5.66]) {
    const x = PLAZA.x + Math.cos(a) * (PLAZA.radius + 0.65);
    const z = PLAZA.z + Math.sin(a) * (PLAZA.radius + 0.65);
    if (pathEdgeDistance(x, z) < 0.3) continue;
    list.push({ x, z, yaw: 0, scale: 1 });
  }
  list.push({ x: SHRINE.x - SHRINE.stepsW / 2 - 0.9, z: SHRINE.z + SHRINE.plinthD / 2 + 0.75, yaw: 0, scale: 1.1 });
  list.push({ x: SHRINE.x + SHRINE.stepsW / 2 + 0.9, z: SHRINE.z + SHRINE.plinthD / 2 + 0.75, yaw: 0, scale: 1.1 });
  return list;
})();

export const BENCHES: PropPlacement[] = (() => {
  const list: PropPlacement[] = [];
  const facingPath = (path: GardenPath, s: number, side: number) => {
    const p = sideOffset(path, s, side, path.halfWidth + 0.85);
    // El frente del banco (+Z local) mira hacia el camino.
    list.push({ x: p.x, z: p.z, yaw: Math.atan2(-p.nx, -p.nz), scale: 1 });
  };
  facingPath(PATHS[1], PATHS[1].length * 0.36, -1);
  facingPath(PATHS[2], PATHS[2].length * 0.6, 1);
  facingPath(MAIN_PATH, 20.5, 1);
  // Mirador del estanque, mirando al agua.
  {
    const x = -6.2;
    const z = -41.9;
    list.push({ x, z, yaw: Math.atan2(POND.x - x, POND.z - z), scale: 1 });
  }
  // Plaza: dos bancos mirando al círculo de flores.
  for (const a of [Math.PI * 0.28, Math.PI * 0.72]) {
    const x = PLAZA.x + Math.cos(a) * (PLAZA.radius - 0.55);
    const z = PLAZA.z + Math.sin(a) * (PLAZA.radius - 0.55);
    list.push({ x, z, yaw: Math.atan2(PLAZA.x - x, PLAZA.z - z), scale: 1 });
  }
  return list;
})();

export const SAKURA_TREES: TreePlacement[] = (() => {
  const trees: TreePlacement[] = [];
  const add = (x: number, z: number, yaw: number, scale: number, lean: number) => {
    // Nunca dos troncos pegados.
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.9)) return;
    if ([...LANTERNS, ...BENCHES].some((p) => Math.hypot(p.x - x, p.z - z) < 1.7)) return;
    trees.push({ x, z, yaw, scale, variant: trees.length % 3, lean });
  };
  const alongPath = (
    path: GardenPath,
    from: number,
    to: number,
    step: number,
    offset: number,
    sides: number[],
    scale: [number, number],
    lean: number
  ) => {
    let k = 0;
    for (let s = from; s <= to; s += step, k++) {
      for (const side of sides) {
        const jitter = (hash(s * 3.1 + side * 7.7) - 0.5) * step * 0.35;
        const off = offset + hash(s * 1.7 + side) * 0.5;
        const p = sideOffset(path, s + jitter + (side > 0 ? 0 : step * 0.5), side, off);
        if (!isClearForProp(p.x, p.z, 0.9)) continue;
        if (Math.abs(s - BRIDGE.s) < 4.2) continue;
        if (Math.abs(s - TORII.s) < 2.4 && path === MAIN_PATH) continue;
        const sc = scale[0] + hash(s * 5.3 + side * 2.1) * (scale[1] - scale[0]);
        // El +X del árbol (hacia donde se estira su copa) mira al camino.
        add(p.x, p.z, yawToward(-p.nx, -p.nz), sc, lean);
      }
    }
  };

  // Dos árboles que enmarcan la entrada.
  alongPath(MAIN_PATH, 2.6, 2.6, 1, 3.3, [1, -1], [1.0, 1.08], 0.06);
  // Tramo inicial: árboles sueltos que guían la vista hacia adelante.
  alongPath(MAIN_PATH, 9, 24, 5.2, 3.9, [1, -1], [0.9, 1.05], 0.05);
  // Túnel de sakura: de ambos lados, cerca, inclinados hacia el camino.
  alongPath(MAIN_PATH, 29, BRIDGE.s - 4.1, 2.2, 2.6, [1, -1], [1.0, 1.16], 0.11);
  // Tramo final hacia el torii (segundo túnel, más corto).
  alongPath(MAIN_PATH, BRIDGE.s + 4.8, TORII.s - 1.4, 2.2, 2.9, [1, -1], [1.02, 1.12], 0.1);
  // Algunos sobre los lazos secundarios.
  alongPath(PATHS[1], 6, PATHS[1].length - 6, 7.5, 3.2, [1], [0.85, 1.0], 0.05);
  alongPath(PATHS[2], 6, PATHS[2].length - 6, 7.5, 3.2, [-1], [0.85, 1.0], 0.05);

  // Alrededor del santuario: el "árbol madre", más grande, y compañeros.
  const explicit: [number, number, number][] = [
    [8.4, -48.9, 1.5],
    [-7.8, -53.6, 1.18],
    [7.6, -55.4, 1.05],
    [-4.8, -56.6, 0.95],
    [4.9, -57, 0.92],
    [-13.6, -48.4, 1.0],
    [-14.2, -40.8, 0.95],
    [9.8, -39.4, 1.0],
  ];
  for (const [x, z, s] of explicit) {
    add(x, z, yawToward(PLAZA.x - x, PLAZA.z - z), s, 0.05);
  }
  return trees;
})();

export const ROCKS: PropPlacement[] = (() => {
  const list: PropPlacement[] = [];
  let n = 0;
  const add = (x: number, z: number, scale: number) => {
    list.push({ x, z, yaw: hash(n * 3.3) * Math.PI * 2, scale });
    n++;
  };
  // Orilla del estanque
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + hash(i) * 0.3;
    const r = 1.12 + hash(i * 1.9) * 0.18;
    const c = Math.cos(POND.rot);
    const s = Math.sin(POND.rot);
    const lx = Math.cos(a) * POND.rx * r;
    const lz = Math.sin(a) * POND.rz * r;
    const x = POND.x + lx * c - lz * s;
    const z = POND.z + lx * s + lz * c;
    if (Math.hypot(x - -6.2, z - -41.9) < 1.3) continue;
    add(x, z, 0.9 + hash(i * 2.7) * 1.4);
  }
  // Orillas del arroyo (salteando el puente)
  for (let s = 2; s < STREAM.length - 2; s += 2.6) {
    const p = samplePath(STREAM, s);
    const side = hash(s) > 0.5 ? 1 : -1;
    const x = p.x - p.tz * side * 1.55;
    const z = p.z + p.tx * side * 1.55;
    if (Math.hypot(x - BRIDGE.x, z - BRIDGE.z) < 3.4) continue;
    if (boundaryRadius(x, z) > 0.97) continue;
    add(x, z, 0.7 + hash(s * 1.3) * 1.1);
  }
  // Pequeños grupos junto a bancos y faroles de los lazos
  for (const b of BENCHES.slice(0, 3)) {
    add(b.x + Math.cos(b.yaw) * 1.3, b.z - Math.sin(b.yaw) * 1.3, 1.3);
    add(b.x - Math.cos(b.yaw) * 1.25, b.z + Math.sin(b.yaw) * 1.25, 0.9);
  }
  // Junto al santuario
  add(SHRINE.x - SHRINE.plinthW / 2 - 0.7, SHRINE.z + 1.6, 1.8);
  add(SHRINE.x + SHRINE.plinthW / 2 + 0.8, SHRINE.z - 0.4, 1.6);
  add(SHRINE.x - 3.8, SHRINE.z - SHRINE.plinthD / 2 - 0.9, 1.4);
  return list;
})();

// ---------------------------------------------------------------------
// Colisiones del jugador
// ---------------------------------------------------------------------

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

export const PLAYER_RADIUS = 0.28;

export const OBSTACLES: Obstacle[] = (() => {
  const list: Obstacle[] = [];
  for (const t of SAKURA_TREES) list.push({ x: t.x, z: t.z, r: 0.3 * t.scale });
  for (const l of LANTERNS) list.push({ x: l.x, z: l.z, r: 0.34 });
  for (const b of BENCHES) {
    // El banco (1.6 m) se aproxima con tres círculos a lo largo.
    const ax = Math.cos(b.yaw);
    const az = -Math.sin(b.yaw);
    for (const k of [-0.55, 0, 0.55]) list.push({ x: b.x + ax * k, z: b.z + az * k, r: 0.32 });
  }
  for (const r of ROCKS) if (r.scale > 1.1) list.push({ x: r.x, z: r.z, r: 0.22 * r.scale });
  // Pilares del torii
  const nx = -TORII.dz;
  const nz = TORII.dx;
  for (const side of [-1, 1]) {
    list.push({ x: TORII.x + nx * TORII.halfSpan * side, z: TORII.z + nz * TORII.halfSpan * side, r: 0.28 });
  }
  return list;
})();

/** true si el jugador no puede estar parado en (x, z). */
export function isBlocked(x: number, z: number): boolean {
  if (boundaryRadius(x, z) > WALK_LIMIT) return true;
  if (isWater(x, z) && !isOnBridge(x, z)) return true;
  // Barandas del puente: no se puede salir por los costados.
  {
    const { u, w } = bridgeLocal(x, z);
    if (Math.abs(u) < BRIDGE.halfLength - 0.2 && Math.abs(w) > BRIDGE.halfWidth - 0.12 && Math.abs(w) < BRIDGE.halfWidth + 0.35) {
      return true;
    }
  }
  // Edificio del santuario
  if (
    Math.abs(x - SHRINE.hallX) < SHRINE.hallW / 2 + PLAYER_RADIUS &&
    Math.abs(z - SHRINE.hallZ) < SHRINE.hallD / 2 + PLAYER_RADIUS
  ) {
    return true;
  }
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    const dx = x - o.x;
    const dz = z - o.z;
    const r = o.r + PLAYER_RADIUS;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

/** Zonas del zócalo del santuario: sobre el zócalo, en la escalinata o afuera. */
export function shrineZone(x: number, z: number): "plinth" | "steps" | "none" {
  const hx = SHRINE.plinthW / 2;
  const hz = SHRINE.plinthD / 2;
  const front = SHRINE.z + hz;
  if (Math.abs(x - SHRINE.x) <= hx && Math.abs(z - SHRINE.z) <= hz) return "plinth";
  if (Math.abs(x - SHRINE.x) <= SHRINE.stepsW / 2 && z > front && z <= front + SHRINE.stepsDepth) {
    return "steps";
  }
  return "none";
}

// ---------------------------------------------------------------------
// Puntos clave del recorrido
// ---------------------------------------------------------------------

/** Donde se para el jugador al entrar. */
export const SPAWN = { x: 0.1, z: 10.2 };
