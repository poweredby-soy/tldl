# tldl

Too long; didn't listen.

Share a WhatsApp voice message into this PWA from the Android share sheet and get back the message the sender would have written, if they had written it instead of talking for seven minutes.

Single user, no accounts, no backend.

## How it works

A static site, a service worker, and two calls to OpenRouter.

1. The share sheet POSTs the audio to `/share` as `multipart/form-data`.
2. The service worker intercepts that POST, because a static host cannot accept one. It parks the file in a Cache and redirects to `/`.
3. The app collects the file on boot and drops it from the cache so a reload cannot reprocess it.
4. `POST /api/v1/audio/transcriptions` returns the transcript, in whatever language was spoken. The audio goes up as `multipart/form-data`, so the bytes travel as bytes. Asking for `verbose_json` also buys the duration, shown under the result, and the language that was heard, which the rewrite prompt then names instead of inferring. About a second for a seven-minute message, and a tenth of the wait.
5. `POST /api/v1/chat/completions` rewrites the transcript in the speaker's voice, in the language picked in Settings, keeping their order and their points. It streams, so the message writes itself onto the screen instead of landing all at once at the end. The copy button, the transcript and the cost appear once it is whole.

WhatsApp voice notes are Opus inside an Ogg container. OpenRouter has no `opus` format, so they go up under an `.ogg` name and an `audio/ogg` type and the provider decodes the codec. The Android share sheet is unreliable about MIME types, so `src/audio.ts` trusts the filename extension first.

The share sheet is Android only. WebKit has never implemented the Web Share Target API, so an installed PWA cannot register itself with the iOS share sheet; on iOS that belongs to App Store apps and their Share Extensions. Nothing in the manifest changes this. On iOS the file picker on the start screen is the whole story: save the voice note out of WhatsApp into Files, open the app, pick it.

## Setup

```
npm install
npm run dev
```

Open Settings and paste an OpenRouter API key. It lives in `localStorage` on that device and is sent only to `openrouter.ai`. Use a dedicated key with a spend limit, because anything running in the browser can read it.

## Deploy

Static App site on Laravel Forge, web directory `/dist`. Deploy script:

```
git pull origin main
npm ci
npm run build
```

The origin must stay fixed. Changing hostnames means uninstalling and reinstalling the PWA on the phone.

## Speed and cost

About 1.9 seconds before the first word appears and 4.4 to a finished message, for a seven-minute voice note. Around $0.007 of that message, roughly two thirds of it transcription. A typical one or two minute message is a fifth of a cent. Every response reports its real cost, shown under the result.

Defaults are `openai/whisper-large-v3-turbo` and `google/gemini-3-flash-preview`, both overridable in Settings, both picked by measuring one real message against the whole catalogue. `docs/benchmarks/2026-08-06-pipeline-latency/` has the numbers and `docs/adr/0001-transcription-and-rewrite-models.md` has the reasoning. Gemini 3.6 Flash is the model the rewrite falls back to when every endpoint of the chosen one is down, which is also what happens the day Google retires a preview slug.

Transcription goes up as `:nitro`, the shorthand for sorting providers by throughput. The default model has one endpoint so it changes nothing there; it is for the slugs Settings can be pointed at, because transcription is most of the bill and the default routing weights price. A slug that already names a variant in Settings keeps the one it names.

The transcription call asks for `verbose_json`, which buys the duration and the spoken language that the rewrite prompt then names instead of inferring. Endpoints that do not implement it answer 400 rather than ignoring it, and half of them have not, so a refusal that names the format is asked again in plain `json`. That message loses the duration and the language and keeps the transcript, which is the part worth having.

The rewrite sorts providers by throughput, and that is load-bearing: unsorted, the request lands on the endpoint that thinks before answering, which is ten times the wait before the first word and twice the price. It also asks for `low` reasoning effort, which the default model's endpoint ignores and the fallback reads. With reasoning off entirely a model gives the message back in the language it was spoken and at close to its spoken length.

Routing is worth watching. The model has twenty-odd endpoints and the default routing weights price, hence the throughput sort. Several of those endpoints serve fp4, so a throughput sort can land the rewrite on a heavily quantised one. If quality drifts, pin the quantisation with `provider.quantizations` before blaming the prompt. Sort by `latency` instead of `throughput` if time to the first word matters more than time to the last.

## Commands

```
npm run dev       # dev server
npm run build     # typecheck, then build to dist/
npm run preview   # serve dist/
npm test          # node --test
```

## Known rough edges

- Rewrite length varies noticeably run to run on the same input.
- Uncommon proper nouns get mangled by transcription and then silently smoothed over by the rewrite. Groq supports a vocabulary hint on Whisper, which would fix this at the source.
- The rewrite model ignores the prompt's instruction to avoid em-dashes.
