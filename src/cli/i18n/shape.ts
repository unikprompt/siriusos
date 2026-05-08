/**
 * Shape of the CLI string dictionary. Defined separately from the en/es
 * exports so both locales reference the same interface at compile time
 * — TypeScript flags any missing key in either translation.
 */
export interface CliStrings {
  setup: {
    languagePrompt: string;
    languageOptions: string;
    languageInvalid: string;
    welcomeHeading: string;
    welcomeStep1: string;
    welcomeStep2: string;
    welcomeStep3: string;
    welcomeStep4: string;
    welcomeStep5: string;
    welcomeExitHint: string;
    step1Title: string;
    step1InstallFailed: string;
    step2Title: string;
    step2OrgIntro: string;
    step2OrgRules: string;
    step2OrgPrompt: string;
    step2OrgEmpty: string;
    step2OrgInvalid: string;
    step2InitFailed: string;
    step3Title: string;
    step3Intro: string;
    step3BotFatherIntro: string;
    step3BotFatherSteps: string;
    step3OrchPrompt: string;
    step3InvalidName: string;
    step3TokenPrompt: string;
    step3TokenRequired: string;
    step3SendMessageHint: string;
    step3PressEnter: string;
    step3FetchingChatId: string;
    step3ChatIdPrompt: string;
    step3ChatIdRequired: string;
    step3ValidationContinueAbort: string;
    step3AddOrchFailed: string;
    step3WroteEnv: string;
    step3EnableFailed: string;
    step4Title: string;
    step4Intro: string;
    step4AddMore: string;
    step4AgentNamePrompt: string;
    step4AgentNameRequired: string;
    step4AgentNameInvalid: string;
    step4AgentNameDuplicate: string;
    step4TemplatePrompt: string;
    step4CreateBotHint: string;
    step4TokenPrompt: string;
    step4SendMessageHint: string;
    step4ChatIdPrompt: string;
    step4SkippingAgent: string;
    step5Title: string;
    step5EcoFailed: string;
    step5DaemonStarted: string;
    completeHeading: string;
    completeOrg: string;
    completeAgents: string;
    completeState: string;
    completeNextStepsHeading: string;
    completeNextStepStatus: string;
    completeNextStepDashboard: string;
    completeNextStepLogs: string;
    completeNextStepTalk: string;
  };
  telegram: {
    chatIdEcho: string;
    chatIdNotFound: string;
    validationCrashed: string;
    validationOk: string;
    validationWarning: string;
    validationFailed: string;
    validationBadTokenAdvice: string;
    differentChatIdPrompt: string;
    giveUpNoEnv: string;
    tooManyAttempts: string;
  };
  common: {
    error: string;
    warning: string;
    cannotContinue: string;
    cannotContinueValidation: string;
    rerunSetup: string;
  };
}
