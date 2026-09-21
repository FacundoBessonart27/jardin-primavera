export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp(t);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export function easeOutCubic(t: number): number {
  const x = clamp(t);
  return 1 - Math.pow(1 - x, 3);
}

export function easeInOutSine(t: number): number {
  const x = clamp(t);
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

export function smoothDamp(current: number, target: number, factor: number) {
  return current + (target - current) * factor;
}
