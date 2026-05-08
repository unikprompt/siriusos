import type { Locale } from './index';

export interface DashboardStrings {
  common: {
    save: string;
    cancel: string;
    close: string;
    retry: string;
    loading: string;
    loadingShort: string;
    error: string;
    confirm: string;
    delete: string;
    edit: string;
    add: string;
    search: string;
    user: string;
  };
  nav: {
    sections: {
      intelligence: string;
      operations: string;
    };
    items: {
      overview: string;
      activity: string;
      agents: string;
      tasks: string;
      workflows: string;
      comms: string;
      approvals: string;
      analytics: string;
      strategy: string;
      skills: string;
      experiments: string;
      knowledgeBase: string;
      settings: string;
    };
    openMenu: string;
    closeMenu: string;
    toggleTheme: string;
    languageLabel: string;
    logout: string;
    more: string;
  };
  login: {
    tagline: string;
    cardTitle: string;
    cardDescription: string;
    usernameLabel: string;
    usernamePlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    submit: string;
    submitting: string;
    loadingCsrf: string;
    signInFailed: string;
    tooManyAttempts: string;
    networkError: string;
    unknownError: string;
  };
  pages: {
    overview: {
      title: string;
      allOrgs: string;
      orgLabel: string;
      actionsNeededOne: string; // "{count} action needed"
      actionsNeededMany: string; // "{count} actions needed"
    };
    tasks: {
      title: string;
      viewBoard: string;
      viewList: string;
      emptyTitle: string;
      emptyDescription: string;
    };
    agents: {
      title: string;
      allOrgs: string;
      orgLabel: string;
      countOne: string; // "{count} agent"
      countMany: string; // "{count} agents"
    };
    activity: {
      title: string;
      subtitle: string;
      filters: string;
    };
    workflows: { subtitle: string };
    comms: { subtitle: string };
    approvals: { subtitle: string };
    analytics: { subtitle: string };
    strategy: { subtitle: string };
    skills: { subtitle: string };
    experiments: { subtitle: string };
    knowledgeBase: { subtitle: string };
    settings: {
      title: string;
      subtitle: string;
      tabs: {
        organization: string;
        telegram: string;
        system: string;
        users: string;
        allowedRoots: string;
        appearance: string;
      };
      appearance: {
        title: string;
        darkModeLabel: string;
        darkModeDescription: string;
        densityLabel: string;
        densityDescription: string;
        densityComfortable: string;
        densityCompact: string;
        languageLabel: string;
        languageDescription: string;
      };
    };
  };
}

const en: DashboardStrings = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    retry: 'Retry',
    loading: 'Loading…',
    loadingShort: 'Loading',
    error: 'Error',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    search: 'Search',
    user: 'User',
  },
  nav: {
    sections: {
      intelligence: 'Intelligence',
      operations: 'Operations',
    },
    items: {
      overview: 'Overview',
      activity: 'Activity',
      agents: 'Agents',
      tasks: 'Tasks',
      workflows: 'Workflows',
      comms: 'Comms',
      approvals: 'Approvals',
      analytics: 'Analytics',
      strategy: 'Strategy',
      skills: 'Skills',
      experiments: 'Experiments',
      knowledgeBase: 'Knowledge Base',
      settings: 'Settings',
    },
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    toggleTheme: 'Toggle theme',
    languageLabel: 'Language',
    logout: 'Logout',
    more: 'More',
  },
  login: {
    tagline: 'Persistent AI agents · always on',
    cardTitle: 'Sign in',
    cardDescription: 'Enter your credentials to access the dashboard',
    usernameLabel: 'Username',
    usernamePlaceholder: 'admin',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter password',
    submit: 'Sign In',
    submitting: 'Signing in…',
    loadingCsrf: 'Loading…',
    signInFailed: 'Sign-in failed',
    tooManyAttempts: 'Too many attempts. Please wait a few minutes and try again.',
    networkError: 'Network error. Please try again.',
    unknownError: 'Could not sign in. Please try again.',
  },
  pages: {
    overview: {
      title: 'Overview',
      allOrgs: 'All organizations',
      orgLabel: 'Organization',
      actionsNeededOne: '{count} action needed',
      actionsNeededMany: '{count} actions needed',
    },
    tasks: {
      title: 'Tasks',
      viewBoard: 'Board',
      viewList: 'List',
      emptyTitle: 'No tasks yet',
      emptyDescription: 'Create your first task to start tracking work across your agents.',
    },
    agents: {
      title: 'Agents',
      allOrgs: 'All organizations',
      orgLabel: 'Org',
      countOne: '{count} agent',
      countMany: '{count} agents',
    },
    activity: {
      title: 'Activity',
      subtitle: 'Real-time event stream from across the fleet.',
      filters: 'Filters',
    },
    workflows: { subtitle: 'Scheduled crons across all agents.' },
    comms: { subtitle: 'Inter-agent messages and channels — every conversation in the fleet, in real time.' },
    approvals: { subtitle: 'Items waiting for human review.' },
    analytics: { subtitle: 'Performance metrics and cost tracking.' },
    strategy: { subtitle: 'Goals, milestones and bottlenecks.' },
    skills: { subtitle: 'Browse and install skills from the catalog to your agents.' },
    experiments: { subtitle: 'Track ongoing experiments across agents.' },
    knowledgeBase: { subtitle: "Search, browse and manage your organization's shared knowledge. Powered by multimodal RAG." },
    settings: {
      title: 'Settings',
      subtitle: 'Manage integrations, system configuration, users, and appearance.',
      tabs: {
        organization: 'Organization',
        telegram: 'Telegram',
        system: 'System',
        users: 'Users',
        allowedRoots: 'Allowed Roots',
        appearance: 'Appearance',
      },
      appearance: {
        title: 'Appearance',
        darkModeLabel: 'Dark Mode',
        darkModeDescription: 'Toggle between light and dark themes.',
        densityLabel: 'Density',
        densityDescription: 'Adjust spacing and font size across the dashboard.',
        densityComfortable: 'Comfortable',
        densityCompact: 'Compact',
        languageLabel: 'Language',
        languageDescription: 'Pick the language for the dashboard interface.',
      },
    },
  },
};

