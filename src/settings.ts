const STORAGE_KEY = 'tldl.settings';

export const DEFAULT_TRANSCRIBE_MODEL = 'openai/whisper-large-v3';
export const DEFAULT_REWRITE_MODEL = 'deepseek/deepseek-v4-flash';

export type Language = 'en' | 'de';

export const DEFAULT_LANGUAGE: Language = 'en';

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'German',
};

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'de';
}

export type Settings = {
  apiKey: string;
  transcribeModel: string;
  rewriteModel: string;
  outputLanguage: Language;
};

const DEFAULTS: Settings = {
  apiKey: '',
  transcribeModel: DEFAULT_TRANSCRIBE_MODEL,
  rewriteModel: DEFAULT_REWRITE_MODEL,
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
      transcribeModel: parsed.transcribeModel?.trim() || DEFAULTS.transcribeModel,
      rewriteModel: parsed.rewriteModel?.trim() || DEFAULTS.rewriteModel,
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
