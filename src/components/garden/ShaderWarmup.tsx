"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/**
 * Compila todos los shaders de la escena de una vez, al cargar (detrás
 * de la pantalla de carga). Sin esto, cada material se compila la
 * primera vez que aparece en pantalla, y en un celular eso se siente
 * como un tirón al caminar (por ejemplo, al ver el santuario por
 * primera vez).
 */
export function ShaderWarmup() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    gl.compile(scene, camera);
  }, [gl, scene, camera]);
  return null;
}
