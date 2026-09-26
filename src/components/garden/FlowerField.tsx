"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { regularFlowerSpecies, specialFlower, type FlowerVisual } from "@/data/flowers";
import { getFlowerGeometry } from "@/components/flowers/flowerGeometryCache";
import { generateFieldLayout, SPECIAL_FLOWER_POSITION, type FlowerPlacement } from "./fieldLayout";
import { useExperienceStore } from "@/store/experienceStore";
import { sceneUniforms } from "@/lib/sceneUniforms";
import { clamp, easeOutBack } from "@/lib/easing";
import { createSeededRandom } from "@/lib/random";
import { heightAt } from "@/lib/terrain";
import { playerState } from "@/lib/playerState";
import { createSoftDiscTexture } from "@/lib/proceduralTextures";
import { registerFlowerMesh, unregisterFlowerMesh, trySelectPlacement } from "@/lib/flowerRegistry";

interface SpeciesGroupProps {
  speciesId: string;
  visual: FlowerVisual;
  placements: FlowerPlacement[];
  isSpecial: boolean;
  bloom: number;
}

const dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _point = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _brushQuat = new THREE.Quaternion();

/** Distancia a la que el jugador, al caminar entre las flores, las
 * aparta suavemente (se inclinan hacia afuera y vuelven despacio). */
const BRUSH_RADIUS = 0.85;
const BRUSH_MAX_TILT = 0.38;

// Dirección (normalizada) de la luz clave de la escena (ver
// GardenScene: directionalLight en [6, 9, 4]) y su color cálido,
// reutilizados para una simulación liviana de subsuperficie en los
// pétalos (ver material más abajo).
const SSS_LIGHT_DIR = new THREE.Vector3(6, 9, 4).normalize();
const SSS_LIGHT_COLOR = new THREE.Color("#ffcf8a");

/** Distancia (en el plano) a la que una flor empieza a "notar" al
 * jugador que se acerca caminando. */
const PROXIMITY_RADIUS = 1.7;

const windUniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 1 },
};

let sharedFlowerMaterial: THREE.MeshPhysicalMaterial | null = null;

/**
 * Material ÚNICO para todas las flores del campo (un solo programa de
 * shader para todas las especies y variantes):
 *  - MeshPhysicalMaterial con un "sheen" suave (el brillo aterciopelado
 *    de los pétalos reales), en vez del aspecto plástico de un material
 *    mate plano.
 *  - Subsuperficie liviana: a contraluz, el pétalo deja pasar un poco de
 *    su propio color.
 *  - Rugosidad levemente distinta por pieza (atributo horneado).
 *  - Viento por vértice: el tallo se flexiona con una fase propia de cada
 *    planta (tomada de su posición, así ninguna se mueve sincronizada con
 *    la vecina), ráfagas lentas que recorren el campo, y un aleteo sutil
 *    de pétalos y hojas que mueve las puntas sin despegar las bases.
 */
function getFlowerMaterial(): THREE.MeshPhysicalMaterial {
  if (sharedFlowerMaterial) return sharedFlowerMaterial;

  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.52,
    metalness: 0.02,
    // Sin clearcoat: con el "sheen" el resultado es visualmente igual y
    // cada píxel de flor se ahorra un término de iluminación completo.
    sheen: 0.35,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color("#fff0f5"),
    side: THREE.DoubleSide,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSssLightDir = { value: SSS_LIGHT_DIR };
    shader.uniforms.uSssColor = { value: SSS_LIGHT_COLOR };
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;

    shader.vertexShader =
      `attribute float aWindPhase;\nattribute float aRoughOffset;\n` +
      `attribute float aFlex;\nattribute float aBend;\nvarying float vRoughOffset;\n` +
      `uniform float uTime;\nuniform float uWindStrength;\n` +
      shader.vertexShader;
    // Un único reemplazo de `#include <begin_vertex>` (encadenar dos
    // sobre el mismo token haría que el segundo no encuentre nada).
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vRoughOffset = aRoughOffset;
      #ifdef USE_INSTANCING
        vec2 plantXZ = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 plantXZ = vec2(0.0);
      #endif
      float plantPhase = dot(plantXZ, vec2(0.61, 0.43));
      float gust = 0.6 + 0.4 * sin(uTime * 0.45 - dot(plantXZ, vec2(0.22, 0.14)));
      float windAmp = uWindStrength * gust;
      float sway = sin(uTime * 1.15 + plantPhase) * 0.03 + sin(uTime * 2.3 + plantPhase * 1.7) * 0.012;
      transformed.x += sway * windAmp * aBend;
      transformed.z += cos(uTime * 0.95 + plantPhase * 0.8) * 0.018 * windAmp * aBend;
      float flutterPhase = aWindPhase + plantPhase;
      transformed.y += sin(uTime * 3.1 + flutterPhase) * 0.016 * windAmp * aFlex;
      transformed.x += sin(uTime * 2.4 + flutterPhase * 1.3) * 0.01 * windAmp * aFlex;
      transformed.z += cos(uTime * 2.7 + flutterPhase * 0.7) * 0.008 * windAmp * aFlex;`
    );

    shader.fragmentShader =
      `varying float vRoughOffset;\nuniform vec3 uSssLightDir;\nuniform vec3 uSssColor;\n` +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + vRoughOffset, 0.05, 1.0);`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <output_fragment>",
      `float sssBack = max(0.0, -dot(normalize(normal), uSssLightDir));
      float sssTerm = pow(sssBack, 1.6) * 0.4;
      outgoingLight += sssTerm * diffuseColor.rgb * uSssColor;
      #include <output_fragment>`
    );
  };

  sharedFlowerMaterial = mat;
  return mat;
}

