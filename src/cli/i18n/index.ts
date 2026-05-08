/**
 * CLI i18n — bilingual strings for `siriusos` commands.
 *
 * Mirrors the dashboard pattern (typed dictionary keyed by Locale)
 * but lives in the runtime so commands can pick a language from a
 * --lang flag, the persisted org context, or LANG/LC_ALL.
 */
import type { Locale } from '../../types/index.js';
import { CLI_STRINGS_EN } from './en.js';
import { CLI_STRINGS_ES } from './es.js';
import type { CliStrings } from './shape.js';

export type { Locale, CliStrings };

const CLI_STRINGS: Record<Locale, CliStrings> = {
  en: CLI_STRINGS_EN,
  es: CLI_STRINGS_ES,
};

export function t(locale: Locale): CliStrings {
  return CLI_STRINGS[locale] ?? CLI_STRINGS.en;
}

/** Replace `{name}` placeholders with values. Numbers coerced to string. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined ? `{${k}}` : String(v);
  });
}

export { detectLocale, isLocale } from './detect.js';
