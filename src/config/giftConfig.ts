/**
 * ============================================================
 *  CONFIGURACIÓN DEL REGALO — Editá este archivo libremente
 * ============================================================
 * Todo el contenido personal (nombres, mensajes, frases) vive
 * acá. No hace falta tocar ningún otro archivo del proyecto
 * para cambiar el texto de la experiencia.
 */

export const giftConfig = {
  /** Nombre de la persona que recibe el regalo. */
  recipientName: "Mi amor",

  /** Texto que aparece primero, muy suave, arriba del título. */
  openingKicker: "Para la persona que hace que mis días florezcan…",

  /** Título principal de la primera pantalla. */
  openingTitle: "Feliz Primavera, mi amor",

  /** Subtítulo / bajada, debajo del título. */
  openingSubtitle:
    "Preparé un pequeño jardín para vos. Cada flor tiene una razón para estar acá.",

  /** Texto del botón para entrar a la experiencia. */
  enterButtonLabel: "Entrar a nuestro jardín 🌸",

  /** Texto que se muestra mientras carga la escena 3D. */
  loadingLabel: "Preparando los pétalos…",

  /** Pequeño texto de ayuda que aparece al entrar al jardín. */
  gardenHint: "Tocá una flor para descubrirla ✨",

  /**
   * Flores con mensaje: hay una flor escondida en el jardín por cada
   * frase de esta lista (entre 5 y 7 es lo ideal). Son flores comunes,
   * repartidas lejos unas de otras, que brillan apenas cuando alguien
   * pasa cerca. Al abrirlas muestran el título y su frase. Podés
   * cambiar, agregar o quitar frases libremente.
   */
  hiddenWhispers: [
    "Esta me hizo pensar en vos.",
    "Hay flores bonitas, y después estás vos.",
    "Esta no es mi favorita, pero se acerca.",
    "Creo que encontré otra razón para sonreír.",
    "¿Sabías que todavía no encontré una flor tan bonita como vos?",
    "Cada primavera me acuerda un poco más a vos.",
  ],

  /** Título que acompaña la frase de una flor con mensaje. */
  messageFlowerTitle: "Encontraste una flor especial 🌸",

  /**
   * Pista suave que aparece (una sola vez, dentro del panel de una flor
   * con mensaje) cuando ya se encontraron varias y todavía falta la flor
   * especial. Dejalo vacío ("") para no mostrar ninguna pista.
   */
  specialFlowerNudge: "Dicen que en algún rincón hay una flor que brilla distinto…",

  /** Identificador de la flor especial (debe existir en data/flowers.ts). */
  specialFlowerId: "flor-especial",

  /** Título que aparece al encontrar la flor especial. */
  specialFlowerTitle: "Encontraste la flor especial",

  /** Mensaje personal largo que aparece junto a la flor especial. */
  specialFlowerMessage: [
    "Entre todas las flores de este jardín,",
    "hay una que siempre va a ser mi favorita.",
    "",
    "Vos.",
  ],

  /** Texto del botón final dentro del panel de la flor especial. */
  specialFlowerButtonLabel: "Te amo ❤️",

  /** Título de la pantalla final, después de presionar el botón. */
  finalTitle: "Feliz Primavera, mi amor ❤️",

  /** Mensaje final, personalizable. */
  finalMessage:
    "Espero que este pequeño jardín te recuerde, aunque sea un poquito, lo mucho que te quiero.",

  /** Firma opcional al pie de la pantalla final. */
  finalSignature: "Con todo mi cariño.",

  /** Texto para volver a recorrer el jardín desde la pantalla final. */
  finalReplayLabel: "Volver a recorrer el jardín",

  /**
   * Sonido (nunca arranca solo): se enciende al tocar "entrar" al
   * jardín y se puede apagar/prender con el botón de sonido. Incluye la
   * música de este archivo y un ambiente suave generado en el navegador
   * (brisa y campanitas al descubrir flores).
   */
  music: {
    /** Ruta del archivo de audio dentro de /public (debe existir). Podés reemplazarlo. */
    src: "/audio/ambient.mp3",
    /** Volumen inicial (0 a 1). */
    volume: 0.35,
    /** Etiqueta del botón de sonido. */
    label: "Sonido",
  },
} as const;

export type GiftConfig = typeof giftConfig;
