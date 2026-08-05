# tldl

A PWA that turns a shared WhatsApp voice message into the message the sender would have written. See `README.md` for what it does and how to run it.

## Shape

Vite + TypeScript + vanilla DOM. Tailwind is installed but unused: the markup is deliberately classless, pending a design pass. No framework, no router, no backend.

| File | Holds |
| --- | --- |
| `public/sw.js` | Share-target POST intercept. The one genuinely tricky file. |
| `public/manifest.webmanifest` | `share_target` declaration. Both MIME types and extensions in `accept`, or Android shows the app and then delivers nothing. |
| `src/share.ts` | Collects the parked file, destructively. |
| `src/openrouter.ts` | Both API calls. |
| `src/audio.ts` | Base64 and format detection. |
| `src/prompt.ts` | The rewrite prompt. Where output quality actually lives. |
| `src/main.ts` | View switching and wiring. |

## Constraints that are load-bearing

- **No backend, and it should stay that way.** OpenRouter sends `access-control-allow-origin: *` and allows `Authorization`, so the browser calls it directly. Verified, not assumed.
- **The API key is in `localStorage` by design.** Single user, own device, own origin. Do not add a proxy or a server-side key store without asking.
- **Opus goes up as `ogg`.** OpenRouter has no `opus` format. Do not add a client-side transcode; the provider decodes the codec.
- **The share sheet lies about MIME types.** `detectFormat` trusts the filename extension before the reported type, and falls back to `ogg`. Both behaviours are tested.
- **The origin is fixed.** Changing hostnames forces a reinstall of the PWA.

## Working on the prompt

`src/prompt.ts` is the product. The brief is faithful compression, not summarisation: keep the speaker's order, their points, their register, and every fact. Do not reorder to lead with a conclusion or a request. The user reads group threads he is not addressed in, so there is no "action item" to surface.

Changing it means re-running it against a real message and reading the output, not eyeballing the diff. Models differ sharply here and cheap ones invent detail.

## Testing

`npm test` runs `node --test` over `src/**/*.test.ts`. Node runs TypeScript directly; there is no test framework dependency and there should not be one.

Bugs get a failing test before a fix.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues on `rubenvanerk/tldl`, driven via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as GitHub label names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
