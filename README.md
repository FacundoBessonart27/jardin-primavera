# 🌸 Nuestro jardín de primavera

Regalo interactivo de primavera: un pequeño jardín 3D explorable, hecho a
medida. Empieza con una escena íntima y un mensaje, y al entrar revela un
campo lleno de flores (rosas, tulipanes, girasoles, peonías, lavanda,
orquídeas y más) que se pueden tocar para descubrir su significado, ver una
presentación 3D y encontrar una flor especial escondida.

## Stack elegido (y por qué)

| Tecnología | Para qué se usa | Por qué |
|---|---|---|
| **Next.js 14 (App Router) + TypeScript** | Estructura de la app | Arranque rápido, build optimizado, tipado fuerte para no romper nada al editar contenido. Configurado con `output: "export"` para generar un sitio 100% estático publicable en GitHub Pages. |
| **React Three Fiber + Three.js** | El jardín 3D (cielo, pasto, flores, mariposas, pétalos) | Permite construir toda la escena de forma declarativa en React sin perder control fino sobre geometría y rendimiento (instancing, shaders). |
| **@react-three/drei** | Utilidades de R3F | `OrbitControls`, `PerformanceMonitor`, helpers que evitan reinventar la rueda. |
| **GSAP** | Transición de cámara (pantalla 1 → jardín, foco en flor, finale) | El motor de animación más confiable para secuencias de cámara con timelines complejos, fuera del ciclo de render de React. |
| **Framer Motion** | Animaciones de la interfaz (textos, paneles, botones) | Transiciones de entrada/salida declarativas, fáciles de mantener, con buen soporte de accesibilidad. |
| **Zustand** | Estado global de la experiencia (fase, flor seleccionada, etc.) | Muy liviano, sin boilerplate, ideal para un proyecto de este tamaño. |
| **Tailwind CSS** | Estilos de interfaz | Permite iterar rápido en un diseño mobile-first consistente. |

**No se usaron modelos 3D externos (GLTF/GLB).** Todas las flores se generan
**proceduralmente** combinando geometría de Three.js (pétalos curvos
paramétricos + centro + tallo + hojas), horneadas en una única geometría por
especie y dibujadas con `InstancedMesh` para que el campo entero (hasta ~260
flores) se renderice en muy pocos draw calls. Esto evita problemas de
licencia de assets, mantiene el tamaño de la descarga mínimo y permite que
cada especie tenga forma, color y comportamiento propios. Ver el punto
"Alternativas" más abajo para más detalle.

## Estructura del proyecto

```
.github/
  workflows/deploy-gh-pages.yml → Build + deploy automático a GitHub Pages
src/
  app/                    → Next.js App Router (layout, page, estilos globales)
  config/giftConfig.ts    → 🔴 TEXTOS PERSONALES (ver abajo)
  data/flowers.ts         → 🔴 CATÁLOGO DE FLORES (visual + contenido)
  components/
    garden/               → Escena 3D: cielo, suelo, pasto, nubes, mariposas,
                             pétalos, campo de flores, cámara
    flowers/               → Generador procedural de geometría + showcase 3D
    ui/                    → Pantallas e interfaz (intro, panel de flor,
                             flor especial, pantalla final, música)
  hooks/                  → Calidad gráfica por dispositivo, reduced-motion, audio
  store/                  → Estado global (Zustand)
  animations/             → Timelines de cámara (GSAP)
  lib/                    → Utilidades (random determinístico, easing,
                             texturas procedurales, control de cámara,
                             basePath.ts para assets en GitHub Pages)
public/
  audio/                  → Música ambiental opcional (ver instrucciones adentro)
  .nojekyll               → Evita que GitHub Pages ignore la carpeta _next/
next.config.mjs           → output:"export" + basePath/assetPrefix para GH Pages
```

## 🔴 Dónde editar los mensajes personales

Todo el texto editable vive en **un solo archivo**:

```
src/config/giftConfig.ts
```

Ahí podés cambiar: nombre de la persona, textos de la pantalla de apertura,
el hint del jardín, las frases sutiles que aparecen al explorar flores, el
título/mensaje de la flor especial, el mensaje final y la música.

