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
  };
  login: {
    title: string;
    subtitle: string;
    usernameLabel: string;
    usernamePlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    submit: string;
    submitting: string;
    tooManyAttempts: string;
    networkError: string;
    unknownError: string;
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
  },
  login: {
    title: 'Sign in to SiriusOS',
    subtitle: 'Enter your credentials to access the dashboard.',
    usernameLabel: 'Username',
    usernamePlaceholder: 'admin',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    tooManyAttempts: 'Too many attempts. Please wait a few minutes and try again.',
    networkError: 'Network error. Please try again.',
    unknownError: 'Could not sign in. Please try again.',
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
  },
  login: {
    title: 'Entrar a SiriusOS',
    subtitle: 'Ingresá tus credenciales para acceder al dashboard.',
    usernameLabel: 'Usuario',
    usernamePlaceholder: 'admin',
    passwordLabel: 'Contraseña',
    passwordPlaceholder: 'Ingresá la contraseña',
    submit: 'Entrar',
    submitting: 'Entrando…',
    tooManyAttempts: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.',
    networkError: 'Error de red. Probá de nuevo.',
    unknownError: 'No se pudo iniciar sesión. Probá de nuevo.',
  },
};

export const DASHBOARD_STRINGS: Record<Locale, DashboardStrings> = { en, es };
