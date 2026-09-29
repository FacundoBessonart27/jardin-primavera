# 🌸 Nuestro jardín de primavera

Regalo interactivo de primavera: un jardín romántico japonés en 3D, para
recorrer caminando al atardecer. Empieza con una escena íntima y un
mensaje; al entrar, un camino de tierra y piedras atraviesa canteros de
flores (rosas, tulipanes, girasoles, peonías, lavanda, orquídeas y más),
pasa bajo un túnel de cerezos en flor, cruza un puente sobre el arroyo y
un torii, y llega a un pequeño santuario iluminado al fondo del jardín,
donde un círculo de flores guarda la flor especial.

## El recorrido

| Zona | Qué hay |
|---|---|
| Entrada | Dos cerezos enmarcan el camino, faroles de piedra, tulipanes y un prado de margaritas. |
| Lazos este y oeste | Caminos secundarios de grava con sectores de una especie dominante (lavanda, girasoles, hibiscos, peonías, orquídeas, cosmos, dalias...), bancos y rincones de descanso. |
| Túnel de sakura | Cerezos a ambos lados del camino principal cuyas copas se juntan por encima; pétalos cayendo y sobre el suelo. |
| Arroyo y puente | Puente arqueado bermellón; orillas con piedras. |
| Torii y plaza | El umbral del santuario; plaza empedrada con el círculo de flores y la flor especial en el centro, estanque con nenúfares y bancos. |
| Santuario | Zócalo de piedra con escalinata, salón con shoji iluminados, techo curvo, shimenawa, campana y faroles de papel; luciérnagas y luz cálida. |

Alrededor del valle: colinas con bosque, una línea de árboles brumosa,
montañas lilas, nubes teñidas por el sol, aves lejanas y un cielo de
atardecer (naranja en el horizonte, rosa y magenta, violeta arriba).

El plano completo (caminos, canteros, agua, santuario, props y
colisiones) está en `src/lib/gardenPlan.ts`, y el relieve en
`src/lib/terrain.ts`.

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
    garden/               → Escena 3D: cielo, paisaje, suelo, caminos, agua,
                             santuario, sakuras, props, pasto, flores,
                             partículas, luz/niebla, cámara
    flowers/               → Generador procedural de geometría + showcase 3D
    ui/                    → Pantallas e interfaz (intro, panel de flor,
                             flor especial, pantalla final, música)
  hooks/                  → Calidad gráfica por dispositivo, reduced-motion
  store/                  → Estado global (Zustand)
  animations/             → Timelines de cámara (GSAP)
  lib/                    → Utilidades (sonido en ambientSound.ts, random determinístico, easing,
                             texturas procedurales, control de cámara,
                             basePath.ts para assets en GitHub Pages)
public/
  audio/ambient.mp3       → Música ambiental (loop original de 48 s, reemplazable)
  .nojekyll               → Evita que GitHub Pages ignore la carpeta _next/
