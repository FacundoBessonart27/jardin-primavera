import * as THREE from "three";
import { createSeededRandom } from "./random";

/**
 * Texturas del paisaje generadas con <canvas> en tiempo de ejecución
 * (sin imágenes externas): detalle del césped, tierra y grava de los
 * caminos, empedrado de la plaza, flores de sakura para las copas y el
 * papel de los shoji del santuario. Todas se crean una sola vez.
 */

const cache = new Map<string, THREE.CanvasTexture>();

function canvasTexture(
  key: string,
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  options: { repeat?: boolean; srgb?: boolean } = {}
): THREE.CanvasTexture {
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  if (options.repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  if (options.srgb !== false) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  cache.set(key, texture);
  return texture;
}

/** Dibuja algo en las 9 posiciones que rodean (x, y) para que la
 * textura se repita sin costuras. */
function tiled(size: number, x: number, y: number, fn: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const px = x + dx;
      const py = y + dy;
      if (px > -size * 0.2 && px < size * 1.2 && py > -size * 0.2 && py < size * 1.2) fn(px, py);
    }
  }
}

/** Detalle gris claro que se multiplica sobre el color del césped:
 * manchas y trazos finos que rompen la suavidad del color por vértice. */
export function createGrassDetailTexture(): THREE.CanvasTexture {
  return canvasTexture(
    "grass-detail",
    256,
    (ctx, size) => {
      const random = createSeededRandom(4411);
      ctx.fillStyle = "rgb(236,236,236)";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 70; i++) {
        const x = random() * size;
        const y = random() * size;
        const r = 10 + random() * 34;
        const shade = 200 + Math.floor(random() * 55);
        tiled(size, x, y, (px, py) => {
          const g = ctx.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, `rgba(${shade},${shade},${shade},0.55)`);
          g.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(px - r, py - r, r * 2, r * 2);
        });
      }
      for (let i = 0; i < 1400; i++) {
        const x = random() * size;
        const y = random() * size;
        const len = 2 + random() * 5;
        const angle = -Math.PI / 2 + (random() - 0.5) * 0.9;
        const shade = random() < 0.5 ? 190 + Math.floor(random() * 30) : 250;
        ctx.strokeStyle = `rgba(${shade},${shade},${shade},0.55)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
        ctx.stroke();
      }
    },
    { repeat: true, srgb: false }
  );
}

/** Tierra apisonada con piedritas (camino principal) o grava clara
 * (caminos secundarios). */
export function createPathTexture(kind: "earth" | "gravel"): THREE.CanvasTexture {
  return canvasTexture(
    `path-${kind}`,
    256,
    (ctx, size) => {
      const random = createSeededRandom(kind === "earth" ? 8123 : 9187);
      const base = kind === "earth" ? [178, 142, 104] : [196, 180, 156];
      ctx.fillStyle = `rgb(${base.join(",")})`;
      ctx.fillRect(0, 0, size, size);
      // Manchas grandes de humedad / tierra más clara.
      for (let i = 0; i < 40; i++) {
        const x = random() * size;
        const y = random() * size;
        const r = 12 + random() * 40;
        const k = (random() - 0.5) * 36;
        tiled(size, x, y, (px, py) => {
          const g = ctx.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, `rgba(${base[0] + k},${base[1] + k},${base[2] + k * 0.8},0.5)`);
          g.addColorStop(1, `rgba(${base[0] + k},${base[1] + k},${base[2] + k},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(px - r, py - r, r * 2, r * 2);
        });
      }
      // Piedritas.
      const pebbles = kind === "earth" ? 700 : 1800;
      for (let i = 0; i < pebbles; i++) {
        const x = random() * size;
        const y = random() * size;
        const r = (kind === "earth" ? 0.8 : 1) + random() * (kind === "earth" ? 2.2 : 2.6);
        const tone = 120 + Math.floor(random() * 110);
        const warm = kind === "earth" ? 1.05 : 1;
        tiled(size, x, y, (px, py) => {
          ctx.fillStyle = `rgba(${Math.min(255, tone * warm + 18)},${tone + 8},${tone - 6},0.9)`;
          ctx.beginPath();
          ctx.ellipse(px, py, r, r * (0.6 + random() * 0.4), random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(60,40,30,0.25)";
          ctx.beginPath();
          ctx.ellipse(px + r * 0.3, py + r * 0.35, r, r * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    },
    { repeat: true }
  );
}

/** Empedrado circular de la plaza del santuario (anillos de lajas). */
export function createPlazaTexture(): THREE.CanvasTexture {
  return canvasTexture("plaza", 1024, (ctx, size) => {
    const random = createSeededRandom(2024);
    const c = size / 2;
    ctx.fillStyle = "rgb(120,108,98)";
    ctx.fillRect(0, 0, size, size);
    const rings = 9;
    for (let ring = 0; ring < rings; ring++) {
      const r0 = (ring / rings) * c;
      const r1 = ((ring + 1) / rings) * c;
      const count = Math.max(6, Math.round((2 * Math.PI * (r0 + r1)) / 2 / ((r1 - r0) * 1.25)));
      const offset = random() * Math.PI * 2;
      for (let k = 0; k < count; k++) {
        const a0 = offset + (k / count) * Math.PI * 2 + 0.012;
        const a1 = offset + ((k + 1) / count) * Math.PI * 2 - 0.012;
        const tone = 168 + Math.floor(random() * 50);
        const warm = random() * 12;
        ctx.fillStyle = `rgb(${tone + warm},${tone - 4},${tone - 14})`;
        ctx.beginPath();
        ctx.arc(c, c, r1 - 3, a0, a1);
        ctx.arc(c, c, r0 + 3, a1, a0, true);
        ctx.closePath();
        ctx.fill();
        // Leve desgaste en cada laja.
        const am = (a0 + a1) / 2;
        const rm = (r0 + r1) / 2;
        const g = ctx.createRadialGradient(
          c + Math.cos(am) * rm,
          c + Math.sin(am) * rm,
          0,
          c + Math.cos(am) * rm,
          c + Math.sin(am) * rm,
          (r1 - r0) * 0.8
        );
        g.addColorStop(0, "rgba(255,240,225,0.18)");
        g.addColorStop(1, "rgba(255,240,225,0)");
        ctx.fillStyle = g;
        ctx.fill();
      }
    }
    // Musgo entre las juntas.
    for (let i = 0; i < 900; i++) {
      const a = random() * Math.PI * 2;
      const r = random() * c;
      ctx.fillStyle = `rgba(${70 + random() * 30},${100 + random() * 40},${60},${0.2 + random() * 0.25})`;
      ctx.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 2, 2);
    }
  });
}

/** Racimos de flores de cerezo (cinco pétalos) sobre fondo transparente,
 * para las "tarjetas" que forman el borde esponjoso de cada copa. */
export function createBlossomTexture(): THREE.CanvasTexture {
  return canvasTexture("blossom", 256, (ctx, size) => {
    const random = createSeededRandom(777);
    ctx.clearRect(0, 0, size, size);
    const flower = (x: number, y: number, r: number, tone: number) => {
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + random() * 0.3;
        const px = x + Math.cos(a) * r * 0.55;
        const py = y + Math.sin(a) * r * 0.55;
        const g = ctx.createRadialGradient(px, py, 0, px, py, r * 0.62);
        g.addColorStop(0, `rgba(255,${238 - tone},${244 - tone * 0.6},1)`);
        g.addColorStop(0.75, `rgba(250,${196 - tone},${214 - tone * 0.6},1)`);
        g.addColorStop(1, `rgba(245,${180 - tone},${205 - tone * 0.6},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(px, py, r * 0.55, r * 0.42, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(214,90,120,0.9)";
      ctx.beginPath();
      ctx.arc(x, y, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    };
    // Varias flores superpuestas, más densas al centro de la tarjeta.
    for (let i = 0; i < 26; i++) {
      const a = random() * Math.PI * 2;
      const d = Math.sqrt(random()) * size * 0.36;
      const r = size * (0.07 + random() * 0.06);
      flower(size / 2 + Math.cos(a) * d, size / 2 + Math.sin(a) * d, r, Math.floor(random() * 40));
    }
  });
}

/** Masa de flores de cerezo, opaca y repetible: la "piel" del volumen
 * de cada racimo (así la copa no se ve como una esfera lisa). */
export function createBlossomDenseTexture(): THREE.CanvasTexture {
  return canvasTexture(
    "blossom-dense",
    256,
    (ctx, size) => {
      const random = createSeededRandom(4321);
      ctx.fillStyle = "rgb(226,150,176)";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 260; i++) {
        const x = random() * size;
        const y = random() * size;
        const r = size * (0.025 + random() * 0.03);
        const tone = Math.floor(random() * 45);
        tiled(size, x, y, (px, py) => {
          for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2 + i;
            const qx = px + Math.cos(a) * r * 0.55;
            const qy = py + Math.sin(a) * r * 0.55;
            ctx.fillStyle = `rgb(255,${222 - tone},${234 - tone * 0.6})`;
            ctx.beginPath();
            ctx.ellipse(qx, qy, r * 0.55, r * 0.42, a, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "rgb(205,92,125)";
          ctx.beginPath();
          ctx.arc(px, py, r * 0.16, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      // Sombras suaves entre racimos.
      for (let i = 0; i < 40; i++) {
        const x = random() * size;
        const y = random() * size;
        const r = 14 + random() * 26;
        tiled(size, x, y, (px, py) => {
          const g = ctx.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, "rgba(150,70,100,0.28)");
          g.addColorStop(1, "rgba(150,70,100,0)");
          ctx.fillStyle = g;
          ctx.fillRect(px - r, py - r, r * 2, r * 2);
        });
      }
    },
    { repeat: true }
  );
}

/** Papel de shoji con su reticulado de madera: con emisión cálida,
 * parece iluminado desde adentro. */
export function createShojiTexture(): THREE.CanvasTexture {
  return canvasTexture("shoji", 256, (ctx, size) => {
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, "rgb(255,236,196)");
    g.addColorStop(1, "rgb(255,214,160)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgb(92,52,36)";
    ctx.lineWidth = 7;
    ctx.strokeRect(3, 3, size - 6, size - 6);
    ctx.lineWidth = 4;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((i / 4) * size, 0);
      ctx.lineTo((i / 4) * size, size);
      ctx.stroke();
    }
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (i / 6) * size);
      ctx.lineTo(size, (i / 6) * size);
      ctx.stroke();
    }
  });
}
