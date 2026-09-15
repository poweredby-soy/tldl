import './style.css';
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  loadSettings,
  saveSettings,
  type Language,
} from './settings.ts';
import { looksLikeAudio } from './audio.ts';
import { takeSharedAudio } from './share.ts';
import {
  OpenRouterError,
  REWRITE_MODEL,
  rewrite,
  TRANSCRIBE_MODEL,
  transcribe,
  type Transcription,
} from './openrouter.ts';

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

function swapTo(view: View): void {
  for (const [name, node] of Object.entries(views)) {
    node.hidden = name !== view;
  }
}

let showing: View | null = null;

/**
 * Cross-fades between views, which is what stops a switch from reading as a jump. Only a
 * real change is worth animating: the result view is shown again once the message is whole,
 * and fading the finished text over itself would be a stutter at the end of every run.
 */
function show(view: View): void {
  const changed = view !== showing;
  showing = view;

  const quiet = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!changed || quiet || !document.startViewTransition) {
    swapTo(view);
    return;
  }

  document.startViewTransition(() => swapTo(view));
}

function showWorking(step: string, detail = ''): void {
  el('working-step').textContent = step;
  el('working-detail').textContent = detail;
  show('working');
}

/** Everything around the message waits until the message is whole. */
function showResultControls(visible: boolean): void {
  el('result-actions').hidden = !visible;
  el('result-original').hidden = !visible;
  el('result-stats').hidden = !visible;
}

function showStreaming(transcript: string): void {
  el('result-text').textContent = '';
  el('result-transcript').textContent = transcript;
  showResultControls(false);
  show('result');
}

function showResult(message: string, transcription: Transcription, cost: number): void {
  el('result-text').textContent = message;
  el('result-transcript').textContent = transcription.text;
  el('result-reduction').textContent = describeReduction(message, transcription.text);
  el('result-meta').textContent = `$${cost.toFixed(4)}`;
  showSpoken(transcription.duration);
  showResultControls(true);
  show('result');
}

