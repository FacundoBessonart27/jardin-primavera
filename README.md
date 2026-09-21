# 🌸 Nuestro jardín de primavera

Regalo interactivo de primavera: un pequeño jardín 3D explorable, hecho a
medida. Empieza con una escena íntima y un mensaje, y al entrar revela un
campo lleno de flores (rosas, tulipanes, girasoles, peonías, lavanda,
orquídeas y más) que se pueden tocar para descubrir su significado, ver una
presentación 3D y encontrar una flor especial escondida.

## Stack elegido (y por qué)

| Tecnología | Para qué se usa | Por qué |
|---|---|---|
| **Next.js 14 (App Router) + TypeScript** | Estructura de la app | Arranque rápido, build optimizado, tipado fuerte para no romper nada al editar contenido, y despliegue trivial en Vercel/Netlify. |
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
                             texturas procedurales, control de cámara)
public/
  audio/                  → Música ambiental opcional (ver instrucciones adentro)
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

Para probar el build de producción localmente:

```bash
npm run build
npm run start
```

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

## Cómo publicarlo gratis

La forma más simple es **Vercel** (los creadores de Next.js):

1. Subí este proyecto a un repositorio de GitHub.
2. Entrá a [vercel.com](https://vercel.com), "Add New Project" → importá el
   repo.
3. Vercel detecta Next.js automáticamente. Dejá la configuración por
   defecto y hacé deploy.
4. En 1-2 minutos tenés una URL pública (`tu-proyecto.vercel.app`) para
   compartir.

Alternativas igual de válidas:

- **Netlify**: "Add new site" → "Import an existing project", conectá el
  repo. Netlify también detecta Next.js automáticamente (usa el plugin
  oficial `@netlify/plugin-nextjs`).
- **GitHub Pages**: requiere exportar el sitio como estático
  (`next export` / `output: "export"` en `next.config.mjs`). No lo
  configuré por defecto porque esta app usa rutas dinámicas de Next.js que
  funcionan mejor con Vercel/Netlify, pero si preferís GitHub Pages avisame
  y lo dejo listo.

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

## Qué revisar antes de regalarlo

- Editá `src/config/giftConfig.ts` con tus propios textos.
- Si querés, agregá `public/audio/ambient.mp3`.
- Probalo en tu celular real (no sólo en la compu) antes de mandarlo.