La información de cada flor (nombre, significado, descripción, frase
romántica) vive en:

```
src/data/flowers.ts
```

Cada especie tiene su bloque `content` (texto) separado de su bloque
`visual` (color, forma, tamaño), para que sea fácil de editar sin tocar la
parte 3D. La flor especial es el bloque con `id: "flor-especial"` al final
del archivo.

## Cómo ejecutarlo localmente

Requisitos: Node.js 18.18+ (probado con Node 22).

```bash
npm install
npm run dev
```

Abrí `http://localhost:3000`. Cambios en `giftConfig.ts` o `flowers.ts` se
reflejan al instante (hot reload).

Para probar el **export estático** (el mismo que se publica en GitHub
Pages) de forma local:

```bash
npm run build:gh-pages   # genera ./out con basePath /jardin-primavera/
npm run serve            # sirve ./out en http://localhost:3000
```

Como el export local se sirve con basePath, abrí
`http://localhost:3000/jardin-primavera/` (con la barra final).

`npm run build` (sin `:gh-pages`) también genera un export estático en
`./out`, pero sin basePath — útil para revisar que el build compila bien
sin tener que simular la ruta de GitHub Pages.

## Música ambiental

El botón "🔊 Música" (esquina inferior derecha) nunca reproduce sonido por
su cuenta. Para agregar tu propia pista:

1. Conseguí un archivo con licencia adecuada para uso personal.
2. Guardalo como `public/audio/ambient.mp3`.
3. Listo — el botón la activa/pausa al tocarlo. Si el archivo no existe, la
   experiencia sigue funcionando normalmente, simplemente no suena nada.

## Rendimiento y calidad gráfica

La app detecta la potencia aproximada del dispositivo (núcleos de CPU,
memoria, tipo de puntero, tamaño de pantalla) y elige automáticamente un
nivel de calidad — **HIGH / MEDIUM / LOW** (`src/lib/quality.ts`) — que
ajusta:

- Cantidad de flores instanciadas (90 a 260)
- Cantidad de mechones de pasto (800 a 4000)
- Cantidad de pétalos flotando y mariposas
- Resolución de píxeles (DPR) máxima
- Sombras activadas o no

Además, `PerformanceMonitor` (de drei) baja la calidad en vivo si detecta
FPS bajos mientras se usa. El pasto se anima con un shader en GPU (sin tocar
React en cada frame) y las flores usan `InstancedMesh`, así que el campo
completo se dibuja en un puñado de draw calls sin importar cuántas flores
haya. Se respeta `prefers-reduced-motion` del sistema operativo, reduciendo
el viento, las animaciones de cámara y las partículas.

## Cómo publicarlo en GitHub Pages

El proyecto está configurado como **sitio 100% estático** (`output: "export"`
en `next.config.mjs`) y trae un workflow de GitHub Actions
(`.github/workflows/deploy-gh-pages.yml`) que hace el build y el deploy
automáticamente en cada push a `main`. No hace falta ningún build manual ni
subir la carpeta `out/` a mano.

### 1. Habilitar GitHub Pages en el repositorio

1. Entrá al repositorio en GitHub: `https://github.com/<tu-usuario>/jardin-primavera`.
2. Andá a **Settings** → **Pages** (menú lateral izquierdo, dentro de "Code and automation").
3. En **"Build and deployment" → "Source"**, seleccioná **"GitHub Actions"**
   (no "Deploy from a branch"). Con esto alcanza — no hace falta elegir
   ninguna branch ni carpeta ahí, el workflow se encarga de todo.

### 2. Hacer el deploy

1. Hacé push (o mergeá un Pull Request) a la rama `main`.
2. Andá a la pestaña **Actions** del repositorio y vas a ver corriendo el
   workflow **"Deploy a GitHub Pages"**. Tiene dos jobs: `build` (instala
   dependencias y genera el export estático) y `deploy` (lo publica).
3. Cuando el job `deploy` termina en verde, el sitio ya está publicado.
   También podés disparar el deploy a mano desde
   **Actions → Deploy a GitHub Pages → Run workflow** (sirve para
   republicar sin necesidad de un nuevo commit).

