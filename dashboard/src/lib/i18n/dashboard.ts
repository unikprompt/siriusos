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
    refresh: string;
    clearFilters: string;
    none: string;
    yes: string;
    no: string;
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
  badges: {
    status: {
      pending: string;
      inProgress: string;
      blocked: string;
      completed: string;
      unknown: string;
    };
    priority: {
      critical: string;
      urgent: string;
      high: string;
      normal: string;
      low: string;
    };
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
      kanbanEmpty: string;
      tableEmpty: string;
      unassigned: string;
      columns: {
        title: string;
        status: string;
        priority: string;
        assignee: string;
        org: string;
        created: string;
        completedToday: string;
      };
      filters: {
        org: string;
        agent: string;
        priority: string;
        status: string;
        project: string;
        allOrgs: string;
        allAgents: string;
        allPriorities: string;
        allStatuses: string;
        allProjects: string;
      };
      create: {
        button: string;
        title: string;
        description: string;
        titleLabel: string;
        titlePlaceholder: string;
        titleRequired: string;
        descriptionLabel: string;
        descriptionPlaceholder: string;
        priorityLabel: string;
        assigneeLabel: string;
        assigneePlaceholder: string;
        unassigned: string;
        projectLabel: string;
        projectPlaceholder: string;
        needsApproval: string;
        submit: string;
        submitting: string;
        cancel: string;
        error: string;
        networkError: string;
      };
      detail: {
        statusLabel: string;
        priorityLabel: string;
        assigneeLabel: string;
        assigneePlaceholder: string;
        orgLabel: string;
        projectLabel: string;
        createdLabel: string;
        updatedLabel: string;
        completedLabel: string;
        descriptionLabel: string;
        descriptionPlaceholder: string;
        notesLabel: string;
        addNoteLabel: string;
        addNotePlaceholder: string;
        deliverablesLabel: string;
        deliverablesEmpty: string;
        needsApproval: string;
        taskIdLabel: string;
        editTask: string;
        editTitlePlaceholder: string;
        save: string;
        saving: string;
        cancel: string;
        delete: string;
        deletePrompt: string;
        deleteYes: string;
        deleteNo: string;
        deleting: string;
        titleRequired: string;
        saveFailed: string;
        statusFailed: string;
        networkError: string;
        actions: {
          start: string;
          complete: string;
          block: string;
          backToPending: string;
          unblock: string;
          reopen: string;
        };
      };
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
      eventTypesLabel: string;
      eventTypes: {
        message: string;
        task: string;
        approval: string;
        error: string;
        milestone: string;
        heartbeat: string;
        action: string;
      };
      filterAgent: string;
      filterOrg: string;
      filterFrom: string;
      filterTo: string;
      allAgents: string;
      allOrgs: string;
      clear: string;
      live: string;
      reconnecting: string;
      eventsCount: string; // "{count} events"
      empty: {
        title: string;
        description: string;
      };
    };
    workflows: {
      subtitle: string;
      newCron: string;
      fleetHealth: string;
      viewAll: string;
      health: {
        total: string;
        healthy: string;
        warning: string;
        failed: string;
        new: string;
        unavailable: string;
      };
      summary: {
        totalCrons: string;
        activeNow: string;
        failing: string;
        agents: string;
        mostActive: string;
      };
      cronStatus: {
        title: string;
        searchPlaceholder: string;
        searchAria: string;
        filterAria: string;
        loading: string;
        col: {
          agent: string;
          cron: string;
          schedule: string;
          nextFire: string;
          lastFire: string;
          status: string;
        };
      };
      listEmpty: string;
      listEmptyFiltered: string;
      filters: {
        allAgents: string;
      };
      actions: {
        openDetail: string;
        editInline: string;
        delete: string;
      };
      loadFailed: string;
    };
    comms: {
      subtitle: string;
      tabs: {
        meetingRoom: string;
        activeChannels: string;
      };
      searchPlaceholder: string;
      searchClear: string;
      searchSubmit: string;
      showArchived: string;
      messagesCount: string;
      resultsCount: string;
    };
    approvals: {
      subtitle: string;
      tabs: {
        yourTasks: string;
        pending: string;
        history: string;
      };
      empty: {
        humanTitle: string;
        humanDescription: string;
        pending: string;
        history: string;
      };
      from: string;
      done: string;
      detail: {
        idLabel: string;
        approved: string;
        rejected: string;
        requestedBy: string;
        created: string;
        resolvedBy: string;
        resolvedAt: string;
        contextLabel: string;
        resolutionNoteLabel: string;
        noteLabel: string;
        notePlaceholder: string;
        approve: string;
        reject: string;
      };
      historyFilters: {
        agent: string;
        category: string;
        allAgents: string;
        allCategories: string;
      };
      historyBy: string;
    };
    analytics: { subtitle: string };
    strategy: {
      subtitle: string;
      noOrgs: string;
      todaysFocus: string;
      bottleneck: {
        title: string;
        placeholder: string;
        recentChanges: string;
        saving: string;
        saved: string;
        errorSaving: string;
      };
      goals: {
        title: string;
        saving: string;
        empty: string;
        addFirst: string;
        addInline: string;
        addPlaceholder: string;
        addSubmit: string;
        addCancel: string;
      };
      goalHistory: {
        title: string;
        showMore: string; // "Show {count} more"
      };
      goalItem: {
        progress: string;
        editTitle: string;
        editPlaceholder: string;
        dragToReorder: string;
        deleteConfirm: string;
        clickAgain: string;
        delete: string;
        save: string;
        cancel: string;
      };
    };
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
    refresh: 'Refresh',
    clearFilters: 'Clear filters',
    none: 'None',
    yes: 'Yes',
    no: 'No',
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
  badges: {
    status: {
      pending: 'Pending',
      inProgress: 'In Progress',
      blocked: 'Blocked',
      completed: 'Completed',
      unknown: 'Unknown',
    },
    priority: {
      critical: 'Critical',
      urgent: 'Urgent',
      high: 'High',
      normal: 'Normal',
      low: 'Low',
    },
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
      kanbanEmpty: 'No tasks',
      tableEmpty: 'No tasks found',
      unassigned: 'Unassigned',
      columns: {
        title: 'Title',
        status: 'Status',
        priority: 'Priority',
        assignee: 'Assignee',
        org: 'Org',
        created: 'Created',
        completedToday: 'Completed (today)',
      },
      filters: {
        org: 'Org',
        agent: 'Agent',
        priority: 'Priority',
        status: 'Status',
        project: 'Project',
        allOrgs: 'All Orgs',
        allAgents: 'All Agents',
        allPriorities: 'All Priorities',
        allStatuses: 'All Statuses',
        allProjects: 'All Projects',
      },
      create: {
        button: 'New Task',
        title: 'Create Task',
        description: 'Create a new task and assign it to an agent.',
        titleLabel: 'Title',
        titlePlaceholder: 'Task title…',
        titleRequired: 'Title is required',
        descriptionLabel: 'Description',
        descriptionPlaceholder: 'Optional description…',
        priorityLabel: 'Priority',
        assigneeLabel: 'Assignee',
        assigneePlaceholder: 'Select agent',
        unassigned: 'Unassigned',
        projectLabel: 'Project',
        projectPlaceholder: 'Select project',
        needsApproval: 'Needs approval before execution',
        submit: 'Create Task',
        submitting: 'Creating…',
        cancel: 'Cancel',
        error: 'Failed to create task',
        networkError: 'Network error — check your connection',
      },
      detail: {
        statusLabel: 'Status',
        priorityLabel: 'Priority',
        assigneeLabel: 'Assignee',
        assigneePlaceholder: 'agent name or human',
        orgLabel: 'Org',
        projectLabel: 'Project',
        createdLabel: 'Created',
        updatedLabel: 'Updated',
        completedLabel: 'Completed',
        descriptionLabel: 'Description',
        descriptionPlaceholder: 'Task description…',
        notesLabel: 'Notes',
        addNoteLabel: 'Add note (optional)',
        addNotePlaceholder: 'Note for status change…',
        deliverablesLabel: 'Deliverables',
        deliverablesEmpty: 'No deliverables attached.',
        needsApproval: 'Needs Approval',
        taskIdLabel: 'Task ID',
        editTask: 'Edit task',
        editTitlePlaceholder: 'Task title…',
        save: 'Save Changes',
        saving: 'Saving…',
        cancel: 'Cancel',
        delete: 'Delete',
        deletePrompt: 'Delete?',
        deleteYes: 'Yes',
        deleteNo: 'No',
        deleting: 'Deleting…',
        titleRequired: 'Title is required',
        saveFailed: 'Failed to save',
        statusFailed: 'Failed to update status',
        networkError: 'Network error',
        actions: {
          start: 'Start',
          complete: 'Complete',
          block: 'Block',
          backToPending: 'Back to Pending',
          unblock: 'Unblock',
          reopen: 'Reopen',
        },
      },
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
      eventTypesLabel: 'Event Types',
      eventTypes: {
        message: 'Message',
        task: 'Task',
        approval: 'Approval',
        error: 'Error',
        milestone: 'Milestone',
        heartbeat: 'Heartbeat',
        action: 'Action',
      },
      filterAgent: 'Agent',
      filterOrg: 'Org',
      filterFrom: 'From',
      filterTo: 'To',
      allAgents: 'All agents',
      allOrgs: 'All orgs',
      clear: 'Clear',
      live: 'Live',
      reconnecting: 'Reconnecting…',
      eventsCount: '{count} events',
      empty: {
        title: 'No events match',
        description: 'Adjust the filters above or wait for new activity. The connected stream will pick up new events as soon as they arrive.',
      },
    },
    workflows: {
      subtitle: 'Scheduled crons across all agents.',
      newCron: 'New Cron',
      fleetHealth: 'Fleet Health',
      viewAll: 'View all',
      health: {
        total: 'total',
        healthy: 'healthy',
        warning: 'warning',
        failed: 'failed',
        new: 'new',
        unavailable: 'Health data unavailable',
      },
      summary: {
        totalCrons: 'Total Crons',
        activeNow: 'Active Now',
        failing: 'Failing',
        agents: 'Agents',
        mostActive: 'Most Active',
      },
      cronStatus: {
        title: 'Cron Status',
        searchPlaceholder: 'Search crons…',
        searchAria: 'Search crons',
        filterAria: 'Filter by agent',
        loading: 'Loading…',
        col: {
          agent: 'Agent',
          cron: 'Cron',
          schedule: 'Schedule',
          nextFire: 'Next Fire',
          lastFire: 'Last Fire',
          status: 'Status',
        },
      },
      listEmpty: 'No crons found',
      listEmptyFiltered: 'No crons match the current filters',
      filters: {
        allAgents: 'All agents',
      },
      actions: {
        openDetail: 'Open detail page',
        editInline: 'Edit (inline)',
        delete: 'Delete',
      },
      loadFailed: 'Failed to load crons',
    },
    comms: {
      subtitle: 'Inter-agent messages and channels — every conversation in the fleet, in real time.',
      tabs: {
        meetingRoom: 'Meeting Room',
        activeChannels: 'Active Channels',
      },
      searchPlaceholder: 'Search messages…',
      searchClear: 'Clear',
      searchSubmit: 'Search',
      showArchived: 'Show archived',
      messagesCount: '{count} messages',
      resultsCount: '{count} results',
    },
    approvals: {
      subtitle: 'Items waiting for human review.',
      tabs: {
        yourTasks: 'Your Tasks',
        pending: 'Approvals',
        history: 'History',
      },
      empty: {
        humanTitle: 'Inbox clear',
        humanDescription: 'No tasks assigned to you right now. Your agents will route here when they need a decision.',
        pending: 'No pending approvals — you are all caught up.',
        history: 'No resolved approvals found',
      },
      from: 'from',
      done: 'Done',
      detail: {
        idLabel: 'Approval ID',
        approved: 'Approved',
        rejected: 'Rejected',
        requestedBy: 'Requested by',
        created: 'Created',
        resolvedBy: 'Resolved by',
        resolvedAt: 'Resolved at',
        contextLabel: 'Context',
        resolutionNoteLabel: 'Resolution note',
        noteLabel: 'Note (optional)',
        notePlaceholder: 'Add a note for your decision…',
        approve: 'Approve',
        reject: 'Reject',
      },
      historyFilters: {
        agent: 'Agent',
        category: 'Category',
        allAgents: 'All Agents',
        allCategories: 'All Categories',
      },
      historyBy: 'by',
    },
    analytics: { subtitle: 'Performance metrics and cost tracking.' },
    strategy: {
      subtitle: 'Goals, milestones and bottlenecks.',
      noOrgs: 'No organizations found. Create an org to get started.',
      todaysFocus: "Today's Focus",
      bottleneck: {
        title: 'Current Bottleneck',
        placeholder: 'What is the current bottleneck for your team?',
        recentChanges: 'Recent Changes',
        saving: 'Saving…',
        saved: 'Saved',
        errorSaving: 'Error saving',
      },
      goals: {
        title: 'Goals',
        saving: 'Saving…',
        empty: 'No goals yet',
        addFirst: 'Add your first goal',
        addInline: 'Add Goal',
        addPlaceholder: 'New goal title',
        addSubmit: 'Add Goal',
        addCancel: 'Cancel',
      },
      goalHistory: {
        title: 'Goal History',
        showMore: 'Show {count} more',
      },
      goalItem: {
        progress: 'Progress',
        editTitle: 'Edit goal',
        editPlaceholder: 'Goal title',
        dragToReorder: 'Drag to reorder',
        deleteConfirm: 'Delete this goal? This cannot be undone.',
        clickAgain: 'Click again',
        delete: 'Delete',
        save: 'Save',
        cancel: 'Cancel',
      },
    },
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
    refresh: 'Actualizar',
    clearFilters: 'Limpiar filtros',
    none: 'Ninguno',
    yes: 'Sí',
    no: 'No',
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
  badges: {
    status: {
      pending: 'Pendiente',
      inProgress: 'En curso',
      blocked: 'Bloqueada',
      completed: 'Completada',
      unknown: 'Desconocido',
    },
    priority: {
      critical: 'Crítica',
      urgent: 'Urgente',
      high: 'Alta',
      normal: 'Normal',
      low: 'Baja',
    },
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
      kanbanEmpty: 'Sin tareas',
      tableEmpty: 'No se encontraron tareas',
      unassigned: 'Sin asignar',
      columns: {
        title: 'Título',
        status: 'Estado',
        priority: 'Prioridad',
        assignee: 'Asignado a',
        org: 'Org',
        created: 'Creada',
        completedToday: 'Completadas (hoy)',
      },
      filters: {
        org: 'Org',
        agent: 'Agente',
        priority: 'Prioridad',
        status: 'Estado',
        project: 'Proyecto',
        allOrgs: 'Todas las orgs',
        allAgents: 'Todos los agentes',
        allPriorities: 'Todas las prioridades',
        allStatuses: 'Todos los estados',
        allProjects: 'Todos los proyectos',
      },
      create: {
        button: 'Nueva tarea',
        title: 'Crear tarea',
        description: 'Creá una nueva tarea y asignala a un agente.',
        titleLabel: 'Título',
        titlePlaceholder: 'Título de la tarea…',
        titleRequired: 'El título es obligatorio',
        descriptionLabel: 'Descripción',
        descriptionPlaceholder: 'Descripción opcional…',
        priorityLabel: 'Prioridad',
        assigneeLabel: 'Asignado a',
        assigneePlaceholder: 'Elegí un agente',
        unassigned: 'Sin asignar',
        projectLabel: 'Proyecto',
        projectPlaceholder: 'Elegí un proyecto',
        needsApproval: 'Requiere aprobación antes de ejecutar',
        submit: 'Crear tarea',
        submitting: 'Creando…',
        cancel: 'Cancelar',
        error: 'No se pudo crear la tarea',
        networkError: 'Error de red — revisá tu conexión',
      },
      detail: {
        statusLabel: 'Estado',
        priorityLabel: 'Prioridad',
        assigneeLabel: 'Asignado a',
        assigneePlaceholder: 'nombre del agente o humano',
        orgLabel: 'Org',
        projectLabel: 'Proyecto',
        createdLabel: 'Creada',
        updatedLabel: 'Actualizada',
        completedLabel: 'Completada',
        descriptionLabel: 'Descripción',
        descriptionPlaceholder: 'Descripción de la tarea…',
        notesLabel: 'Notas',
        addNoteLabel: 'Agregar nota (opcional)',
        addNotePlaceholder: 'Nota para el cambio de estado…',
        deliverablesLabel: 'Entregables',
        deliverablesEmpty: 'No hay entregables adjuntos.',
        needsApproval: 'Requiere aprobación',
        taskIdLabel: 'ID de tarea',
        editTask: 'Editar tarea',
        editTitlePlaceholder: 'Título de la tarea…',
        save: 'Guardar cambios',
        saving: 'Guardando…',
        cancel: 'Cancelar',
        delete: 'Eliminar',
        deletePrompt: '¿Eliminar?',
        deleteYes: 'Sí',
        deleteNo: 'No',
        deleting: 'Eliminando…',
        titleRequired: 'El título es obligatorio',
        saveFailed: 'No se pudo guardar',
        statusFailed: 'No se pudo cambiar el estado',
        networkError: 'Error de red',
        actions: {
          start: 'Empezar',
          complete: 'Completar',
          block: 'Bloquear',
          backToPending: 'Volver a pendiente',
          unblock: 'Desbloquear',
          reopen: 'Reabrir',
        },
      },
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
      eventTypesLabel: 'Tipos de evento',
      eventTypes: {
        message: 'Mensaje',
        task: 'Tarea',
        approval: 'Aprobación',
        error: 'Error',
        milestone: 'Hito',
        heartbeat: 'Heartbeat',
        action: 'Acción',
      },
      filterAgent: 'Agente',
      filterOrg: 'Org',
      filterFrom: 'Desde',
      filterTo: 'Hasta',
      allAgents: 'Todos los agentes',
      allOrgs: 'Todas las orgs',
      clear: 'Limpiar',
      live: 'En vivo',
      reconnecting: 'Reconectando…',
      eventsCount: '{count} eventos',
      empty: {
        title: 'No hay eventos que coincidan',
        description: 'Ajustá los filtros o esperá nueva actividad. El stream conectado va a recoger eventos nuevos en cuanto lleguen.',
      },
    },
    workflows: {
      subtitle: 'Crons programados de toda la flota.',
      newCron: 'Nuevo cron',
      fleetHealth: 'Salud de la flota',
      viewAll: 'Ver todo',
      health: {
        total: 'total',
        healthy: 'sanos',
        warning: 'aviso',
        failed: 'fallaron',
        new: 'nuevos',
        unavailable: 'Datos de salud no disponibles',
      },
      summary: {
        totalCrons: 'Crons totales',
        activeNow: 'Activos ahora',
        failing: 'Fallando',
        agents: 'Agentes',
        mostActive: 'Más activo',
      },
      cronStatus: {
        title: 'Estado de los crons',
        searchPlaceholder: 'Buscar crons…',
        searchAria: 'Buscar crons',
        filterAria: 'Filtrar por agente',
        loading: 'Cargando…',
        col: {
          agent: 'Agente',
          cron: 'Cron',
          schedule: 'Schedule',
          nextFire: 'Próxima ejecución',
          lastFire: 'Última ejecución',
          status: 'Estado',
        },
      },
      listEmpty: 'No hay crons',
      listEmptyFiltered: 'Ningún cron coincide con los filtros actuales',
      filters: {
        allAgents: 'Todos los agentes',
      },
      actions: {
        openDetail: 'Abrir detalle',
        editInline: 'Editar (inline)',
        delete: 'Eliminar',
      },
      loadFailed: 'No se pudieron cargar los crons',
    },
    comms: {
      subtitle: 'Mensajes y canales entre agentes — toda la conversación de la flota, en vivo.',
      tabs: {
        meetingRoom: 'Sala de reuniones',
        activeChannels: 'Canales activos',
      },
      searchPlaceholder: 'Buscar mensajes…',
      searchClear: 'Limpiar',
      searchSubmit: 'Buscar',
      showArchived: 'Mostrar archivados',
      messagesCount: '{count} mensajes',
      resultsCount: '{count} resultados',
    },
    approvals: {
      subtitle: 'Items esperando revisión humana.',
      tabs: {
        yourTasks: 'Tus tareas',
        pending: 'Aprobaciones',
        history: 'Historial',
      },
      empty: {
        humanTitle: 'Inbox limpio',
        humanDescription: 'No tenés tareas asignadas ahora mismo. Tus agentes te rutean acá cuando necesitan una decisión.',
        pending: 'No hay aprobaciones pendientes — estás al día.',
        history: 'No se encontraron aprobaciones resueltas',
      },
      from: 'de',
      done: 'Listo',
      detail: {
        idLabel: 'ID de la aprobación',
        approved: 'Aprobada',
        rejected: 'Rechazada',
        requestedBy: 'Solicitado por',
        created: 'Creada',
        resolvedBy: 'Resuelta por',
        resolvedAt: 'Resuelta',
        contextLabel: 'Contexto',
        resolutionNoteLabel: 'Nota de resolución',
        noteLabel: 'Nota (opcional)',
        notePlaceholder: 'Agregá una nota para tu decisión…',
        approve: 'Aprobar',
        reject: 'Rechazar',
      },
      historyFilters: {
        agent: 'Agente',
        category: 'Categoría',
        allAgents: 'Todos los agentes',
        allCategories: 'Todas las categorías',
      },
      historyBy: 'por',
    },
    analytics: { subtitle: 'Métricas de performance y seguimiento de costos.' },
    strategy: {
      subtitle: 'Objetivos, hitos y cuellos de botella.',
      noOrgs: 'No hay organizaciones. Creá una para empezar.',
      todaysFocus: 'Foco del día',
      bottleneck: {
        title: 'Cuello de botella actual',
        placeholder: '¿Cuál es el cuello de botella actual del equipo?',
        recentChanges: 'Cambios recientes',
        saving: 'Guardando…',
        saved: 'Guardado',
        errorSaving: 'Error al guardar',
      },
      goals: {
        title: 'Objetivos',
        saving: 'Guardando…',
        empty: 'Aún no hay objetivos',
        addFirst: 'Agregá tu primer objetivo',
        addInline: 'Agregar objetivo',
        addPlaceholder: 'Nuevo objetivo',
        addSubmit: 'Agregar',
        addCancel: 'Cancelar',
      },
      goalHistory: {
        title: 'Historial de objetivos',
        showMore: 'Ver {count} más',
      },
      goalItem: {
        progress: 'Progreso',
        editTitle: 'Editar objetivo',
        editPlaceholder: 'Título del objetivo',
        dragToReorder: 'Arrastrar para reordenar',
        deleteConfirm: '¿Eliminar este objetivo? No se puede deshacer.',
        clickAgain: 'Hacé clic de nuevo',
        delete: 'Eliminar',
        save: 'Guardar',
        cancel: 'Cancelar',
      },
    },
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
