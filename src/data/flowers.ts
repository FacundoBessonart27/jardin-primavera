/**
 * ============================================================
 *  CATÁLOGO DE FLORES
 * ============================================================
 * Cada especie tiene dos partes bien separadas:
 *
 *  - `visual`  → todo lo que define su geometría 3D (forma,
 *                colores, tamaño, cantidad de pétalos, etc).
 *  - `content` → todo el texto editable (nombre, significado,
 *                descripción y frase romántica).
 *
 * Para agregar una flor nueva alcanza con copiar un bloque y
 * cambiar los valores. `petalShape` controla qué variante del
 * generador procedural (src/components/flowers/flowerGeometry.ts)
 * se usa para construir los pétalos.
 */

export type PetalShape =
  | "round" // pétalos obovados de punta redondeada, tipo rosa/peonía
  | "pointed" // pétalos ovados de punta aguda, tipo tulipán/dalia
  | "thin" // lígulas angostas en forma de cinta, tipo margarita/girasol
  | "trumpet" // pétalos anchos en abanico, tipo hibisco
  | "cluster" // muchas florcitas pequeñas en espiga, tipo lavanda/jacinto
  | "ruffled" // pétalos ondulados, tipo orquídea
  | "fringed" // pétalos en cuña con borde aserrado, tipo clavel
  | "dome" // muchas florcitas en forma de domo/bola, tipo hortensia
  | "recurved" // tépalos lanceolados que se curvan hacia atrás, tipo lirio
  | "notched" // pétalos anchos con la punta dentada, tipo cosmos
  | "star"; // ramillete de florcitas estrelladas, tipo jazmín

/** Forma y disposición de las hojas: cambia mucho la silueta de la
 * planta aunque la flor sea parecida. */
export type LeafStyle =
  | "broad" // hojas ovaladas alternas a lo largo del tallo (rosa, girasol)
  | "narrow" // hojas lanceoladas finas, más numerosas (lirio, clavel)
  | "strap" // hojas largas en cinta que nacen de la base (tulipán, jacinto)
  | "feathery"; // hojas muy divididas, casi como agujas (cosmos)

export interface FlowerVisual {
  petalShape: PetalShape;
  /** Color principal de los pétalos. */
  petalColor: string;
  /** Color secundario, usado como degradé o en pétalos internos. */
  petalColorAlt: string;
  /** Color del centro / estambres. */
  centerColor: string;
  /** Color del tallo y hojas. */
  stemColor: string;
  petalCount: number;
  /** Cantidad de capas de pétalos (1 = simple, 2-3 = flores más llenas). */
  layers: number;
  /** Escala general de la flor (1 = tamaño base). */
  scale: number;
  /** Altura del tallo, en unidades de escena. */
  stemHeight: number;
  /** Variación de color entre instancias del mismo tipo (0 a 1). Cuanto
   * más alta, más se nota la diferencia de tono entre flores vecinas. */
  colorVariance: number;
  /** Multiplicador del tamaño del centro (0 lo oculta). Por defecto 1. */
  centerScale?: number;
  /** Forma del centro: "sphere" (bocha, por defecto) o "disc" (disco
   * compacto de florecitas, tipo margarita/caléndula/girasol). */
  centerShape?: "sphere" | "disc";
  /** Estambres largos y visibles saliendo del centro (ej: lirio). */
  stamens?: {
    count: number;
    /** Largo relativo a la escala de la flor. */
    length: number;
    filamentColor: string;
    antherColor: string;
    /** Anteras agrupadas sobre una columna central en vez de filamentos
     * sueltos (ej: hibisco). */
    column?: boolean;
  };
  /** Cuánto se inclina la cara de la flor respecto de la vertical, en
   * radianes (0 = mira al cielo, ~1 = mira de costado como un girasol). */
  headTilt?: number;
  /** Multiplicador del ancho de los pétalos respecto de su forma base. */
  petalWidth?: number;
  /** Multiplicador de la concavidad transversal de los pétalos. */
  petalCup?: number;
  /** Multiplicador del ángulo de apertura de la flor abierta (<1 = más plana). */
  petalOpen?: number;
  /** Multiplicador de la curvatura a lo largo del pétalo. */
  petalCurl?: number;
  /** Cuánto más cerradas quedan las capas internas (sobrescribe la forma). */
  petalClosure?: number;
  /** Multiplicador del grosor del tallo. */
  stemWidth?: number;
  /** Profundidad de la muesca central en la punta del pétalo (ej: cerezo). */
  petalNotch?: number;
  /** Pétalo inferior más grande y de otro color, tipo labelo de orquídea. */
  lip?: boolean;
  /** Estilo de hojas (por defecto "broad"). */
  leafStyle?: LeafStyle;
  /** Multiplicador del tamaño de las hojas. */
  leafScale?: number;
  /** Multiplicador del largo del cáliz (ej: el tubo largo del clavel). */
  calyxLength?: number;
  /** Cantidad de tallos por planta (matas de lavanda, jazmín). Por defecto 1. */
  clump?: number;
}

