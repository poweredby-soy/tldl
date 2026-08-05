# tldl

Too long; didn't listen.

Share a WhatsApp voice message into this PWA from the Android share sheet and get back the message the sender would have written, if they had written it instead of talking for seven minutes.

Single user, no accounts, no backend.

## How it works

A static site, a service worker, and two calls to OpenRouter.

1. The share sheet POSTs the audio to `/share` as `multipart/form-data`.
2. The service worker intercepts that POST, because a static host cannot accept one. It parks the file in a Cache and redirects to `/`.
3. The app collects the file on boot, drops it from the cache so a reload cannot reprocess it, and base64-encodes it.
4. `POST /api/v1/audio/transcriptions` returns the transcript, in whatever language was spoken.
5. `POST /api/v1/chat/completions` rewrites the transcript in the speaker's voice, in English, keeping their order and their points. It streams, so the message writes itself onto the screen instead of landing all at once at the end. The copy button, the transcript and the cost appear once it is whole.

WhatsApp voice notes are Opus inside an Ogg container. OpenRouter has no `opus` format, so they go up as `ogg` and the provider decodes the codec. The Android share sheet is unreliable about MIME types, so `src/audio.ts` trusts the filename extension first.

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

## Cost

Around $0.014 for a seven-minute message, of which roughly 96% is transcription. A typical one or two minute message is well under half a cent. Every response reports its real cost, shown under the result.

Defaults are `openai/whisper-large-v3` and `deepseek/deepseek-v4-flash`, both overridable in Settings. deepseek was picked over Claude Sonnet 5 and Gemini 3.6 Flash on a real message: it kept the speaker's order and facts, compressed hardest, and cost a fraction as much.

The rewrite asks for `low` reasoning effort and for provider routing sorted by throughput. Thinking is dead air before the first word reaches the screen, but turning it off entirely costs the prompt: the message comes back in the language it was spoken and at close to its spoken length. Low is the middle that keeps both.

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
