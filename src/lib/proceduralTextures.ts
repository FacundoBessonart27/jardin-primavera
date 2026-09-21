import * as THREE from "three";

/**
 * Genera texturas suaves (nubes, pétalos, resplandor) con <canvas> en
 * tiempo de ejecución. Evita depender de imágenes externas (sin
 * problemas de licencia) y son livianas.
 */

const textureCache = new Map<string, THREE.CanvasTexture>();

function makeCanvas(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

export function createSoftDiscTexture(
  size = 128,
  color = "#ffffff"
): THREE.CanvasTexture {
  const key = `disc-${size}-${color}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.55, color);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}

export function createPetalTexture(
  size = 96,
  color = "#ffb3c6"
): THREE.CanvasTexture {
  const key = `petal-${size}-${color}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  ctx.translate(size / 2, size / 2);

  ctx.beginPath();
  ctx.moveTo(0, -size * 0.46);
  ctx.bezierCurveTo(
    size * 0.42,
    -size * 0.3,
    size * 0.42,
    size * 0.28,
    0,
    size * 0.46
  );
  ctx.bezierCurveTo(
    -size * 0.42,
    size * 0.28,
    -size * 0.42,
    -size * 0.3,
    0,
    -size * 0.46
  );
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, -size * 0.46, 0, size * 0.46);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(255,255,255,0.55)");
  ctx.fillStyle = gradient;
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}

export function createWingTexture(
  size = 128,
  color = "#ffd166"
): THREE.CanvasTexture {
  const key = `wing-${size}-${color}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  ctx.translate(size * 0.05, size / 2);

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(
    size * 0.15,
    -size * 0.48,
    size * 0.75,
    -size * 0.42,
    size * 0.9,
    -size * 0.08
  );
  ctx.bezierCurveTo(
    size * 0.98,
    size * 0.05,
    size * 0.7,
    size * 0.18,
    size * 0.42,
    size * 0.08
  );
  ctx.bezierCurveTo(
    size * 0.55,
    size * 0.3,
    size * 0.3,
    size * 0.46,
    0,
    size * 0.02
  );
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, -size * 0.4, size * 0.9, size * 0.2);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(255,255,255,0.65)");
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.lineWidth = size * 0.02;
  ctx.strokeStyle = "rgba(40,20,10,0.35)";
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}

export function createCloudTexture(size = 256): THREE.CanvasTexture {
  const key = `cloud-${size}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d")!;
  const blobs = [
    [0.5, 0.55, 0.32],
    [0.32, 0.6, 0.22],
    [0.68, 0.6, 0.24],
    [0.42, 0.42, 0.2],
    [0.6, 0.42, 0.2],
  ];

  for (const [cx, cy, r] of blobs) {
    const gradient = ctx.createRadialGradient(
      cx * size,
      cy * size,
      0,
      cx * size,
      cy * size,
      r * size
    );
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx * size, cy * size, r * size, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}
