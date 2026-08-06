const STORAGE_KEY = 'tldl.settings';

export type Language = 'en' | 'de';

export const DEFAULT_LANGUAGE: Language = 'en';

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'German',
};

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'de';
}

/** Only what is the user's to choose. The models are the app's, and live in `openrouter.ts`. */
export type Settings = {
  apiKey: string;
  outputLanguage: Language;
};

const DEFAULTS: Settings = {
  apiKey: '',
  outputLanguage: DEFAULT_LANGUAGE,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULTS };
    }
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      apiKey: parsed.apiKey?.trim() || DEFAULTS.apiKey,
      outputLanguage: isLanguage(parsed.outputLanguage)
        ? parsed.outputLanguage
        : DEFAULTS.outputLanguage,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
