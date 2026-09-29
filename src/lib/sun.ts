import * as THREE from "three";

/**
 * El sol del atardecer: bajo, hacia el noroeste, casi detrás del
 * santuario. Caminar por el jardín es caminar hacia la puesta de sol,
 * con los árboles y las flores iluminados a contraluz lateral.
 *
 * Una sola fuente de verdad para el cielo (disco y resplandor), la luz
 * direccional con sombras, la translucidez de los pétalos y hacia
 * dónde miran las flores que siguen al sol.
 */
export const SUN_DIRECTION = new THREE.Vector3(-0.62, 0.36, -0.7).normalize();

/** Color de la luz directa (cálida, dorada). */
export const SUN_COLOR = new THREE.Color("#ffc98a");

/** Color de la bruma del horizonte: el mismo que usan la niebla y el
 * borde inferior del cielo, para que lo lejano se funda sin cortes. */
export const HORIZON_HAZE = new THREE.Color("#eaa189");
