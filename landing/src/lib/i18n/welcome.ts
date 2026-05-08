export type Locale = 'en' | 'es';

export const LOCALE_STORAGE_KEY = 'siriusos-locale';

export interface WelcomeStrings {
  nav: {
    signIn: string;
    primary: string;
  };
  hero: {
    eyebrow: string;
    headline: string;
    sub: string;
    ctaPrimary: string;
    ctaSecondary: string;
    statusOnline: string;
  };
  pillars: {
    sectionEyebrow: string;
    sectionTitle: string;
    items: Array<{ title: string; body: string }>;
  };
  install: {
    eyebrow: string;
    title: string;
    sub: string;
    osMacLabel: string;
    osLinuxLabel: string;
    osWindowsLabel: string;
    windowsRequiresWsl: string;
    windowsRequiresWslDetail: string;
    copy: string;
    copied: string;
    afterCommandHint: string;
    afterCommandHintWindows: string;
    flagsHint: string;
  };
  builtOn: {
    title: string;
    body: string;
  };
  community: {
    eyebrow: string;
    title: string;
    body: string;
    cta: string;
    note: string;
  };
  footer: {
    tagline: string;
    rights: string;
  };
}

const en: WelcomeStrings = {
  nav: {
    signIn: 'Sign in',
    primary: 'Get started',
  },
  hero: {
    eyebrow: 'Persistent AI agent orchestration',
    headline: 'A fleet of AI agents that never go to sleep.',
    sub: 'SiriusOS keeps your Claude-powered agents running 24/7, talks to them on Telegram, runs scheduled work via crons, and shows you the whole orchestration in one dashboard. Self-hosted on your machine, open source, npm-installable.',
    ctaPrimary: 'Get started',
    ctaSecondary: 'Sign in',
    statusOnline: 'siriusos · v0.1.6 · MIT',
  },
  pillars: {
    sectionEyebrow: 'What you get',
    sectionTitle: 'Built for operators who run actual fleets.',
    items: [
      {
        title: '24/7 persistence',
        body: 'Each agent keeps its own context, files, and identity across days. Restart-safe, crash-resilient, daemon-managed.',
      },
      {
        title: 'Multi-agent orchestration',
        body: 'Agents send tasks, approvals and messages between each other through a typed bus. The orquestador supervises, the workers execute.',
      },
      {
        title: 'Telegram integration',
        body: 'Get a ping when an agent needs approval, when a cron fires, when something crashes. Reply from your phone, the agent picks it up.',
      },
      {
        title: 'External cron scheduling',
        body: 'Schedule recurring work outside the agent session — survives restarts, edits and rate-limits. Persisted on disk in plain JSON.',
      },
    ],
  },
  install: {
    eyebrow: 'Install',
    title: 'One command. Then never the terminal again.',
    sub: 'The Node-based installer clones the repo, verifies prerequisites, and gets you to the visual wizard. From there language, organization and Telegram setup happen in your browser.',
    osMacLabel: 'macOS',
    osLinuxLabel: 'Linux',
    osWindowsLabel: 'Windows',
    windowsRequiresWsl: 'Windows requires WSL2 (Ubuntu).',
    windowsRequiresWslDetail: 'Agents run shell scripts under bash. The installer detects WSL automatically and tells you how to install it (`wsl --install` in an Administrator PowerShell, then reboot).',
    copy: 'Copy',
    copied: 'Copied',
    afterCommandHint: 'After it finishes, open http://localhost:3013 in your browser and the visual wizard handles language, organization, and Telegram bot.',
    afterCommandHintWindows: 'After WSL is ready and the install completes, open http://localhost:3013 in your browser. The visual wizard handles the rest.',
    flagsHint: 'Override defaults with SIRIUSOS_DIR=/path or SIRIUSOS_BRANCH=feature/foo before piping into node.',
  },
  builtOn: {
    title: 'Built on Claude. Runs on your machine.',
    body: 'SiriusOS is open under the hood — TypeScript, plain JSON state, atomic file writes. Production runtime is the same code you can audit. No proprietary cloud, no data leaving your environment unless you ask it to.',
  },
  community: {
    eyebrow: 'Learn it · Master it · Stay updated',
    title: 'Join Operadores Aumentados.',
    body: 'The community where Mario and other operators share tutorials, customizations, agent recipes, and what\'s coming next. Direct support, weekly lessons, and a peer group running their own SiriusOS fleets.',
    cta: 'Join the community',
    note: 'Free while we grow. Powered by Skool.',
  },
  footer: {
    tagline: 'Persistent AI agents · always on',
    rights: 'A UnikPrompt project',
  },
};