/** Not every transcription endpoint reports a duration, so the stat comes and goes. */
function showSpoken(duration?: number): void {
  const known = typeof duration === 'number' && duration > 0;

  el('result-spoken').textContent = known ? describeSpoken(duration) : '';
  el('result-spoken').hidden = !known;
  el('result-spoken-separator').hidden = !known;
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

/** How long the sender talked, which is the whole reason this app exists. */
function describeSpoken(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;

  if (!minutes) {
    return `${rest}s spoken`;
  }

  return `${minutes}m ${String(rest).padStart(2, '0')}s spoken`;
}

/** A rewrite can come out longer than the transcript, so say which way it went. */
function describeReduction(message: string, transcript: string): string {
  const change = 1 - message.length / transcript.length;
  const percent = Math.round(Math.abs(change) * 100);

  if (percent === 0) {
    return 'Same length';
  }

  if (change < 0) {
    return `${percent}% longer`;
  }

  return `${percent}% shorter`;
}

async function run(audio: Blob, filename: string): Promise<void> {
  if (!looksLikeAudio(audio.type, filename)) {
    showIdle(`${filename || 'That file'} is not a voice message.`);
    return;
  }

  const settings = loadSettings();

  if (!settings.apiKey) {
    openSettings('Add an API key first, then share the message again.');
    return;
  }

  try {
    showWorking('Transcribing', describeSize(audio.size));
    const transcription = await transcribe(audio, filename, settings.apiKey, TRANSCRIBE_MODEL);

    if (!transcription.text) {
      throw new Error('The transcription came back empty.');
    }

    showWorking('Rewriting', `${transcription.text.length} characters`);

    const message = el('result-text');
    let started = false;

    const rewritten = await rewrite(
      transcription,
      settings.apiKey,
      REWRITE_MODEL,
      settings.outputLanguage,
      (delta) => {
        if (!started) {
          started = true;
          showStreaming(transcription.text);
        }
        message.textContent += delta;
      },
    );

    showResult(rewritten.text, transcription, transcription.cost + rewritten.cost);
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

function languageButtons(): HTMLButtonElement[] {
  return [...el('output-language').querySelectorAll<HTMLButtonElement>('[data-language]')];
}

/** The pressed button holds the choice, so the group needs no state beside the DOM. */
function showLanguage(language: Language): void {
  for (const button of languageButtons()) {
    button.setAttribute('aria-pressed', String(button.dataset.language === language));
  }
}

function chosenLanguage(): Language {
  const pressed = languageButtons().find(
    (button) => button.getAttribute('aria-pressed') === 'true',
  );
  const language = pressed?.dataset.language;

  return isLanguage(language) ? language : DEFAULT_LANGUAGE;
}

function openSettings(hint = ''): void {
  const settings = loadSettings();
  el<HTMLInputElement>('api-key').value = settings.apiKey;
  showLanguage(settings.outputLanguage);
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

  for (const button of languageButtons()) {
    button.addEventListener('click', () => {
      const language = button.dataset.language;
      if (isLanguage(language)) {
        showLanguage(language);
      }
    });
  }

  el('save-settings').addEventListener('click', () => {
    const apiKey = el<HTMLInputElement>('api-key').value.trim();
    saveSettings({ apiKey, outputLanguage: chosenLanguage() });

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
    const label = el('copy-label');
    await navigator.clipboard.writeText(el('result-text').textContent ?? '');
    label.textContent = 'Copied';
    setTimeout(() => {
      label.textContent = 'Copy';
    }, 1500);
  });

  // The share sheet is how the message arrived, so it is also how it should leave. Absent
  // on a browser without one, which is why the button ships hidden.
  el('share').hidden = !navigator.share;
  el('share').addEventListener('click', async () => {
    try {
      await navigator.share({ text: el('result-text').textContent ?? '' });
    } catch {
      // Dismissing the sheet rejects, and a reader changing their mind is not an error.
    }
  });

  el('again').addEventListener('click', () => showIdle());
  el('error-back').addEventListener('click', () => showIdle());
}

/**
 * The API key and a voice note parked mid-share both live in storage a browser is free to
 * evict when the device runs short. Asking costs nothing and a refusal changes nothing.
 */
function keepStorage(): void {
  void navigator.storage?.persist?.();
}

/** The File Handling API is Chromium-only, so the DOM lib does not carry it. */
declare global {
  interface Window {
    launchQueue?: {
      setConsumer(consume: (launch: { files: FileSystemFileHandle[] }) => void): void;
    };
  }
}

/** Chromium hands over files opened from the file manager here, not through the share cache. */
function collectLaunchedFiles(): void {
  if (!window.launchQueue) {
    return;
  }

  window.launchQueue.setConsumer(async (launch) => {
    const handle = launch.files.at(0);
    if (!handle) {
      return;
    }

    const file = await handle.getFile();
    await run(file, file.name);
  });
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Without a worker the app still runs; only the share target stops working.
  });
}

type ShareOutcome = {
  flag: string | null;
  /** What the share sheet sent when it sent no audio, as the worker saw it. */
  sent: string | null;
};

/** The share redirect leaves `?shared=` behind. Drop it so a reload isn't a re-share. */
function consumeShareFlag(): ShareOutcome {
  const params = new URLSearchParams(location.search);
  const flag = params.get('shared');

  if (flag !== null) {
    history.replaceState(null, '', location.pathname);
  }

  return { flag, sent: params.get('sent') };
}

async function boot(): Promise<void> {
  wireUp();
  registerServiceWorker();
  keepStorage();
  // Set before the first await: the launch is already queued by the time this runs.
  collectLaunchedFiles();

  const share = consumeShareFlag();
  const shared = await takeSharedAudio();

  if (shared) {
    await run(shared.blob, shared.filename);
    return;
  }

  if (share.flag === '0') {
    // The sheet's account of the share is the only clue to why, so it is shown rather than swallowed.
    showIdle(
      share.sent
        ? `That share did not include an audio file. It sent: ${share.sent}`
        : 'That share did not include an audio file.',
    );
    return;
  }

  if (!loadSettings().apiKey) {
    openSettings('Add your OpenRouter API key to get started.');
    return;
  }

  showIdle();
}

void boot();
