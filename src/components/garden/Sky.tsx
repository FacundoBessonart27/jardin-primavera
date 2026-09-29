"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HORIZON_HAZE, SUN_COLOR, SUN_DIRECTION } from "@/lib/sun";

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
    // El cielo siempre en el fondo, sin importar la distancia.
    gl_Position.z = gl_Position.w;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uRose;
  uniform vec3 uViolet;
  uniform vec3 uZenith;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;
    float sunAmount = max(dot(dir, uSunDir), 0.0);
    // Cuánto "mira hacia el sol" en el plano: el lado del sol es más
    // naranja y dorado; el opuesto, más rosado y lila.
    vec2 flatDir = normalize(dir.xz + 1e-5);
    vec2 flatSun = normalize(uSunDir.xz);
    float sunSide = dot(flatDir, flatSun) * 0.5 + 0.5;

    // Degradé por altura: bruma → naranja/dorado → rosa/magenta → violeta → índigo.
    vec3 low = mix(uRose, uGlow, pow(sunSide, 1.6));
    vec3 color = mix(uHorizon, low, smoothstep(-0.02, 0.1, h));
    color = mix(color, uRose, smoothstep(0.08, 0.3, h) * (0.55 + 0.45 * (1.0 - sunSide)));
    color = mix(color, uViolet, smoothstep(0.22, 0.55, h));
    color = mix(color, uZenith, smoothstep(0.5, 1.0, h));
    // Debajo del horizonte: la misma bruma que la niebla.
    color = mix(color, uHorizon, smoothstep(0.0, -0.08, h));

    // Sol: disco, halo y resplandor ancho sobre el horizonte.
    float disc = smoothstep(0.9993, 0.9997, sunAmount);
    float halo = pow(sunAmount, 24.0) * 0.55;
    float glow = pow(sunAmount, 4.0) * 0.35 * (1.0 - smoothstep(0.0, 0.5, h));
    color += uSunColor * (halo + glow);
    color = mix(color, vec3(1.0, 0.95, 0.82), disc);

    gl_FragColor = vec4(color, 1.0);
    // Sin tone mapping: el horizonte tiene que salir exactamente del mismo
    // color que la niebla (three la mezcla ya en el espacio de salida).
    #include <colorspace_fragment>
  }
`;

/**
 * Cielo de atardecer cinematográfico: bruma naranja en el horizonte,
 * rosa y magenta más arriba, violeta e índigo en el cenit, más el sol
 * bajo con su halo. El color del horizonte coincide con el de la
 * niebla, así las capas lejanas del paisaje se funden sin cortes.
 */
export function Sky() {
  const uniforms = useMemo(
    () => ({
      uHorizon: { value: HORIZON_HAZE.clone() },
      uGlow: { value: new THREE.Color("#ffb46e") },
      uRose: { value: new THREE.Color("#e8788f") },
      uViolet: { value: new THREE.Color("#7d4f94") },
      uZenith: { value: new THREE.Color("#2f2a5e") },
      uSunDir: { value: SUN_DIRECTION.clone() },
      uSunColor: { value: SUN_COLOR.clone() },
    }),
    []
  );

  const meshRef = useRef<THREE.Mesh>(null);
  // La cúpula acompaña a la cámara: el horizonte queda siempre a la
  // altura de la vista, esté donde esté el jugador.
  useFrame(({ camera }) => {
    meshRef.current?.position.copy(camera.position);
  });

  return (
    <mesh ref={meshRef} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[400, 48, 24]} />
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