### 3. Acceder al sitio publicado

Como el repositorio se llama `jardin-primavera` (un repo, no el especial
`<usuario>.github.io`), GitHub Pages lo publica como **project site** en:

```
https://<tu-usuario>.github.io/jardin-primavera/
```

Reemplazá `<tu-usuario>` por el usuario u organización dueño del
repositorio (a partir del remoto de este repo, sería
`https://facundobessonart27.github.io/jardin-primavera/` — confirmalo en
**Settings → Pages**, GitHub muestra ahí la URL exacta una vez que el
primer deploy termina).

> La barra final (`/`) importa: `next.config.mjs` tiene `trailingSlash: true`
> justamente para que las rutas funcionen bien en GitHub Pages.

### Cómo funciona el basePath

Este proyecto vive en `https://<usuario>.github.io/jardin-primavera/`, es
decir, **no** en la raíz del dominio. Por eso `next.config.mjs` configura:

```js
basePath: "/jardin-primavera"      // sólo cuando GITHUB_PAGES=true
assetPrefix: "/jardin-primavera/"  // ídem
```

El workflow de GitHub Actions setea `GITHUB_PAGES=true` antes de correr
`npm run build`, así que **no tenés que hacer nada manualmente**: el mismo
código sirve tanto en local (`npm run dev`, sin basePath) como publicado
(con basePath). Si alguna vez renombrás el repositorio, actualizá la
constante `REPO_NAME` al principio de `next.config.mjs`.

### Otras plataformas

A pedido, este proyecto está configurado **específicamente y únicamente**
para GitHub Pages. Si en el futuro preferís Vercel o Netlify, el mismo
código funciona ahí también (esas plataformas no necesitan basePath porque
sirven desde la raíz del dominio) — avisame y ajusto la configuración.

## Alternativas y decisiones de diseño

- **Flores procedurales en vez de modelos 3D descargados**: para lograr
  variedad real (12 especies + flor especial) sin depender de assets
  externos de licencia incierta ni inflar el peso de la página, cada flor
  se construye combinando geometría paramétrica (pétalos curvos, centro,
  tallo, hojas) en Three.js puro. Es una solución híbrida: no son modelos
  hiperrealistas, pero tienen forma, color y proporciones propias por
  especie, se ven bien en movimiento, y permiten renderizar el campo entero
  con excelente rendimiento incluso en celulares de gama media.
- **Un único `<Canvas>` persistente**: la pantalla de apertura y el jardín
  comparten la misma escena 3D (la cámara simplemente viaja de una posición
  a otra), así no hay una recarga entre "pantalla 1" y "el jardín" — es
  una sola experiencia continua, como pediste.
- **Música**: no incluí un archivo de audio de stock para evitar cualquier
  duda de licencia; la estructura queda lista para que agregues el que
  prefieras (ver sección de música arriba).
- **`npm run start` no existe**: con `output: "export"` no hay servidor
  Next.js corriendo en producción (todo es HTML/JS/CSS estático), así que
  `next start` no aplica. Para previsualizar el resultado final localmente
  usá `npm run build:gh-pages && npm run serve` (ver "Cómo ejecutarlo
  localmente").
- **Assets y basePath**: todas las flores, el cielo, las nubes, las
  mariposas y los pétalos se generan por código (geometría y texturas de
  canvas en tiempo de ejecución), así que no dependen de ninguna ruta de
  archivo — funcionan igual sirviendo desde `/` o desde
  `/jardin-primavera/`. El único archivo estático que el código referencia
  en tiempo de ejecución es la música opcional (`/audio/ambient.mp3`), que
  pasa por el helper `withBasePath()` (`src/lib/basePath.ts`) para
  resolver bien en cualquiera de los dos casos. Las tipografías
  (`next/font/google`) y el ícono (`app/icon.svg`) los resuelve Next.js
  automáticamente con el basePath correcto.

## Qué revisar antes de regalarlo

- Editá `src/config/giftConfig.ts` con tus propios textos.
- Si querés, agregá `public/audio/ambient.mp3`.
- Probalo en tu celular real (no sólo en la compu) antes de mandarlo.
