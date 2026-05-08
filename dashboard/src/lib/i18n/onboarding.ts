import type { Locale } from './index';

// Strings for the visual onboarding wizard at /onboarding.
// Filled out when Parte 3 (wizard visual) lands.

export interface OnboardingStrings {
  // Reserved — filled in when the wizard lands.
  placeholder: string;
}

const en: OnboardingStrings = {
  placeholder: '',
};

const es: OnboardingStrings = {
  placeholder: '',
};

export const ONBOARDING_STRINGS: Record<Locale, OnboardingStrings> = { en, es };