export interface FlowerContent {
  name: string;
  emoji: string;
  meaning: string;
  description: string;
  romanticLine: string;
}

export interface FlowerSpecies {
  id: string;
  visual: FlowerVisual;
  content: FlowerContent;
  /** Peso relativo de aparición en el campo (mayor = más frecuente). */
  fieldWeight: number;
  /** Si es true, sólo aparece una vez y es la flor especial del jardín. */
  isSpecial?: boolean;
  /** Flor chica que se usa para rellenar huecos alrededor de las demás. */
  filler?: boolean;
  /** 0..1: cuánto tienden los ejemplares a mirar hacia el sol (1 = todos
   * orientados igual, como un campo de girasoles). */
  sunFacing?: number;
}

export const flowerSpecies: FlowerSpecies[] = [
  {
    id: "rosa",
    fieldWeight: 11,
    visual: {
      petalShape: "round",
      petalColor: "#e0264f",
      petalColorAlt: "#ff5c82",
      centerColor: "#7a1030",
      stemColor: "#2c6b47",
      petalCount: 16,
      layers: 3,
      scale: 0.95,
      stemHeight: 1.1,
      colorVariance: 0.08,
      centerScale: 0.45,
      headTilt: 0.28,
      petalWidth: 1.05,
      leafStyle: "broad",
      leafScale: 0.9,
    },
    content: {
      name: "Rosa",
      emoji: "🌹",
      meaning: "Amor, pasión y belleza.",
      description:
        "Una de las flores más conocidas del mundo, asociada desde hace siglos con el amor y la expresión de sentimientos profundos.",
      romanticLine:
        "Si tuviera que elegir una flor para compararte, probablemente no podría elegir una sola.",
    },
  },
  {
    id: "tulipan",
    fieldWeight: 8,
    visual: {
      petalShape: "pointed",
      petalColor: "#ff5470",
      petalColorAlt: "#ff7a8e",
      centerColor: "#c92a4a",
      stemColor: "#2f7a4d",
      // 3 tépalos externos + 3 internos intercalados: la copa típica.
      petalCount: 6,
      layers: 2,
      scale: 0.85,
      stemHeight: 1.05,
      colorVariance: 0.15,
      centerScale: 0.3,
      headTilt: 0.06,
      petalWidth: 1.25,
      petalCup: 1.6,
      leafStyle: "strap",
      leafScale: 1.2,
    },
    content: {
      name: "Tulipán",
      emoji: "🌷",
      meaning: "Amor perfecto y sincero.",
      description:
        "Elegante y simple a la vez, el tulipán florece apenas empieza la primavera, como una pequeña promesa que se cumple cada año.",
      romanticLine: "Con vos, hasta lo simple se siente perfecto.",
    },
  },
  {
    id: "girasol",
    fieldWeight: 4,
    sunFacing: 1,
    visual: {
      petalShape: "thin",
      petalColor: "#ffcc33",
      petalColorAlt: "#ffb703",
      centerColor: "#4a2e12",
      stemColor: "#3f8c3f",
      petalCount: 30,
      layers: 2,
      scale: 1.15,
      stemHeight: 1.7,
      colorVariance: 0.05,
      centerScale: 2.3,
      centerShape: "disc",
      headTilt: 1.0,
      petalWidth: 1.9,
      leafStyle: "broad",
      leafScale: 1.6,
      stemWidth: 1.9,
    },
    content: {
      name: "Girasol",
      emoji: "🌻",
      meaning: "Admiración, lealtad y alegría.",
      description:
        "Siempre gira buscando la luz del sol, igual que vos iluminás cualquier lugar en el que estás.",
      romanticLine: "No sé si el girasol sigue al sol o si el sol lo sigue a él, pero yo sí sé a quién sigo.",
    },
  },
  {
    id: "cerezo",
    fieldWeight: 7,
    filler: true,
    visual: {
      petalShape: "round",
      petalColor: "#ffc9e0",
      petalColorAlt: "#ffc0dd",
      centerColor: "#e88aa8",
      stemColor: "#5b3a29",
      petalCount: 5,
      layers: 1,
      scale: 0.55,
      stemHeight: 0.7,
      colorVariance: 0.1,
      centerScale: 0.35,
      headTilt: 0.35,
      petalWidth: 1.25,
      petalNotch: 0.09,
      petalOpen: 0.25,
      petalCurl: 0.35,
      leafStyle: "broad",
      leafScale: 0.8,
      stamens: {
        count: 11,
        length: 0.13,
        filamentColor: "#ffe3ee",
        antherColor: "#f2c14e",
      },
    },
    content: {
      name: "Flor de cerezo",
      emoji: "🌸",
      meaning: "Belleza efímera y renovación.",
      description:
        "Dura poco tiempo en el árbol, pero mientras está, transforma completamente el paisaje. Algunas cosas hermosas son así de intensas.",
      romanticLine: "Los momentos con vos duran poco, pero se quedan para siempre.",
    },
  },
  {
    id: "hibisco",
    fieldWeight: 4,
    visual: {
      petalShape: "trumpet",
      petalColor: "#ff3b3b",
      petalColorAlt: "#ff7b54",
      centerColor: "#8a0f0f",
      stemColor: "#2c6b47",
      petalCount: 5,
      layers: 1,
      scale: 1.1,
      stemHeight: 1.0,
      colorVariance: 0.1,
      centerScale: 0.4,
      headTilt: 0.5,
      petalWidth: 1.7,
      leafStyle: "broad",
      leafScale: 1.2,
      stemWidth: 1.2,
      // Columna estaminal larga con anteras amarillas agrupadas cerca de
      // la punta: la silueta más reconocible del hibisco.
      stamens: {
        count: 12,
        length: 0.42,
        filamentColor: "#ff8f8f",
        antherColor: "#ffd166",
        column: true,
      },
    },
    content: {
      name: "Hibisco",
      emoji: "🌺",
      meaning: "Belleza delicada y pasión tropical.",
      description:
        "Vibrante y llamativo, se abre completamente al sol sin ninguna timidez. Una flor que no pide permiso para brillar.",
      romanticLine: "Ojalá pudiera mostrar lo que siento por vos tan abiertamente como esta flor se abre al sol.",
    },
  },
  {
    id: "margarita",
    fieldWeight: 10,
    filler: true,
    sunFacing: 0.45,
    visual: {
      petalShape: "thin",
      petalColor: "#ffffff",
      petalColorAlt: "#f5f5f5",
      centerColor: "#f4b400",
      stemColor: "#3f8c5c",
      petalCount: 21,
      layers: 1,
      scale: 0.6,
      stemHeight: 0.8,
      colorVariance: 0.06,
      centerScale: 1.25,
      centerShape: "disc",
      headTilt: 0.35,
      petalWidth: 1.25,
      leafStyle: "narrow",
      leafScale: 0.8,
    },
    content: {
      name: "Margarita",
      emoji: "💐",
      meaning: "Inocencia, pureza y amor verdadero.",
      description:
        "Simple y honesta. No necesita colores llamativos para ser una de las flores más queridas de cualquier jardín.",
      romanticLine: "Con vos no hace falta nada extra. Lo simple, cuando es real, ya alcanza.",
    },
  },
  {
    id: "lavanda",
    fieldWeight: 9,
    visual: {
      petalShape: "cluster",
      petalColor: "#8b6fd6",
      petalColorAlt: "#b39ddb",
      centerColor: "#5b3fa0",
      stemColor: "#6b8f5e",
      petalCount: 36,
      layers: 1,
      scale: 0.58,
      stemHeight: 0.95,
      colorVariance: 0.12,
      leafStyle: "narrow",
      leafScale: 0.7,
      // Una mata de varias espigas, no una espiga suelta.
      clump: 4,
    },
    content: {
      name: "Lavanda",
      emoji: "🪻",
      meaning: "Calma, devoción y tranquilidad.",
      description:
        "Su aroma tiene la rara cualidad de hacer que todo se sienta un poco más tranquilo. Igual que vos, de alguna manera.",
      romanticLine: "Cerca tuyo, hasta los días difíciles pesan menos.",
    },
  },
  {
    id: "dalia",
    fieldWeight: 5,
    visual: {
      // Dalia decorativa: muchas capas de pétalos agudos y muy
      // acanalados, más cerrados hacia el centro.
      petalShape: "pointed",
      petalColor: "#e85d9c",
      petalColorAlt: "#ff8fb1",
      centerColor: "#7a1f4d",
      stemColor: "#2c6b47",
      petalCount: 44,
      layers: 4,
      scale: 0.95,
      stemHeight: 1.15,
      colorVariance: 0.12,
      centerScale: 0.45,
      headTilt: 0.4,
      petalWidth: 0.8,
      petalCup: 2.4,
      petalOpen: 0.3,
      petalCurl: 0.5,
      petalClosure: 0.45,
      leafStyle: "broad",
      leafScale: 1.1,
    },
    content: {
      name: "Dalia",
      emoji: "🌼",
      meaning: "Compromiso duradero y elegancia.",
      description:
        "Cada capa de pétalos se abre lentamente, como si la flor entera necesitara tiempo para mostrarse por completo.",
      romanticLine: "Cada día descubro una capa distinta de vos, y todas me gustan.",
    },
  },
  {
    id: "peonia",
    fieldWeight: 5,
    visual: {
      petalShape: "round",
      petalColor: "#ffb3c6",
      petalColorAlt: "#ff8fab",
      centerColor: "#c94277",
      stemColor: "#3f8c5c",
      petalCount: 24,
      layers: 3,
      scale: 1.1,
      stemHeight: 1.0,
      colorVariance: 0.08,
      centerScale: 0.4,
      headTilt: 0.25,
      petalWidth: 1.15,
      petalCup: 1.3,
      leafStyle: "broad",
      leafScale: 1.2,
      stemWidth: 1.2,
    },
    content: {
      name: "Peonía",
      emoji: "🌸",
      meaning: "Romance, prosperidad y una vida feliz en pareja.",
      description:
        "Exuberante y generosa, la peonía nunca florece a medias. Cuando se abre, lo da todo.",
      romanticLine: "Con vos aprendí que amar de verdad es no guardarse nada.",
    },
  },
  {
    id: "orquidea",
    fieldWeight: 4,
    visual: {
      petalShape: "ruffled",
      petalColor: "#c084fc",
      petalColorAlt: "#e9d5ff",
      centerColor: "#6b21a8",
      stemColor: "#4a7c59",
      petalCount: 6,
      layers: 1,
      scale: 0.85,
      stemHeight: 1.2,
      colorVariance: 0.1,
      centerScale: 0.35,
      headTilt: 0.75,
      petalWidth: 1.2,
      lip: true,
      leafStyle: "strap",
      leafScale: 1.5,
    },
    content: {
      name: "Orquídea",
      emoji: "🌺",
      meaning: "Belleza exótica, fuerza y amor refinado.",
      description:
        "Delicada en apariencia, pero increíblemente resistente. Una de las pocas flores capaces de florecer de mil formas distintas.",
      romanticLine: "Sos la persona más delicada y más fuerte que conozco, a la vez.",
    },
  },
  {
    id: "jacinto",
    fieldWeight: 6,
    visual: {
      petalShape: "cluster",
      petalColor: "#4d6fff",
      petalColorAlt: "#7c9bff",
      centerColor: "#1f2f8a",
      stemColor: "#3f8c5c",
      petalCount: 24,
      layers: 1,
      scale: 0.7,
      stemHeight: 0.7,
      colorVariance: 0.1,
      leafStyle: "strap",
      leafScale: 1.1,
    },
    content: {
      name: "Jacinto",
      emoji: "🌷",
      meaning: "Sinceridad, juego y constancia.",
      description:
        "Anuncia la primavera con un perfume que se siente antes de verlo. Discreto, pero imposible de ignorar.",
      romanticLine: "Así me pasa con vos: primero te siento, después te encuentro.",
    },
  },
  {
    id: "calendula",
    fieldWeight: 7,
    visual: {
      petalShape: "thin",
      petalColor: "#ff9f1c",
      petalColorAlt: "#ffbf69",
      centerColor: "#a85200",
      stemColor: "#3f8c5c",
      petalCount: 32,
      layers: 2,
      scale: 0.62,
      stemHeight: 0.75,
      colorVariance: 0.08,
      centerScale: 1.1,
      centerShape: "disc",
      headTilt: 0.3,
      petalWidth: 1.6,
      leafStyle: "broad",
      leafScale: 0.8,
    },
    content: {
      name: "Caléndula",
      emoji: "🌼",
      meaning: "Calidez, alegría y afecto duradero.",
      description:
        "Se abre con el sol y se cierra al anochecer, día tras día, con una constancia silenciosa.",
      romanticLine: "Cada día elijo quererte otra vez, como esta flor elige abrirse cada mañana.",
    },
  },
  {
    id: "clavel",
    fieldWeight: 7,
    visual: {
      // Pompón de pétalos en cuña con el borde aserrado, saliendo de un
      // cáliz largo y tubular: dos rasgos que ninguna otra especie tiene.
      petalShape: "fringed",
      petalColor: "#ff6f91",
      petalColorAlt: "#ffd6e0",
      centerColor: "#c23d63",
      stemColor: "#5b8f6b",
      petalCount: 40,
      layers: 5,
      scale: 0.72,
      stemHeight: 0.95,
      colorVariance: 0.14,
      centerScale: 0.2,
      headTilt: 0.22,
      calyxLength: 3.4,
      leafStyle: "narrow",
      leafScale: 1.1,
    },
    content: {
      name: "Clavel",
      emoji: "🌸",
      meaning: "Admiración y cariño duradero.",
      description:
        "Sus pétalos festoneados, apretados unos contra otros, hacen que parezca una flor hecha de encaje. Sencilla y resistente, dura semanas enteras sin marchitarse.",
      romanticLine: "Como este clavel, lo que siento por vos no se marchita fácil.",
    },
  },
  {
    id: "lirio",
    fieldWeight: 6,
    visual: {
      // Seis tépalos largos (3 + 3 intercalados) que se curvan hacia
      // atrás desde una garganta en trompeta, con una franja rosada al
      // centro y estambres largos con anteras alargadas.
      petalShape: "recurved",
      petalColor: "#ffffff",
      petalColorAlt: "#fff4f9",
      centerColor: "#f28bb8",
      centerScale: 0.3,
      stemColor: "#3f8c5c",
      petalCount: 6,
      layers: 2,
      scale: 1.1,
      stemHeight: 1.15,
      colorVariance: 0.06,
      headTilt: 0.6,
      petalWidth: 1.1,
      leafStyle: "narrow",
      leafScale: 1.3,
      stemWidth: 1.2,
      stamens: {
        count: 6,
        length: 0.4,
        filamentColor: "#e8f5d0",
        antherColor: "#c2703f",
      },
    },
    content: {
      name: "Lirio",
      emoji: "🌷",
      meaning: "Pureza, elegancia y renacimiento.",
      description:
        "Alto y señorial, abre sus pétalos hacia atrás dejando ver unos estambres larguísimos. Una de las flores más elegantes de cualquier jardín.",
      romanticLine: "Hay flores que piden atención a los gritos. Vos y esta, no hace falta: alcanza con estar.",
    },
  },
  {
    id: "hortensia",
    fieldWeight: 6,
    visual: {
      petalShape: "dome",
      petalColor: "#7fa8ff",
      petalColorAlt: "#c9b6ff",
      centerColor: "#5b6fd6",
      stemColor: "#3f8c5c",
      petalCount: 88,
      layers: 1,
      scale: 0.92,
      stemHeight: 0.78,
      colorVariance: 0.2,
      headTilt: 0.15,
      leafStyle: "broad",
      leafScale: 1.7,
      stemWidth: 1.4,
    },
    content: {
      name: "Hortensia",
      emoji: "💠",
      meaning: "Gratitud sincera y emociones profundas.",
      description:
        "De lejos parece una sola flor redonda, pero mirada de cerca es en realidad un ramillete entero de florcitas diminutas trabajando juntas.",
      romanticLine: "Como esta hortensia, lo nuestro también es la suma de un montón de pequeñas cosas.",
    },
  },
  {
    id: "cosmos",
    fieldWeight: 6,
    sunFacing: 0.4,
    visual: {
      // Ocho pétalos anchos con la punta dentada, casi planos, sobre
      // un tallo largo y fino con hojas plumosas: liviano y aireado.
      petalShape: "notched",
      petalColor: "#f06aa8",
      petalColorAlt: "#ffc2dc",
      centerColor: "#f2b705",
      stemColor: "#4f8f4a",
      petalCount: 8,
      layers: 1,
      scale: 0.72,
      stemHeight: 1.3,
      colorVariance: 0.22,
      centerScale: 0.95,
      centerShape: "disc",
      headTilt: 0.45,
      leafStyle: "feathery",
    },
    content: {
      name: "Cosmos",
      emoji: "🌸",
      meaning: "Armonía, orden y amor tranquilo.",
      description:
        "Sus tallos finísimos parecen no poder sostenerla, pero aguantan el viento sin quebrarse. Su nombre viene de la palabra griega para el orden y la armonía del universo.",
      romanticLine: "Con vos, todo mi pequeño universo encuentra su lugar.",
    },
  },
  {
    id: "jazmin",
    fieldWeight: 5,
    filler: true,
    visual: {
      // Mata baja de varios tallos con ramilletes de florcitas blancas
      // en estrella (pétalos levemente torcidos, como un molinete) y
      // pimpollos rosados todavía cerrados.
      petalShape: "star",
      petalColor: "#fffdf7",
      petalColorAlt: "#f7b6cf",
      centerColor: "#f4e3a1",
      stemColor: "#2f5a37",
      petalCount: 8,
      layers: 1,
      scale: 0.55,
      stemHeight: 0.48,
      colorVariance: 0.05,
      leafStyle: "broad",
      leafScale: 0.8,
      stemWidth: 0.65,
      clump: 3,
    },
    content: {
      name: "Jazmín",
      emoji: "🤍",
      meaning: "Amor dulce, sensualidad y cariño sincero.",
      description:
        "Sus flores son chiquitas, pero su perfume llena un patio entero, sobre todo al atardecer. Los pimpollos son rosados y recién al abrirse se vuelven blancos.",
      romanticLine: "Hay presencias que no hacen ruido y aun así lo llenan todo. La tuya es así.",
    },
  },
  // ------------------------------------------------------------
  // FLOR ESPECIAL — no se reparte por peso, se ubica una sola vez
  // en el jardín. El id debe coincidir con `specialFlowerId` en
  // giftConfig.ts.
  // ------------------------------------------------------------
  {
    id: "flor-especial",
    fieldWeight: 0,
    isSpecial: true,
    visual: {
      petalShape: "ruffled",
      petalColor: "#ffffff",
      petalColorAlt: "#ffe9b8",
      centerColor: "#f7b955",
      stemColor: "#3f8c5c",
      petalCount: 18,
      layers: 3,
      scale: 1.1,
      stemHeight: 1.15,
      colorVariance: 0,
      centerScale: 0.55,
      headTilt: 0.18,
      petalOpen: 0.75,
      leafStyle: "broad",
    },
    content: {
      name: "La flor especial",
      emoji: "✨",
      meaning: "Vos.",
      description:
        "De todas las flores que preparé para este jardín, hay una que no se parece a ninguna otra.",
      romanticLine: "La guardé para el final a propósito.",
    },
  },
];

export const regularFlowerSpecies = flowerSpecies.filter((f) => !f.isSpecial);
export const specialFlower = flowerSpecies.find((f) => f.isSpecial)!;

export function getFlowerById(id: string): FlowerSpecies | undefined {
  return flowerSpecies.find((f) => f.id === id);
}
