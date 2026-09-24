import * as THREE from "three";
import type { FlowerPlacement } from "@/components/garden/fieldLayout";
import { useExperienceStore } from "@/store/experienceStore";
import { sceneUniforms } from "@/lib/sceneUniforms";
import { heightAt } from "@/lib/terrain";

interface RegistryEntry {
  mesh: THREE.InstancedMesh;
  placements: FlowerPlacement[];
}

/**
 * Registro global (fuera de React) de las mallas instanciadas de
 * flores, junto con la lista de posiciones que representa cada
 * instancia. Lo usa el modo de cámara en primera persona (desktop,
 * con el mouse bloqueado) para poder "apuntar" con la mira central
 * de la pantalla: bajo pointer lock, el sistema de eventos normal de
 * React Three Fiber (basado en la posición real del cursor) deja de
 * servir, así que el raycast se hace a mano contra este registro.
 */
const registry: RegistryEntry[] = [];

export function registerFlowerMesh(
  mesh: THREE.InstancedMesh,
  placements: FlowerPlacement[]
) {
  registry.push({ mesh, placements });
}

export function unregisterFlowerMesh(mesh: THREE.InstancedMesh) {
  const index = registry.findIndex((entry) => entry.mesh === mesh);
  if (index !== -1) registry.splice(index, 1);
}

export function getFlowerRegistry(): readonly RegistryEntry[] {
  return registry;
}

/** Selecciona una flor (si ya está revelada), calculando su altura
 * real sobre el terreno. Único punto de entrada usado tanto por el
 * click normal (mouse/touch) como por el click con la mira central
 * en modo caminar con el mouse bloqueado. */
export function trySelectPlacement(placement: FlowerPlacement) {
  if (sceneUniforms.reveal < placement.revealThreshold + 0.15) return;
  const [x, , z] = placement.position;
  useExperienceStore.getState().selectFlower({
    instanceId: placement.id,
    speciesId: placement.speciesId,
    isSpecial: placement.isSpecial,
    position: [x, heightAt(x, z), z],
  });
}

const _raycaster = new THREE.Raycaster();
_raycaster.far = 9;
const _center = new THREE.Vector2(0, 0);
const _point = new THREE.Vector2();

/** Raycast manual contra todas las flores registradas, desde un punto
 * en coordenadas normalizadas de pantalla (NDC, -1..1). Por defecto
 * apunta al centro (la mira, en modo caminar de escritorio con el
 * puntero bloqueado). También lo usa TouchControls para resolver un
 * toque en móvil en la posición real donde se tocó la pantalla. */
export function raycastFlowerAt(
  camera: THREE.Camera,
  ndcX = 0,
  ndcY = 0
): FlowerPlacement | null {
  _point.set(ndcX, ndcY);
  _raycaster.setFromCamera(_point, camera);
  let closest: { placement: FlowerPlacement; distance: number } | null = null;

  for (const entry of registry) {
    const hits = _raycaster.intersectObject(entry.mesh, false);
    if (hits.length === 0) continue;
    const hit = hits[0];
    if (hit.instanceId === undefined) continue;
    if (closest && hit.distance >= closest.distance) continue;
    closest = {
      placement: entry.placements[hit.instanceId],
      distance: hit.distance,
    };
  }

  return closest?.placement ?? null;
}

/** Raycast desde el centro de la pantalla (mira de escritorio). */
export function raycastFlowerAtCrosshair(
  camera: THREE.Camera
): FlowerPlacement | null {
  return raycastFlowerAt(camera, _center.x, _center.y);
}
