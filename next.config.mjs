/**
 * Configuración de Next.js preparada para publicar como sitio estático
 * en GitHub Pages, en:
 *   https://<tu-usuario>.github.io/jardin-primavera/
 *
 * El basePath sólo se activa cuando GITHUB_PAGES=true (lo setea el
 * workflow de .github/workflows/deploy-gh-pages.yml). Así:
 *   - `npm run dev` / `npm run build` locales siguen sirviendo desde "/"
 *   - el build que se publica en GitHub Pages sirve desde "/jardin-primavera/"
 *
 * Si alguna vez renombrás el repositorio, actualizá REPO_NAME acá abajo.
 */
const REPO_NAME = "jardin-primavera";
const isGithubPagesBuild = process.env.GITHUB_PAGES === "true";
const basePath = isGithubPagesBuild ? `/${REPO_NAME}` : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },

  // --- Static export para GitHub Pages ---
  output: "export",
  // GitHub Pages sirve cada ruta como carpeta/index.html; trailingSlash
  // evita 404s al navegar directamente a una URL.
  trailingSlash: true,
  // GitHub Pages no soporta el optimizador de imágenes de Next.js (necesita
  // un servidor). No usamos next/image en este proyecto, pero se deja
  // desactivado por las dudas.
  images: {
    unoptimized: true,
  },

  basePath,
  assetPrefix: isGithubPagesBuild ? `/${REPO_NAME}/` : undefined,

  // Expone el mismo basePath al código de cliente (ver src/lib/basePath.ts)
  // para poder armar a mano rutas a archivos de /public (audio, etc.),
  // ya que Next sólo reescribe automáticamente basePath en next/link,
  // next/image y next/script.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
