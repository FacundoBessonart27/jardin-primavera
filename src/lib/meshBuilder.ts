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

  /** Agrega una geometría ya posicionada, pintada de un color. `glow`
   * (0..1) la hace brillar con luz propia (ver createGlowLambert). */
  add(
    geometry: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    matrix?: THREE.Matrix4,
    glow = 0
  ): this {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    if (matrix) geo.applyMatrix4(matrix);
    if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    const c = new THREE.Color(color);
    const count = geo.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.push(geo, glow);
    return this;
  }

  /**
   * Agrega una geometría que ya trae su propio color por vértice, con
   * una transformación y un tinte opcionales (así un mismo modelo se
   * "planta" muchas veces en una sola malla estática).
   */
  addWithColors(
    geometry: THREE.BufferGeometry,
    options: { matrix?: THREE.Matrix4; tint?: THREE.Color; glow?: number } = {}
  ): this {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (options.matrix) geo.applyMatrix4(options.matrix);
    if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    if (options.tint) {
      const colors = geo.getAttribute("color") as THREE.BufferAttribute;
      for (let i = 0; i < colors.count; i++) {
        colors.setXYZ(
          i,
          colors.getX(i) * options.tint.r,
          colors.getY(i) * options.tint.g,
          colors.getZ(i) * options.tint.b
        );
      }
    }
    this.push(geo, options.glow);
    return this;
  }

  /** Normaliza a (position, normal, color, aGlow) para poder unir todo.
   * Si no se indica `glow`, se conserva el brillo que ya traiga la pieza. */
  private push(geo: THREE.BufferGeometry, glow?: number) {
    for (const name of Object.keys(geo.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "color" && name !== "aGlow") {
        geo.deleteAttribute(name);
      }
    }
    const count = geo.getAttribute("position").count;
    if (glow !== undefined || !geo.getAttribute("aGlow")) {
      geo.setAttribute("aGlow", new THREE.BufferAttribute(new Float32Array(count).fill(glow ?? 0), 1));
    }
    this.parts.push(geo);
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

/**
 * Material Lambert con color por vértice que además hace brillar (luz
 * propia, sin iluminación) las partes marcadas con `aGlow` — por ejemplo
 * la ventana de un farol o un farol de papel — dentro de la MISMA malla
 * que el resto del prop: un draw call en vez de dos.
 */
export function createGlowLambert(
  glowColor: THREE.Color,
  params: THREE.MeshLambertMaterialParameters = {}
): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...params });
  const uniform = { value: glowColor };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowColor = uniform;
    shader.vertexShader = `attribute float aGlow;\nvarying float vGlow;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n  vGlow = aGlow;"
    );
    shader.fragmentShader = `uniform vec3 uGlowColor;\nvarying float vGlow;\n${shader.fragmentShader}`.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n  totalEmissiveRadiance += vGlow * uGlowColor * vColor.rgb;"
    );
  };
  return mat;
}
