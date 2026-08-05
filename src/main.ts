import './style.css';
import { loadSettings, saveSettings } from './settings.ts';
import { takeSharedAudio } from './share.ts';
import { OpenRouterError, rewrite, transcribe } from './openrouter.ts';

type View = 'idle' | 'working' | 'result' | 'error' | 'settings';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`missing element #${id}`);
  }
  return node as T;
}

const views: Record<View, HTMLElement> = {
  idle: el('view-idle'),
  working: el('view-working'),
  result: el('view-result'),
  error: el('view-error'),
  settings: el('view-settings'),
};

function show(view: View): void {
  for (const [name, node] of Object.entries(views)) {
    node.hidden = name !== view;
  }
}

function showWorking(step: string, detail = ''): void {
  el('working-step').textContent = step;
  el('working-detail').textContent = detail;
  show('working');
}

function showResult(message: string, transcript: string, cost: number): void {
  el('result-text').textContent = message;
  el('result-transcript').textContent = transcript;
  el('result-meta').textContent = `$${cost.toFixed(4)}`;
  show('result');
}

function showError(error: unknown): void {
  el('error-text').textContent = describeError(error);
  show('error');
}

function describeError(error: unknown): string {
  if (error instanceof OpenRouterError) {
    if (error.status === 401) {
      return 'OpenRouter rejected the API key. Check it in settings.';
    }
    if (error.status === 402) {
      return 'The OpenRouter key is out of credit.';
    }
    return `OpenRouter said: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function describeSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function run(audio: Blob, filename: string): Promise<void> {
  const settings = loadSettings();

  if (!settings.apiKey) {
    openSettings('Add an API key first, then share the message again.');
    return;
  }

  try {
    showWorking('Transcribing', describeSize(audio.size));
    const transcription = await transcribe(
      audio,
      filename,
      settings.apiKey,
      settings.transcribeModel,
    );

    if (!transcription.text) {
      throw new Error('The transcription came back empty.');
    }

    showWorking('Rewriting', `${transcription.text.length} characters`);
    const rewritten = await rewrite(
      transcription.text,
      settings.apiKey,
      settings.rewriteModel,
    );

    showResult(
      rewritten.text,
      transcription.text,
      transcription.cost + rewritten.cost,
    );
  } catch (error) {
    showError(error);
  }
}

/** The hint sits outside the views so it survives switching between them. */
function setHint(text: string): void {
  const hint = el('hint');
  hint.textContent = text;
  hint.hidden = !text;
}

function openSettings(hint = ''): void {
  const settings = loadSettings();
  el<HTMLInputElement>('api-key').value = settings.apiKey;
  el<HTMLInputElement>('transcribe-model').value = settings.transcribeModel;
  el<HTMLInputElement>('rewrite-model').value = settings.rewriteModel;
  el('settings-saved').hidden = true;
  setHint(hint);
  show('settings');
}

function showIdle(hint = ''): void {
  setHint(hint);
  show('idle');
}

function wireUp(): void {
  el('open-settings').addEventListener('click', () => openSettings());

  el('save-settings').addEventListener('click', () => {
    const apiKey = el<HTMLInputElement>('api-key').value.trim();
    saveSettings({
      apiKey,
      transcribeModel: el<HTMLInputElement>('transcribe-model').value.trim(),
      rewriteModel: el<HTMLInputElement>('rewrite-model').value.trim(),
    });

    if (!apiKey) {
      el('settings-saved').hidden = false;
      setHint('Saved, but without a key nothing can be transcribed.');
      return;
    }

    showIdle();
  });

  el<HTMLInputElement>('file-input').addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void run(file, file.name);
    }
    input.value = '';
  });

  el('copy').addEventListener('click', async () => {
    const button = el('copy');
    await navigator.clipboard.writeText(el('result-text').textContent ?? '');
    button.textContent = 'Copied';
    setTimeout(() => {
      button.textContent = 'Copy';
    }, 1500);
  });

  el('again').addEventListener('click', () => showIdle());
  el('error-back').addEventListener('click', () => showIdle());
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Without a worker the app still runs; only the share target stops working.
  });
}

/** The share redirect leaves `?shared=` behind. Drop it so a reload isn't a re-share. */
function consumeShareFlag(): string | null {
  const flag = new URLSearchParams(location.search).get('shared');
  if (flag !== null) {
    history.replaceState(null, '', location.pathname);
  }
  return flag;
}

async function boot(): Promise<void> {
  wireUp();
  registerServiceWorker();

  const flag = consumeShareFlag();
  const shared = await takeSharedAudio();

  if (shared) {
    await run(shared.blob, shared.filename);
    return;
  }

  if (flag === '0') {
    showIdle('That share did not include an audio file.');
    return;
  }

  if (!loadSettings().apiKey) {
    openSettings('Add your OpenRouter API key to get started.');
    return;
  }

  showIdle();
}

void boot();
