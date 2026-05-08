import type { Locale } from './index';

export interface OnboardingStrings {
  common: {
    next: string;
    back: string;
    skip: string;
    finish: string;
    cancel: string;
    progress: string; // "Step {current} of {total}"
  };
  language: {
    title: string;
    subtitle: string;
    pickEnglish: string;
    pickSpanish: string;
  };
  organization: {
    title: string;
    subtitle: string;
    nameLabel: string;
    namePlaceholder: string;
    nameRules: string;
    nameInvalid: string;
    nameEmpty: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    timezoneLabel: string;
    timezoneAuto: string;
  };
  orchestrator: {
    title: string;
    subtitle: string;
    nameLabel: string;
    namePlaceholder: string;
    nameInvalid: string;
    introBotFather: string;
    botFatherSteps: string;
    tokenLabel: string;
    tokenPlaceholder: string;
    tokenRequired: string;
    sendMessageHint: string;
    fetchChatId: string;
    fetching: string;
    chatIdAuto: string;
    chatIdManualLabel: string;
    chatIdManualPlaceholder: string;
    chatIdRequired: string;
    validate: string;
    validating: string;
    validatedOk: string; // "Validated · @{bot} → chat {chat}"
    validationFailed: string;
    networkError: string;
    badToken: string;
  };
  review: {
    title: string;
    subtitle: string;
    languageLabel: string;
    organizationLabel: string;
    orchestratorLabel: string;
    telegramLabel: string;
    telegramSummary: string; // "@{bot} → chat {chat}"
    runSetup: string;
    runningSetup: string;
  };
  run: {
    title: string;
    subtitle: string;
    streamingLogs: string;
    failed: string;
    failedHint: string;
    successHeading: string;
    successDetail: string;
    goToDashboard: string;
  };
}

const en: OnboardingStrings = {
  common: {
    next: 'Next',
    back: 'Back',
    skip: 'Skip',
    finish: 'Finish',
    cancel: 'Cancel',
    progress: 'Step {current} of {total}',
  },
  language: {
    title: 'Pick your language',
    subtitle: 'You can switch any time from the Settings page or the toggle in the navbar.',
    pickEnglish: 'Continue in English',
    pickSpanish: 'Continuar en español',
  },
  organization: {
    title: 'Create your organization',
    subtitle: 'A short identifier for your team or project. SiriusOS will use it to namespace agents, tasks and config.',
    nameLabel: 'Organization name',
    namePlaceholder: 'acme',
    nameRules: 'Lowercase letters, numbers, hyphens and underscores only.',
    nameInvalid: 'Use lowercase letters, numbers, hyphens or underscores.',
    nameEmpty: 'Organization name is required.',
    descriptionLabel: 'Description (optional)',
    descriptionPlaceholder: 'What does this organization do?',
    timezoneLabel: 'Timezone',
    timezoneAuto: 'Auto-detected',
  },
  orchestrator: {
    title: 'Configure your orchestrator',
    subtitle: 'The orchestrator coordinates other agents, routes messages and sends you Telegram briefings.',
    nameLabel: 'Agent name',
    namePlaceholder: 'boss',
    nameInvalid: 'Use lowercase letters, numbers, hyphens or underscores.',
    introBotFather: 'You will need a Telegram bot. Create one in a couple of minutes:',
    botFatherSteps: '1. Open Telegram, search @BotFather. 2. Send /newbot and follow the prompts. 3. Copy the token (looks like 123456789:AAA…).',
    tokenLabel: 'Bot token (from @BotFather)',
    tokenPlaceholder: '123456789:AAAA…',
    tokenRequired: 'Bot token is required.',
    sendMessageHint: 'Now send any message to your new bot in Telegram. We will pick up your chat ID automatically when you click Fetch.',
    fetchChatId: 'Fetch chat ID',
    fetching: 'Fetching…',
    chatIdAuto: 'Detected chat ID',
    chatIdManualLabel: 'Or paste your chat ID manually',
    chatIdManualPlaceholder: '123456789',
    chatIdRequired: 'Chat ID is required.',
    validate: 'Validate Telegram',
    validating: 'Validating…',
    validatedOk: 'Validated · @{bot} → chat {chat}',
    validationFailed: 'Validation failed.',
    networkError: 'Could not reach Telegram. Check your connection and try again.',
    badToken: 'Telegram rejected this bot token. Re-check it at @BotFather.',
  },
  review: {
    title: 'Review and start',
    subtitle: 'Once you click Run setup, SiriusOS will create the org, register the orchestrator, write its .env, and start the daemon under PM2.',
    languageLabel: 'Language',
    organizationLabel: 'Organization',
    orchestratorLabel: 'Orchestrator',
    telegramLabel: 'Telegram',
    telegramSummary: '@{bot} → chat {chat}',
    runSetup: 'Run setup',
    runningSetup: 'Running setup…',
  },
  run: {
    title: 'Setting up SiriusOS',
    subtitle: 'This usually takes 20-40 seconds. Logs from each step are streamed below.',
    streamingLogs: 'Setup output',
    failed: 'Setup did not finish cleanly.',
    failedHint: 'Check the logs above. You can also re-run from the terminal: siriusos setup.',
    successHeading: 'Your fleet is live.',
    successDetail: 'The orchestrator is registered and the daemon is running. You can start chatting via Telegram, or open the overview to watch its activity.',
    goToDashboard: 'Open dashboard',
  },
};

