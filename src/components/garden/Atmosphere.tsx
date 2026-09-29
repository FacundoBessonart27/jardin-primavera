"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { HORIZON_HAZE, SUN_COLOR, SUN_DIRECTION } from "@/lib/sun";
import { PLAZA } from "@/lib/gardenPlan";

/** Mitad del lado del área con sombras (se mueve con la cámara). */
const SHADOW_HALF = 20;

const _center = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _lightRight = new THREE.Vector3();
const _lightUp = new THREE.Vector3();

const FINALE_HAZE = new THREE.Color("#f1a98a");
const AMBIENT_BASE = new THREE.Color("#ffd9c0");
const AMBIENT_SHRINE = new THREE.Color("#ffc9a0");

/**
 * Luz, niebla y "clima" de la escena:
 *  - un sol bajo y dorado (ver lib/sun) cuya sombra acompaña a la
 *    cámara: el mapa de sombras cubre sólo lo que se ve de cerca, con
 *    el mismo costo en cualquier punto del jardín (y ajustado a la
 *    grilla de texels para que las sombras no "tiemblen" al caminar);
 *  - luz de cielo (hemisférica) rosada/violeta y un relleno frío suave;
 *  - niebla del color del horizonte, que da profundidad atmosférica;
 *  - al acercarse al santuario, la luz se vuelve apenas más cálida.
 */
export function Atmosphere({ shadows, highQuality }: { shadows: boolean; highQuality: boolean }) {
  const { scene } = useThree();
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const fog = useMemo(() => new THREE.Fog(HORIZON_HAZE.clone(), 24, 170), []);
  const mapSize = highQuality ? 2048 : 1024;

  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);

  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    scene.add(light.target);
    const cam = light.shadow.camera;
    cam.left = -SHADOW_HALF;
    cam.right = SHADOW_HALF;
    cam.top = SHADOW_HALF;
    cam.bottom = -SHADOW_HALF;
    cam.near = 1;
    cam.far = 120;
    cam.updateProjectionMatrix();
    return () => {
      scene.remove(light.target);
    };
  }, [scene]);

  useFrame(({ camera }) => {
    const light = lightRef.current;
    if (!light) return;
    // Centro de la zona con sombra: un poco por delante de la cámara.
    camera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() > 1e-6) _forward.normalize();
    _center.set(camera.position.x, 0, camera.position.z).addScaledVector(_forward, SHADOW_HALF * 0.45);

    // Ajuste a la grilla de texels del mapa de sombras (en el plano de la luz).
    const texel = (SHADOW_HALF * 2) / mapSize;
    _lightRight.crossVectors(SUN_DIRECTION, THREE.Object3D.DEFAULT_UP).normalize();
    _lightUp.crossVectors(_lightRight, SUN_DIRECTION).normalize();
    const r = Math.round(_center.dot(_lightRight) / texel) * texel;
    const u = Math.round(_center.dot(_lightUp) / texel) * texel;
    const f = _center.dot(SUN_DIRECTION);
    _center.copy(_lightRight).multiplyScalar(r).addScaledVector(_lightUp, u).addScaledVector(SUN_DIRECTION, f);

    light.target.position.copy(_center);
    light.position.copy(_center).addScaledVector(SUN_DIRECTION, 60);
    light.target.updateMatrixWorld();

    // Zona final: más cálida a medida que uno se acerca a la plaza.
    const d = Math.hypot(camera.position.x - PLAZA.x, camera.position.z - PLAZA.z);
    const near = 1 - THREE.MathUtils.smoothstep(d, 8, 22);
    fog.color.copy(HORIZON_HAZE).lerp(FINALE_HAZE, near * 0.6);
    if (ambientRef.current) {
      ambientRef.current.color.copy(AMBIENT_BASE).lerp(AMBIENT_SHRINE, near);
      ambientRef.current.intensity = 0.42 + near * 0.12;
    }
    if (hemiRef.current) hemiRef.current.intensity = 0.62 + near * 0.1;
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.42} color={AMBIENT_BASE} />
      <hemisphereLight ref={hemiRef} color="#ffb7a6" groundColor="#2a4a36" intensity={0.62} />
      <directionalLight
        ref={lightRef}
        intensity={1.75}
        color={SUN_COLOR}
        castShadow={shadows}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* Relleno tenue y frío desde el lado opuesto al sol. */}
      <directionalLight position={[8, 6, 10]} intensity={0.28} color="#b9a4ff" />
    </>
  );
}