const es: WelcomeStrings = {
  nav: {
    signIn: 'Entrar',
    primary: 'Empezar',
  },
  hero: {
    eyebrow: 'Orquestación persistente de agentes IA',
    headline: 'Una flota de agentes IA que nunca se duerme.',
    sub: 'SiriusOS mantiene tus agentes con Claude corriendo 24/7, los hablás por Telegram, ejecutan trabajo programado con crons, y vos ves toda la orquestación en un solo dashboard. Self-hosted en tu máquina, código abierto, instalable vía npm.',
    ctaPrimary: 'Empezar',
    ctaSecondary: 'Entrar',
    statusOnline: 'siriusos · v0.1.6 · MIT',
  },
  pillars: {
    sectionEyebrow: 'Lo que obtenés',
    sectionTitle: 'Pensado para operadores que corren flotas de verdad.',
    items: [
      {
        title: 'Persistencia 24/7',
        body: 'Cada agente conserva su propio contexto, archivos e identidad por días. Sobrevive a restarts, resiste crashes, gestionado por un daemon.',
      },
      {
        title: 'Orquestación multi-agente',
        body: 'Los agentes se mandan tareas, aprobaciones y mensajes vía un bus tipado. El orquestador supervisa, los workers ejecutan.',
      },
      {
        title: 'Integración con Telegram',
        body: 'Te llega un ping cuando un agente necesita aprobación, cuando dispara un cron, cuando algo se cae. Respondés del celular, el agente lo recoge.',
      },
      {
        title: 'Crons externos persistentes',
        body: 'Programá trabajo recurrente fuera de la sesión del agente — sobrevive a restarts, ediciones y rate-limits. Persistido en disco como JSON.',
      },
    ],
  },
  install: {
    eyebrow: 'Instalación',
    title: 'Un comando. Después nunca más la terminal.',
    sub: 'El instalador (en Node) clona el repo, verifica prerrequisitos y te lleva al wizard visual. Desde ahí idioma, organización y Telegram se configuran en el navegador.',
    osMacLabel: 'macOS',
    osLinuxLabel: 'Linux',
    osWindowsLabel: 'Windows',
    windowsRequiresWsl: 'Windows necesita WSL2 (Ubuntu).',
    windowsRequiresWslDetail: 'Los agentes corren scripts bash. El instalador detecta WSL automáticamente y te dice cómo instalarlo (`wsl --install` en una PowerShell de administrador, después reinicio).',
    copy: 'Copiar',
    copied: 'Copiado',
    afterCommandHint: 'Cuando termina, abrí http://localhost:3013 en el navegador y el wizard visual se encarga de idioma, organización y bot de Telegram.',
    afterCommandHintWindows: 'Cuando WSL esté listo y el install termine, abrí http://localhost:3013 en el navegador. El wizard visual hace el resto.',
    flagsHint: 'Sobrescribí defaults con SIRIUSOS_DIR=/ruta o SIRIUSOS_BRANCH=feature/foo antes de pipear a node.',
  },
  builtOn: {
    title: 'Sobre Claude. Corriendo en tu máquina.',
    body: 'SiriusOS es transparente por dentro — TypeScript, estado en JSON plano, escrituras atómicas. El runtime productivo es el mismo código que podés auditar. Sin nube propietaria, sin datos saliendo de tu entorno salvo que vos lo pidas.',
  },
  community: {
    eyebrow: 'Aprendelo · Dominalo · Mantente al día',
    title: 'Sumate a Operadores Aumentados.',
    body: 'La comunidad donde Mario y otros operadores comparten tutoriales, personalizaciones, recetas de agentes y lo que viene. Soporte directo, lecciones semanales y un grupo de pares corriendo sus propias flotas SiriusOS.',
    cta: 'Unirme a la comunidad',
    note: 'Gratis mientras crece. Powered by Skool.',
  },
  footer: {
    tagline: 'Agentes IA persistentes · siempre prendidos',
    rights: 'Un proyecto UnikPrompt',
  },
};

export const STRINGS: Record<Locale, WelcomeStrings> = { en, es };

export const SKOOL_URL = 'https://skool.com/operadores-aumentados';
export const NPM_URL = 'https://www.npmjs.com/package/siriusos';
export const GITHUB_URL = 'https://github.com/unikprompt/siriusos';

/** Detect initial locale from localStorage > navigator > default 'en'. */
export function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === 'en' || stored === 'es') return stored;
  } catch { /* ignore */ }
  const lang = navigator.language?.toLowerCase() ?? '';
  if (lang.startsWith('es')) return 'es';
  return 'en';
}