const es: OnboardingStrings = {
  common: {
    next: 'Siguiente',
    back: 'Atrás',
    skip: 'Omitir',
    finish: 'Finalizar',
    cancel: 'Cancelar',
    progress: 'Paso {current} de {total}',
  },
  language: {
    title: 'Elegí tu idioma',
    subtitle: 'Lo podés cambiar después en Ajustes o desde el toggle del navbar.',
    pickEnglish: 'Continue in English',
    pickSpanish: 'Continuar en español',
  },
  organization: {
    title: 'Creá tu organización',
    subtitle: 'Un identificador corto para tu equipo o proyecto. SiriusOS lo usa como namespace de agentes, tareas y config.',
    nameLabel: 'Nombre de la organización',
    namePlaceholder: 'acme',
    nameRules: 'Solo minúsculas, números, guiones y guiones bajos.',
    nameInvalid: 'Usá solo minúsculas, números, guiones o guiones bajos.',
    nameEmpty: 'El nombre de la organización es obligatorio.',
    descriptionLabel: 'Descripción (opcional)',
    descriptionPlaceholder: '¿A qué se dedica esta organización?',
    timezoneLabel: 'Zona horaria',
    timezoneAuto: 'Detectada automáticamente',
  },
  orchestrator: {
    title: 'Configurá tu orquestador',
    subtitle: 'El orquestador coordina al resto de los agentes, rutea mensajes y te manda briefings por Telegram.',
    nameLabel: 'Nombre del agente',
    namePlaceholder: 'boss',
    nameInvalid: 'Usá solo minúsculas, números, guiones o guiones bajos.',
    introBotFather: 'Necesitás un bot de Telegram. Lo creás en un par de minutos:',
    botFatherSteps: '1. Abrí Telegram y buscá @BotFather. 2. Mandá /newbot y seguí los pasos. 3. Copiá el token (formato 123456789:AAA…).',
    tokenLabel: 'Token del bot (de @BotFather)',
    tokenPlaceholder: '123456789:AAAA…',
    tokenRequired: 'El token del bot es obligatorio.',
    sendMessageHint: 'Mandale ahora cualquier mensaje al bot nuevo desde Telegram. Cuando hagas clic en Obtener, detectamos tu chat ID automáticamente.',
    fetchChatId: 'Obtener chat ID',
    fetching: 'Obteniendo…',
    chatIdAuto: 'Chat ID detectado',
    chatIdManualLabel: 'O pegá tu chat ID a mano',
    chatIdManualPlaceholder: '123456789',
    chatIdRequired: 'El chat ID es obligatorio.',
    validate: 'Validar Telegram',
    validating: 'Validando…',
    validatedOk: 'Validado · @{bot} → chat {chat}',
    validationFailed: 'La validación falló.',
    networkError: 'No pudimos llegar a Telegram. Revisá la conexión y probá de nuevo.',
    badToken: 'Telegram rechazó este token. Revisalo con @BotFather.',
  },
  review: {
    title: 'Revisá y arrancá',
    subtitle: 'Cuando hagas clic en Arrancar, SiriusOS crea la organización, registra el orquestador, escribe su .env y arranca el daemon con PM2.',
    languageLabel: 'Idioma',
    organizationLabel: 'Organización',
    orchestratorLabel: 'Orquestador',
    telegramLabel: 'Telegram',
    telegramSummary: '@{bot} → chat {chat}',
    runSetup: 'Arrancar setup',
    runningSetup: 'Arrancando setup…',
  },
  run: {
    title: 'Configurando SiriusOS',
    subtitle: 'Suele tardar 20-40 segundos. Los logs de cada paso se muestran abajo.',
    streamingLogs: 'Output del setup',
    failed: 'El setup no terminó bien.',
    failedHint: 'Revisá los logs arriba. También podés correrlo desde la terminal: siriusos setup.',
    successHeading: 'Tu flota está viva.',
    successDetail: 'El orquestador quedó registrado y el daemon corriendo. Podés empezar a hablarle por Telegram, o abrir el overview para ver su actividad.',
    goToDashboard: 'Abrir dashboard',
  },
};

export const ONBOARDING_STRINGS: Record<Locale, OnboardingStrings> = { en, es };

export function getOnboardingStrings(locale: Locale): OnboardingStrings {
  return ONBOARDING_STRINGS[locale];
}