function SpeciesGroup({ speciesId, visual, placements, isSpecial, bloom }: SpeciesGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(
    () => getFlowerGeometry(speciesId, visual, "field", bloom),
    [speciesId, visual, bloom]
  );
  const material = useMemo(() => getFlowerMaterial(), []);

  const bumpRef = useRef<Float32Array>(new Float32Array(placements.length).fill(1));
  /** Brillo cálido por flor (0..1): apuntada/seleccionada o cercana. */
  const glowRef = useRef<Float32Array>(new Float32Array(placements.length));
  /** Color base de cada instancia (variación natural de tono). */
  const baseColorsRef = useRef<Float32Array>(new Float32Array(placements.length * 3));
  /** Altura del terreno bajo cada flor (fija: se calcula una sola vez). */
  const groundRef = useRef<Float32Array>(new Float32Array(placements.length));
  /** Cuánto está apartada cada flor por el paso del jugador (0..1) y
   * hacia dónde (x, z). */
  const brushRef = useRef<Float32Array>(new Float32Array(placements.length));
  const brushDirRef = useRef<Float32Array>(new Float32Array(placements.length * 2));

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const random = createSeededRandom(speciesId.length * 97 + placements.length);

    // Cuanto mayor `colorVariance` tenga la especie, más se nota la
    // diferencia de tono entre flores vecinas (más "natural", menos
    // flores clonadas idénticas una al lado de la otra).
    const variance = 0.08 + visual.colorVariance * 0.5;
    const baseColors = new Float32Array(placements.length * 3);
    const ground = new Float32Array(placements.length);
    const bounds = new THREE.Box3();
    let maxScale = 0;

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const [x, , z] = p.position;
      ground[i] = heightAt(x, z);
      bounds.expandByPoint(_point.set(x, ground[i], z));
      maxScale = Math.max(maxScale, p.scaleVariance * Math.max(p.stretch, p.heightVar));

      dummy.position.set(x, ground[i], z);
      dummy.rotation.set(0, p.rotationY, 0);
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const brightness = 1 + (random() - 0.5) * variance;
      const warmth = 1 + (random() - 0.5) * variance * 0.6;
      baseColors[i * 3] = brightness;
      baseColors[i * 3 + 1] = brightness;
      baseColors[i * 3 + 2] = brightness * warmth;
      mesh.setColorAt(i, _color.setRGB(brightness, brightness, brightness * warmth));
    }

    // Esfera envolvente correcta y fija para todo el grupo. Three.js la
    // calcula una sola vez (la primera vez que la necesita) y la guarda;
    // como las flores arrancan "encogidas" y crecen durante la entrada,
    // esa primera esfera quedaba demasiado chica: el grupo se recortaba
    // de la vista antes de tiempo y costaba seleccionarlo (sobre todo
    // grupos de una sola flor, como la especial). Las flores nunca se
    // mueven de su lugar, así que esta esfera vale para siempre.
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const local = geometry.boundingSphere!;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    sphere.radius += (local.center.length() + local.radius) * maxScale * 1.4;
    mesh.boundingSphere = sphere;

    baseColorsRef.current = baseColors;
    groundRef.current = ground;
    glowRef.current = new Float32Array(placements.length);
    bumpRef.current = new Float32Array(placements.length).fill(1);
    brushRef.current = new Float32Array(placements.length);
    brushDirRef.current = new Float32Array(placements.length * 2);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    registerFlowerMesh(mesh, placements);
    return () => unregisterFlowerMesh(mesh);
  }, [placements, speciesId, visual.colorVariance, geometry]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    windUniforms.uTime.value = sceneUniforms.windTime;
    windUniforms.uWindStrength.value = sceneUniforms.windStrength;

    const { hoveredInstanceId, selected, foundSpecialFlower, foundMessageIds, phase } =
      useExperienceStore.getState();
    const exploring = phase === "garden";
    const t = sceneUniforms.windTime;
    const px = playerState.position.x;
    const pz = playerState.position.z;
    const glow = glowRef.current;
    const baseColors = baseColorsRef.current;
    const ground = groundRef.current;
    const brush = brushRef.current;
    const brushDir = brushDirRef.current;
    let colorsChanged = false;

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const localProgress = clamp((sceneUniforms.reveal - p.revealThreshold) / 0.22);
      const revealScale = Math.max(0, easeOutBack(localProgress));

      const isHovered = hoveredInstanceId === p.id;
      const isSelected = selected?.instanceId === p.id;

      // Cercanía del jugador: las flores junto a las que se camina se
      // "despiertan" apenas (un poco más grandes y luminosas), muy sutil.
      const dx = p.position[0] - px;
      const dz = p.position[2] - pz;
      const d = exploring ? Math.hypot(dx, dz) : Infinity;
      const proximity = d < PROXIMITY_RADIUS ? 1 - d / PROXIMITY_RADIUS : 0;

      const bumpTarget = isSelected ? 1.32 : isHovered ? 1.1 : 1 + proximity * 0.035;
      bumpRef.current[i] += (bumpTarget - bumpRef.current[i]) * 0.15;
      const bump = bumpRef.current[i] || 1;

      let glowTarget = isSelected ? 0.35 : isHovered ? 0.28 : proximity * 0.08;
      if (p.isSpecial) {
        // La flor especial "respira" con un brillo cálido que crece a
        // medida que alguien se acerca (y queda más tenue una vez hallada).
        const near = 1 - clamp((d - 1.5) / 5.5);
        const breathe = 0.7 + 0.3 * Math.sin(t * 1.3);
        glowTarget = Math.max(glowTarget, near * (foundSpecialFlower ? 0.1 : 0.3) * breathe);
      } else if (p.messageIndex !== undefined && !foundMessageIds.includes(p.id)) {
        // Flores con mensaje: un brillo apenas perceptible, sólo de cerca.
        const near = 1 - clamp((d - 0.8) / 2.7);
        glowTarget = Math.max(glowTarget, near * 0.18 * (0.6 + 0.4 * Math.sin(t * 1.7 + p.windPhase)));
      }
      const glowNext = glow[i] + (glowTarget - glow[i]) * 0.12;
      if (Math.abs(glowNext - glow[i]) > 0.0005) {
        glow[i] = glowNext;
        const g = 1 + glowNext;
        mesh.setColorAt(
          i,
          _color.setRGB(
            baseColors[i * 3] * g * (1 + glowNext * 0.1),
            baseColors[i * 3 + 1] * g,
            baseColors[i * 3 + 2] * g * (1 - glowNext * 0.15)
          )
        );
        colorsChanged = true;
      }

      // Al caminar entre las flores, las más cercanas se apartan hacia
      // afuera y vuelven despacio a su lugar (rápido al apartarse, lento
      // al volver, como un tallo que recupera su postura).
      const brushTarget = d < BRUSH_RADIUS ? 1 - d / BRUSH_RADIUS : 0;
      if (brushTarget > 0 && d > 0.001) {
        brushDir[i * 2] = dx / d;
        brushDir[i * 2 + 1] = dz / d;
      }
      brush[i] += (brushTarget - brush[i]) * (brushTarget > brush[i] ? 0.2 : 0.05);

      // Balanceo general de la planta (el shader agrega la flexión del
      // tallo y el aleteo de pétalos y hojas). Una flor apuntada se mece
      // apenas más, como si reaccionara.
      const reaction = 1 + glow[i] * 1.2;
      const windSway = Math.sin(t * 1.4 + p.windPhase) * 0.035 * sceneUniforms.windStrength * reaction;
      const windTilt =
        Math.cos(t * 1.1 + p.windPhase * 1.3) * 0.025 * sceneUniforms.windStrength * reaction;

      const specialPulse = isSpecial && !foundSpecialFlower ? 1 + Math.sin(t * 1.8) * 0.015 : 1;

      dummy.position.set(p.position[0], ground[i] + (isSelected ? 0.06 : 0), p.position[2]);
      dummy.rotation.set(windTilt + p.leanX, p.rotationY + windSway, windSway * 0.6 + p.leanZ);
      if (brush[i] > 0.002) {
        const bx = brushDir[i * 2];
        const bz = brushDir[i * 2 + 1];
        _brushQuat.setFromAxisAngle(_axis.set(bz, 0, -bx), brush[i] * BRUSH_MAX_TILT);
        dummy.quaternion.premultiply(_brushQuat);
      }
      const s = revealScale * p.scaleVariance * bump * specialPulse;
      dummy.scale.set(s * p.stretch, s * p.heightVar, s * p.stretch);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (colorsChanged && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  // Con el mouse bloqueado (modo caminar de escritorio), la selección
  // pasa por la mira central (ver FirstPersonControls + flowerRegistry),
  // no por la posición real -congelada- del cursor. En ese caso estos
  // handlers de R3F se desactivan para no pelear con el raycast manual.
  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (document.pointerLockElement) return;
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    const placement = placements[e.instanceId];
    useExperienceStore.getState().setHovered(placement.id);
    document.body.style.cursor = "pointer";
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    if (document.pointerLockElement) return;
    e.stopPropagation();
    useExperienceStore.getState().setHovered(null);
    document.body.style.cursor = "auto";
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (document.pointerLockElement) return;
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    trySelectPlacement(placements[e.instanceId]);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, placements.length]}
      castShadow
      receiveShadow
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    />
  );
}

