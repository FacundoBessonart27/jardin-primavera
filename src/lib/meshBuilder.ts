import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Pequeño "kit de construcción" para armar props (faroles, bancos, el
 * santuario, el torii...) juntando primitivas de Three.js en UNA sola
 * geometría con color por vértice: cada prop termina siendo una malla
 * (o una malla instanciada) en vez de decenas de objetos sueltos.
 */
export class MeshBuilder {
  private parts: THREE.BufferGeometry[] = [];

  /** Agrega una geometría ya posicionada, pintada de un color. */
  add(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, matrix?: THREE.Matrix4): this {
    let geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    if (matrix) geo.applyMatrix4(matrix);
    geo.deleteAttribute("uv");
    if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    const c = new THREE.Color(color);
    const count = geo.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    // Normaliza a (position, normal, color) para poder unir todo.
    for (const name of Object.keys(geo.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "color") geo.deleteAttribute(name);
    }
    geo = geo.index ? geo.toNonIndexed() : geo;
    this.parts.push(geo);
    return this;
  }

  /** Agrega una geometría que ya trae su propio color por vértice. */
  addWithColors(geometry: THREE.BufferGeometry): this {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    for (const name of Object.keys(geo.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "color") geo.deleteAttribute(name);
    }
    this.parts.push(geo);
    return this;
  }

  /** Caja centrada en (x, y, z) con rotación Y opcional. */
  box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    rotY = 0,
    rotX = 0,
    rotZ = 0
  ): this {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, "YXZ")),
      new THREE.Vector3(1, 1, 1)
    );
    return this.add(new THREE.BoxGeometry(w, h, d), color, m);
  }

  /** Cilindro vertical con base en y0. */
  cylinder(
    rTop: number,
    rBottom: number,
    h: number,
    x: number,
    y0: number,
    z: number,
    color: THREE.ColorRepresentation,
    sides = 8
  ): this {
    const m = new THREE.Matrix4().makeTranslation(x, y0 + h / 2, z);
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, sides), color, m);
  }

  sphere(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, sx = 1, sy = 1, sz = 1): this {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion(),
      new THREE.Vector3(sx, sy, sz)
    );
    return this.add(new THREE.SphereGeometry(r, 10, 8), color, m);
  }

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  build(): THREE.BufferGeometry {
    const joined = mergeGeometries(this.parts, false) ?? new THREE.BufferGeometry();
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    // Une vértices idénticos (misma posición, normal y color): menos
    // trabajo de vértices sin cambiar el aspecto.
    const merged = mergeVertices(joined, 1e-4);
    joined.dispose();
    merged.computeBoundingSphere();
    return merged;
  }
}
