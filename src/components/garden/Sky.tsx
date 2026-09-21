"use client";

import { useMemo } from "react";
import * as THREE from "three";

const vertexShader = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  varying vec3 vWorldPosition;
  uniform vec3 topColor;
  uniform vec3 midColor;
  uniform vec3 bottomColor;
  uniform float offset;
  uniform float exponent;

  void main() {
    float h = normalize(vWorldPosition + offset).y;
    float t = max(h, 0.0);
    vec3 skyMix = mix(midColor, topColor, pow(t, exponent));
    vec3 horizonMix = mix(bottomColor, midColor, smoothstep(-0.05, 0.35, h));
    vec3 color = h > 0.28 ? skyMix : horizonMix;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Cúpula de cielo con degradé cálido de atardecer primaveral. */
export function Sky() {
  const uniforms = useMemo(
    () => ({
      topColor: { value: new THREE.Color("#4a2f6e") },
      midColor: { value: new THREE.Color("#e78a6b") },
      bottomColor: { value: new THREE.Color("#ffd9a0") },
      offset: { value: 8 },
      exponent: { value: 0.65 },
    }),
    []
  );

  return (
    <mesh scale={[1, 1, 1]} renderOrder={-10}>
      <sphereGeometry args={[80, 32, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        fog={false}
      />
    </mesh>
  );
}