const AURA_COUNT = 14;

/** Unas pocas motas de luz cálida flotando despacio alrededor de la flor
 * especial, como luciérnagas. Desde lejos casi no se ven (no es un
 * indicador de videojuego); al acercarse se vuelven más claras, y una
 * vez encontrada la flor quedan más tenues. Un único objeto Points. */
function SpecialFlowerAura() {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const texture = useMemo(() => createSoftDiscTexture(64, "#ffffff"), []);
  const { x, z } = SPECIAL_FLOWER_POSITION;
  const headY = useMemo(() => heightAt(x, z) + specialFlower.visual.stemHeight + 0.08, [x, z]);

  const { positions, seeds } = useMemo(() => {
    const random = createSeededRandom(5151);
    const seeds = Array.from({ length: AURA_COUNT }, () => ({
      radius: 0.3 + random() * 0.45,
      height: (random() - 0.35) * 0.55,
      speed: (0.18 + random() * 0.25) * (random() < 0.5 ? -1 : 1),
      phase: random() * Math.PI * 2,
    }));
    return { positions: new Float32Array(AURA_COUNT * 3), seeds };
  }, []);

  useFrame(() => {
    const points = pointsRef.current;
    const material = materialRef.current;
    if (!points || !material) return;
    const t = sceneUniforms.windTime;
    for (let i = 0; i < AURA_COUNT; i++) {
      const s = seeds[i];
      const a = s.phase + t * s.speed;
      const r = s.radius * (1 + 0.15 * Math.sin(t * 0.7 + s.phase));
      positions[i * 3] = x + Math.cos(a) * r;
      positions[i * 3 + 1] = headY + s.height + Math.sin(t * 0.9 + s.phase) * 0.12;
      positions[i * 3 + 2] = z + Math.sin(a) * r;
    }
    points.geometry.getAttribute("position").needsUpdate = true;

    const { phase, foundSpecialFlower } = useExperienceStore.getState();
    const d = Math.hypot(x - playerState.position.x, z - playerState.position.z);
    const near = phase === "garden" ? 1 - clamp((d - 1.5) / 6) : 0;
    const revealed = clamp((sceneUniforms.reveal - 0.6) / 0.4);
    const target = (0.15 + 0.7 * near) * (foundSpecialFlower ? 0.45 : 1) * revealed;
    material.opacity += (target - material.opacity) * 0.05;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        size={0.07}
        map={texture}
        color="#ffe3a0"
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

// bloom (0..1) por variante: 0 = capullo bien cerrado, 1 = entreabierta,
// 2 = flor completamente abierta.
const BLOOM_BY_VARIANT: Record<0 | 1 | 2, number> = { 0: 0.12, 1: 0.55, 2: 1 };

export function FlowerField({ count }: { count: number }) {
  const layout = useMemo(() => generateFieldLayout(count), [count]);

  const grouped = useMemo(() => {
    const map = new Map<string, FlowerPlacement[]>();
    for (const placement of layout) {
      const key = `${placement.speciesId}:${placement.bloomVariant}`;
      const list = map.get(key) ?? [];
      list.push(placement);
      map.set(key, list);
    }
    return map;
  }, [layout]);

  return (
    <group>
      {[...regularFlowerSpecies, specialFlower].flatMap((species) =>
        ([0, 1, 2] as const).map((variant) => {
          const placements = grouped.get(`${species.id}:${variant}`);
          if (!placements || placements.length === 0) return null;
          return (
            <SpeciesGroup
              key={`${species.id}:${variant}`}
              speciesId={species.id}
              visual={species.visual}
              placements={placements}
              isSpecial={Boolean(species.isSpecial)}
              bloom={BLOOM_BY_VARIANT[variant]}
            />
          );
        })
      )}
      <SpecialFlowerAura />
    </group>
  );
}