const es: DashboardStrings = {
  common: {
    save: 'Guardar',
    cancel: 'Cancelar',
    close: 'Cerrar',
    retry: 'Reintentar',
    loading: 'Cargando…',
    loadingShort: 'Cargando',
    error: 'Error',
    confirm: 'Confirmar',
    delete: 'Eliminar',
    edit: 'Editar',
    add: 'Agregar',
    search: 'Buscar',
    user: 'Usuario',
  },
  nav: {
    sections: {
      intelligence: 'Inteligencia',
      operations: 'Operaciones',
    },
    items: {
      overview: 'Resumen',
      activity: 'Actividad',
      agents: 'Agentes',
      tasks: 'Tareas',
      workflows: 'Flujos',
      comms: 'Mensajes',
      approvals: 'Aprobaciones',
      analytics: 'Analítica',
      strategy: 'Estrategia',
      skills: 'Skills',
      experiments: 'Experimentos',
      knowledgeBase: 'Base de conocimiento',
      settings: 'Ajustes',
    },
    openMenu: 'Abrir menú',
    closeMenu: 'Cerrar menú',
    toggleTheme: 'Cambiar tema',
    languageLabel: 'Idioma',
    logout: 'Cerrar sesión',
    more: 'Más',
  },
  login: {
    tagline: 'Agentes IA persistentes · siempre prendidos',
    cardTitle: 'Entrar',
    cardDescription: 'Ingresá tus credenciales para acceder al dashboard',
    usernameLabel: 'Usuario',
    usernamePlaceholder: 'admin',
    passwordLabel: 'Contraseña',
    passwordPlaceholder: 'Ingresá la contraseña',
    submit: 'Entrar',
    submitting: 'Entrando…',
    loadingCsrf: 'Cargando…',
    signInFailed: 'No se pudo iniciar sesión',
    tooManyAttempts: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.',
    networkError: 'Error de red. Probá de nuevo.',
    unknownError: 'No se pudo iniciar sesión. Probá de nuevo.',
  },
  pages: {
    overview: {
      title: 'Resumen',
      allOrgs: 'Todas las organizaciones',
      orgLabel: 'Organización',
      actionsNeededOne: '{count} acción requerida',
      actionsNeededMany: '{count} acciones requeridas',
    },
    tasks: {
      title: 'Tareas',
      viewBoard: 'Tablero',
      viewList: 'Lista',
      emptyTitle: 'Aún no hay tareas',
      emptyDescription: 'Creá tu primera tarea para empezar a seguir el trabajo de tus agentes.',
    },
    agents: {
      title: 'Agentes',
      allOrgs: 'Todas las organizaciones',
      orgLabel: 'Org',
      countOne: '{count} agente',
      countMany: '{count} agentes',
    },
    activity: {
      title: 'Actividad',
      subtitle: 'Stream de eventos en tiempo real de toda la flota.',
      filters: 'Filtros',
    },
    workflows: { subtitle: 'Crons programados de toda la flota.' },
    comms: { subtitle: 'Mensajes y canales entre agentes — toda la conversación de la flota, en vivo.' },
    approvals: { subtitle: 'Items esperando revisión humana.' },
    analytics: { subtitle: 'Métricas de performance y seguimiento de costos.' },
    strategy: { subtitle: 'Objetivos, hitos y cuellos de botella.' },
    skills: { subtitle: 'Explorá e instalá skills del catálogo en tus agentes.' },
    experiments: { subtitle: 'Seguimiento de experimentos en curso entre agentes.' },
    knowledgeBase: { subtitle: 'Buscá, explorá y gestioná el conocimiento compartido de tu organización. Powered by multimodal RAG.' },
    settings: {
      title: 'Ajustes',
      subtitle: 'Gestioná integraciones, configuración, usuarios y apariencia.',
      tabs: {
        organization: 'Organización',
        telegram: 'Telegram',
        system: 'Sistema',
        users: 'Usuarios',
        allowedRoots: 'Carpetas permitidas',
        appearance: 'Apariencia',
      },
      appearance: {
        title: 'Apariencia',
        darkModeLabel: 'Modo oscuro',
        darkModeDescription: 'Cambiá entre tema claro y oscuro.',
        densityLabel: 'Densidad',
        densityDescription: 'Ajustá el espaciado y tamaño de fuente del dashboard.',
        densityComfortable: 'Cómoda',
        densityCompact: 'Compacta',
        languageLabel: 'Idioma',
        languageDescription: 'Elegí el idioma de la interfaz del dashboard.',
      },
    },
  },
};

export const DASHBOARD_STRINGS: Record<Locale, DashboardStrings> = { en, es };
