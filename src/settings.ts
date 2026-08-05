const STORAGE_KEY = 'tldl.settings';

export const DEFAULT_TRANSCRIBE_MODEL = 'openai/whisper-large-v3';
export const DEFAULT_REWRITE_MODEL = 'deepseek/deepseek-v4-flash';

export type Settings = {
  apiKey: string;
  transcribeModel: string;
  rewriteModel: string;
};

const DEFAULTS: Settings = {
  apiKey: '',
  transcribeModel: DEFAULT_TRANSCRIBE_MODEL,
  rewriteModel: DEFAULT_REWRITE_MODEL,
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
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
