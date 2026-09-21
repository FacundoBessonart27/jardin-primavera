/**
 * Espejo, en el código de cliente, del `basePath` configurado en
 * next.config.mjs. Necesario porque Next.js sólo reescribe basePath
 * automáticamente en next/link, next/image y next/script: cualquier
 * ruta a un archivo de /public armada "a mano" (audio, por ejemplo)
 * tiene que pasar por acá para funcionar tanto en local (basePath "")
 * como publicada en GitHub Pages (basePath "/jardin-primavera").
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Antepone el basePath actual a una ruta absoluta de /public (ej: "/audio/ambient.mp3"). */
export function withBasePath(path: string): string {
  if (!BASE_PATH) return path;
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}