next.config.mjs           → output:"export" + basePath/assetPrefix para GH Pages
```

## 🔴 Dónde editar los mensajes personales

Todo el texto editable vive en **un solo archivo**:

```
src/config/giftConfig.ts
```

Ahí podés cambiar: nombre de la persona, textos de la pantalla de apertura,
el hint del jardín, las frases de las flores con mensaje (hay una flor
escondida por cada frase de `hiddenWhispers`, que brilla apenas cuando
alguien pasa cerca), la pista hacia la flor especial, el título/mensaje de
la flor especial, el mensaje final y la música.

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

## Sonido y música

El sonido nunca arranca solo: empieza cuando la persona toca el botón de
entrada al jardín (un gesto del usuario, que es lo que los navegadores
exigen para reproducir audio) y se puede apagar o volver a prender con el
botón "🔊 Sonido" (esquina inferior derecha). Incluye:

- **Música**: `public/audio/ambient.mp3`, un loop ambiental original de
  48 s (compuesto por código para este proyecto, sin problemas de
  licencia). Se reproduce en un único `<audio>` compartido, así que nunca
  suenan dos copias a la vez.
- **Ambiente**: una brisa muy suave y campanitas al descubrir flores,
  generadas en el navegador (Web Audio).

Si el navegador bloquea la reproducción, se reintenta automáticamente en
el siguiente toque o tecla. Para usar otra música, reemplazá
`public/audio/ambient.mp3` por un archivo con licencia adecuada (mismo
nombre) o cambiá `music.src` en `src/config/giftConfig.ts`.

## Controles

- **Computadora**: click para caminar (el mouse queda capturado), WASD o
  flechas para moverse, mouse para mirar, Shift para correr, rueda del
  mouse (o `+`/`-`, `Q`/`E`) para acercar o alejar la vista.
- **Celular**: joystick abajo a la izquierda para caminar, arrastrar el
  resto de la pantalla para mirar, pellizcar con dos dedos para acercar o
  alejar, tocar una flor para descubrirla.

El jugador no puede salir del jardín ni atravesar el agua, los árboles,
los faroles, los bancos ni el santuario (se desliza a lo largo de ellos);
sube el puente y la escalinata siguiendo su altura.

## Rendimiento y calidad gráfica

La app detecta la potencia aproximada del dispositivo (núcleos de CPU,
memoria, tipo de puntero, tamaño de pantalla) y elige automáticamente un
nivel de calidad — **HIGH / MEDIUM / LOW** (`src/lib/quality.ts`). Los tres
niveles muestran el mismo jardín (caminos, canteros, sakuras, puente,
torii, plaza, flor especial y santuario están siempre); lo que cambia es
el **costo de dibujarlo**:

- cantidad de flores (150 a 520), distancia de dibujo y distancia desde
  la que usan su versión liviana;
- radio de pasto alrededor de la cámara, detalle de las copas de sakura,
  pétalos, luciérnagas, árboles lejanos y aves;
- sombras (suaves en HIGH, simples y a 30 Hz en MEDIUM, sin sombras en
  LOW), material de flores sin "sheen" en LOW y resolución máxima (DPR).

Además, `PerformanceMonitor` (de drei) baja la calidad en vivo si detecta
FPS bajos mientras se usa.

Cómo se mantiene liviano:

- **Nivel de detalle por distancia**: las flores lejanas usan una
  geometría ~5 veces más liviana y cada especie de un sector se dibuja en
  una sola malla; los sakuras tienen versión cercana y lejana por zona;
  el pasto sólo se dibuja cerca de la cámara (con borde suave).
- **Menos draw calls**: todo lo repetido o estático va en una sola malla
  (faroles con su luz, bancos, rocas, pasaderas, bosque lejano, nubes,
  hojarasca, nenúfares, torii y faroles de papel junto al santuario;
  halos y charcos de luz en dos mallas; mariposas instanciadas).
- **Sombras baratas**: la sombra del sol acompaña a la cámara y sólo la
  proyectan los objetos cercanos.
- **Sin cálculo por frame innecesario**: el viento del pasto, arbustos,
  copas y mariposas va en shaders; las flores lejanas se animan cada tres
  frames; las luciérnagas se detienen lejos del santuario.
- **Sin tirones**: todos los shaders se compilan al cargar.

Se respeta `prefers-reduced-motion` del sistema operativo, reduciendo el
viento, las animaciones de cámara y las partículas.

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
  variedad real (17 especies + flor especial) sin depender de assets
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
- **Música**: en lugar de un archivo de stock (con posibles dudas de
  licencia) se incluye un loop original generado por código; se puede
  reemplazar por el que prefieras (ver sección de sonido arriba).
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
  en tiempo de ejecución es la música (`/audio/ambient.mp3`), que
  pasa por el helper `withBasePath()` (`src/lib/basePath.ts`) para
  resolver bien en cualquiera de los dos casos. Las tipografías
  (`next/font/google`) y el ícono (`app/icon.svg`) los resuelve Next.js
  automáticamente con el basePath correcto.

## Qué revisar antes de regalarlo

- Editá `src/config/giftConfig.ts` con tus propios textos.
- Si querés, reemplazá `public/audio/ambient.mp3` por tu propia música.
- Probalo en tu celular real (no sólo en la compu) antes de mandarlo.
