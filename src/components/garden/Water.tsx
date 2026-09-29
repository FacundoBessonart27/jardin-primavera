"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { POND_LEVEL, bridgeDeckHeight, heightAt, streamWaterLevel } from "@/lib/terrain";
import { BRIDGE, POND, STREAM, samplePath } from "@/lib/gardenPlan";
import { SUN_COLOR, SUN_DIRECTION } from "@/lib/sun";
import { sceneUniforms } from "@/lib/sceneUniforms";
import { MeshBuilder } from "@/lib/meshBuilder";
import { createSeededRandom } from "@/lib/random";

const vertexShader = /* glsl */ `
  attribute float aFlow;
  varying vec3 vWorld;
  varying float vFlow;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vFlow = aFlow;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uSkyLow;
  uniform vec3 uSkyHigh;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  varying vec3 vWorld;
  varying float vFlow;
  #include <fog_pars_fragment>
  void main() {
    // Ondas suaves (y, en el arroyo, corriente a lo largo del cauce).
    float t = uTime;
    vec3 n = normalize(vec3(
      sin(vWorld.x * 3.1 + t * 1.2) * 0.05 + sin(vWorld.z * 2.3 - t * 0.8) * 0.04 + sin(vFlow * 5.0 - t * 2.4) * 0.05,
      1.0,
      cos(vWorld.z * 3.7 + t * 0.9) * 0.05 + sin((vWorld.x + vWorld.z) * 1.7 + t * 1.5) * 0.035
    ));
    vec3 view = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - max(dot(view, n), 0.0), 3.0);
    vec3 r = reflect(-view, n);
    // Reflejo del cielo del atardecer: violeta arriba, rosado-dorado abajo.
    vec3 sky = mix(uSkyLow, uSkyHigh, smoothstep(0.0, 0.6, r.y));
    vec3 color = mix(uDeep, sky * 0.72, 0.1 + 0.55 * fresnel);
    float glint = pow(max(dot(r, uSunDir), 0.0), 140.0);
    color += uSunColor * glint * 1.3;
    gl_FragColor = vec4(color, 0.88);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function makeWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color("#1f3a44") },
        uSkyLow: { value: new THREE.Color("#f2a98c") },
        uSkyHigh: { value: new THREE.Color("#6c4f93") },
        uSunDir: { value: SUN_DIRECTION.clone() },
        uSunColor: { value: SUN_COLOR.clone() },
      },
    ]),
  });
}

function buildPondGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CircleGeometry(1, 64);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position");
  const c = Math.cos(POND.rot);
  const s = Math.sin(POND.rot);
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i) * POND.rx * 1.36;
    const lz = pos.getZ(i) * POND.rz * 1.36;
    pos.setXYZ(i, POND.x + lx * c - lz * s, POND_LEVEL, POND.z + lx * s + lz * c);
  }
  geo.setAttribute("aFlow", new THREE.Float32BufferAttribute(new Float32Array(pos.count), 1));
  geo.computeVertexNormals();
  return geo;
}

function buildStreamGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const flow: number[] = [];
  const indices: number[] = [];
  const halfWidth = 1.95;
  let row = 0;
  for (let s = 0; s <= STREAM.length; s += 0.5) {
    const p = samplePath(STREAM, s);
    for (const k of [-1, 0, 1]) {
      const x = p.x - p.tz * halfWidth * k;
      const z = p.z + p.tx * halfWidth * k;
      positions.push(x, streamWaterLevel(p.x, p.z), z);
      flow.push(s);
    }
    if (row > 0) {
      for (let j = 0; j < 2; j++) {
        const a = (row - 1) * 3 + j;
        const b = a + 1;
        const cc = row * 3 + j;
        const d = cc + 1;
        indices.push(a, b, cc, b, d, cc);
      }
    }
    row++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aFlow", new THREE.Float32BufferAttribute(flow, 1));
  geo.setIndex(indices);
  return geo;
}

/** Hojas de nenúfar flotando en el estanque. */
function LilyPads() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.CircleGeometry(0.3, 14, 0.35, Math.PI * 2 - 0.5);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const count = 11;
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const random = createSeededRandom(5353);
    const d = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2;
      const r = 0.35 + random() * 0.5;
      d.position.set(
        POND.x + Math.cos(a) * POND.rx * r,
        POND_LEVEL + 0.012,
        POND.z + Math.sin(a) * POND.rz * r
      );
      d.rotation.set(0, random() * Math.PI * 2, 0);
      d.scale.setScalar(0.7 + random() * 0.7);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      mesh.setColorAt(i, color.setHSL(0.27 + random() * 0.05, 0.45, 0.28 + random() * 0.1));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, count]} receiveShadow>
      <meshLambertMaterial side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

/** Puente arqueado de madera con barandas bermellón (estilo japonés). */
function buildBridge(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const vermilion = "#c8472e";
  const deck = ["#7c5539", "#6f4b32"];
  const L = BRIDGE.halfLength;
  const hw = BRIDGE.halfWidth;
  const yaw = Math.atan2(BRIDGE.dx, BRIDGE.dz);
  const toWorld = (u: number, w: number) => ({
    x: BRIDGE.x + BRIDGE.dx * u - BRIDGE.dz * w,
    z: BRIDGE.z + BRIDGE.dz * u + BRIDGE.dx * w,
  });
  const planks = 20;
  for (let i = 0; i < planks; i++) {
    const u0 = -L + (i / planks) * 2 * L;
    const u1 = -L + ((i + 1) / planks) * 2 * L;
    const um = (u0 + u1) / 2;
    const y0 = bridgeDeckHeight(u0);
    const y1 = bridgeDeckHeight(u1);
    const slope = Math.atan2(y1 - y0, u1 - u0);
    const c = toWorld(um, 0);
    const len = Math.hypot(u1 - u0, y1 - y0);
    // Cada tabla sigue el arco del puente.
    b.box(hw * 2, 0.08, len * 0.96, c.x, (y0 + y1) / 2 - 0.04, c.z, deck[i % 2], yaw, -slope);
  }
  // Vigas de apoyo por debajo.
  for (const w of [-hw * 0.7, hw * 0.7]) {
    for (let i = 0; i < 10; i++) {
      const u0 = -L + (i / 10) * 2 * L;
      const u1 = -L + ((i + 1) / 10) * 2 * L;
      const y0 = bridgeDeckHeight(u0) - 0.15;
      const y1 = bridgeDeckHeight(u1) - 0.15;
      const c = toWorld((u0 + u1) / 2, w);
      b.box(0.12, 0.14, Math.hypot(u1 - u0, y1 - y0), c.x, (y0 + y1) / 2, c.z, "#4b3325", yaw, -Math.atan2(y1 - y0, u1 - u0));
    }
  }
  // Barandas: postes y pasamanos que siguen el arco.
  const posts = 7;
  for (const w of [-(hw - 0.04), hw - 0.04]) {
    for (let i = 0; i <= posts; i++) {
      const u = -L + 0.15 + (i / posts) * (2 * L - 0.3);
      const y = bridgeDeckHeight(u);
      const c = toWorld(u, w);
      b.box(0.1, 0.8, 0.1, c.x, y + 0.36, c.z, vermilion, yaw);
      if (i === 0 || i === posts) {
        // Remates (giboshi) en los postes de las puntas.
        b.sphere(0.075, c.x, y + 0.82, c.z, "#d9b25a", 1, 1.3, 1);
      }
    }
    for (let i = 0; i < posts * 2; i++) {
      const u0 = -L + 0.15 + (i / (posts * 2)) * (2 * L - 0.3);
      const u1 = -L + 0.15 + ((i + 1) / (posts * 2)) * (2 * L - 0.3);
      for (const h of [0.72, 0.38]) {
        const y0 = bridgeDeckHeight(u0) + h;
        const y1 = bridgeDeckHeight(u1) + h;
        const c = toWorld((u0 + u1) / 2, w);
        b.box(0.07, 0.06, Math.hypot(u1 - u0, y1 - y0) + 0.02, c.x, (y0 + y1) / 2, c.z, vermilion, yaw, -Math.atan2(y1 - y0, u1 - u0));
      }
    }
  }
  return b.build();
}

/** Estanque, arroyo y puente. El agua es un shader liviano que refleja
 * los colores del atardecer y el brillo del sol, sin render extra. */
export function Water() {
  const material = useMemo(() => makeWaterMaterial(), []);
  const pond = useMemo(() => buildPondGeometry(), []);
  const stream = useMemo(() => buildStreamGeometry(), []);
  const bridge = useMemo(() => buildBridge(), []);
  const bridgeMaterial = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);

  useFrame(() => {
    material.uniforms.uTime.value = sceneUniforms.windTime;
  });

  // Asegura que el terreno bajo el puente ya esté calculado (cachea las
  // alturas de los extremos antes del primer frame).
  useMemo(() => heightAt(BRIDGE.x, BRIDGE.z), []);

  return (
    <group>
      <mesh geometry={pond} material={material} renderOrder={2} />
      <mesh geometry={stream} material={material} renderOrder={2} />
      <LilyPads />
      <mesh geometry={bridge} material={bridgeMaterial} castShadow receiveShadow />
    </group>
  );
}
