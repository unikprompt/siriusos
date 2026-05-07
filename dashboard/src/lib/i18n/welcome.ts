export type Locale = 'en' | 'es';

export const LOCALE_STORAGE_KEY = 'siriusos-locale';

export interface WelcomeStrings {
  nav: {
    signIn: string;
    waitlist: string;
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
  how: {
    eyebrow: string;
    title: string;
    sub: string;
    steps: Array<{ title: string; body: string; code?: string }>;
  };
  builtOn: {
    title: string;
    body: string;
  };
  ctaFinal: {
    title: string;
    sub: string;
    cta: string;
  };
  waitlist: {
    title: string;
    sub: string;
    placeholder: string;
    submit: string;
    submitting: string;
    success: string;
    error: string;
    invalid: string;
  };
  footer: {
    tagline: string;
    rights: string;
  };
}

const en: WelcomeStrings = {
  nav: {
    signIn: 'Sign in',
    waitlist: 'Request access',
  },
  hero: {
    eyebrow: 'Persistent AI agent orchestration',
    headline: 'A fleet of AI agents that never go to sleep.',
    sub: 'SiriusOS keeps your Claude-powered agents running 24/7, talks to them on Telegram, runs scheduled work via crons, and shows you the whole orchestration in one dashboard.',
    ctaPrimary: 'Request access',
    ctaSecondary: 'Sign in',
    statusOnline: 'Live · siriusos.unikprompt.com',
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
  how: {
    eyebrow: 'How it works',
    title: 'Three commands to a running fleet.',
    sub: 'Designed to run locally on macOS first. No cloud lock-in, no proprietary runtime — just Claude, your Mac, and persistent processes.',
    steps: [
      {
        title: 'Install',
        body: 'One command via npm. The CLI lands as siriusos in your PATH.',
        code: 'npm install -g siriusos',
      },
      {
        title: 'Initialize an agent',
        body: 'Create one agent with a name and identity. The daemon takes over from there.',
        code: 'siriusos init my-agent\nsiriusos start my-agent',
      },
      {
        title: 'Open the dashboard',
        body: 'Watch the fleet, the conversations and the cron schedule live.',
        code: 'siriusos dashboard --build',
      },
    ],
  },
  builtOn: {
    title: 'Built on Claude. Runs on your machine.',
    body: 'SiriusOS is open under the hood — TypeScript, plain JSON state, atomic file writes. Production runtime is the same code you can audit. No proprietary cloud, no data leaving your environment unless you ask it to.',
  },
  ctaFinal: {
    title: 'Get on the waitlist.',
    sub: 'Early access is curated. Drop your email and a short note about how you would use a persistent agent fleet.',
    cta: 'Request access',
  },
  waitlist: {
    title: 'Request access',
    sub: 'Mario reviews each request personally — usually within a few days.',
    placeholder: 'you@domain.com',
    submit: 'Request access',
    submitting: 'Sending...',
    success: 'Got it. You will hear back when an invite is ready.',
    error: 'Something went wrong. Try again, or DM Mario directly.',
    invalid: 'Please enter a valid email address.',
  },
  footer: {
    tagline: 'Persistent AI agents · always on',
    rights: 'A UnikPrompt project',
  },
};

const es: WelcomeStrings = {
  nav: {
    signIn: 'Entrar',
    waitlist: 'Pedir acceso',
  },
  hero: {
    eyebrow: 'Orquestación persistente de agentes IA',
    headline: 'Una flota de agentes IA que nunca se duerme.',
    sub: 'SiriusOS mantiene tus agentes con Claude corriendo 24/7, los hablás por Telegram, ejecutan trabajo programado con crons, y vos ves toda la orquestación en un solo dashboard.',
    ctaPrimary: 'Pedir acceso',
    ctaSecondary: 'Entrar',
    statusOnline: 'En línea · siriusos.unikprompt.com',
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
  how: {
    eyebrow: 'Cómo funciona',
    title: 'Tres comandos a una flota en vivo.',
    sub: 'Diseñado para correr local en macOS primero. Sin lock-in en la nube, sin runtime propietario — solo Claude, tu Mac y procesos persistentes.',
    steps: [
      {
        title: 'Instalar',
        body: 'Un solo comando vía npm. El CLI queda como siriusos en tu PATH.',
        code: 'npm install -g siriusos',
      },
      {
        title: 'Iniciar un agente',
        body: 'Creá un agente con nombre e identidad. El daemon se encarga del resto.',
        code: 'siriusos init mi-agente\nsiriusos start mi-agente',
      },
      {
        title: 'Abrir el dashboard',
        body: 'Mirá la flota, las conversaciones y los crons en vivo.',
        code: 'siriusos dashboard --build',
      },
    ],
  },
  builtOn: {
    title: 'Sobre Claude. Corriendo en tu máquina.',
    body: 'SiriusOS es transparente por dentro — TypeScript, estado en JSON plano, escrituras atómicas. El runtime productivo es el mismo código que podés auditar. Sin nube propietaria, sin datos saliendo de tu entorno salvo que vos lo pidas.',
  },
  ctaFinal: {
    title: 'Sumate a la lista.',
    sub: 'El acceso temprano es curado. Dejá tu email y una nota corta sobre cómo usarías una flota persistente de agentes.',
    cta: 'Pedir acceso',
  },
  waitlist: {
    title: 'Pedir acceso',
    sub: 'Mario revisa cada pedido a mano — normalmente en unos días.',
    placeholder: 'vos@dominio.com',
    submit: 'Pedir acceso',
    submitting: 'Enviando...',
    success: 'Recibido. Te aviso cuando haya invitación lista.',
    error: 'Algo falló. Probá de nuevo, o escribile a Mario directo.',
    invalid: 'Ingresá un email válido.',
  },
  footer: {
    tagline: 'Agentes IA persistentes · siempre prendidos',
    rights: 'Un proyecto UnikPrompt',
  },
};

export const STRINGS: Record<Locale, WelcomeStrings> = { en, es };

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
