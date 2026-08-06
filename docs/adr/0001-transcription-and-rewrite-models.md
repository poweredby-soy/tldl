# 1. Transcription and rewrite models

Date: 2026-08-06

## Status

Accepted.

## Context

The pipeline makes two calls and the second one was carrying almost all of the wait. Measured
on a 416s German voice note (`docs/benchmarks/2026-08-06-pipeline-latency/`), transcription
took 2.41s and the rewrite took 10.88s to put its first word on screen and 27.09s to finish.
Transcription was about a tenth of the wait and 95% of the bill.

The rewrite model was also the least predictable part of the app. `deepseek/deepseek-v4-flash`
produced first words anywhere between 7.49s and 30.31s across four runs, with one run taking
65.61s end to end. And it was missing the brief in `src/prompt.ts`, which asks for a third to
a quarter of the spoken length: it returned roughly half.

## Decision

Transcribe with `openai/whisper-large-v3-turbo`. Rewrite with `google/gemini-3-flash-preview`.

Turbo is 2.2 times faster than `whisper-large-v3` and 2.8 times cheaper, and on this message it
transcribed better: large-v3 dropped its casing and punctuation for a stretch in the middle and
stuttered through it. Turbo is served only by Groq, which answers `verbose_json`, so the duration
and the spoken language still ride along.

`gemini-3-flash-preview` was the only rewrite model that was both quick and consistent: first
word inside 0.73-1.26s over six runs, output inside 1802-2259 characters, $0.0025.
`gemini-3.5-flash-lite` starts faster still but its compression swings between 51% and 77%.
`gemini-3.1-flash-lite` is bimodal, 1.00s when it skips thinking and around 5s when it does not.

`google/gemini-3.6-flash` stays as the model the rewrite falls back to.

## Consequences

Around 1.9s to the first word and 4.4s to a finished message, against 13.3s and 29.5s. Cost per
seven-minute message drops from about $0.0135 to about $0.0071.

`gemini-3-flash-preview` is a preview slug with no stable equivalent in the catalogue. When
Google retires it the request 404s on the primary model, `route: 'fallback'` moves to
`gemini-3.6-flash`, and the app keeps working at 4.74s to first word. Degraded, not broken. That
is the reason the fallback exists and it is why the preview slug is an acceptable default.

Both the default and the fallback are now Google models, so the pipeline no longer spans two
model vendors. Two distinct providers serve them on OpenRouter, Google AI Studio and Google, so
a single endpoint failing is still covered. A whole-vendor outage is not.

Transcription now depends on a single endpoint. `whisper-large-v3` had Together behind Groq;
turbo has nobody. The transcription endpoint takes neither a `models` list nor `route: fallback`,
so covering this would mean a retry in `transcribe()`. Not done.

`:nitro` on the transcription slug is now decorative. It was decorative before this change too:
plain `openai/whisper-large-v3` cost exactly Groq's rate, so both slugs were landing on Groq and
the routing the `fastest()` helper exists to force was already happening.

## The bug this surfaced

`transcribe()` always sent `response_format: 'verbose_json'`. Endpoints that do not implement it
return a hard 400 rather than ignoring it, and six of the twelve transcription models refuse it,
so any of those typed into Settings broke the app with an OpenRouter error.

It now asks again in plain `json` when the refusal names the format, and takes the transcript
without the duration and the spoken language. The prompt already handles their absence. A 400
raised for any other reason still stops there, because asking again costs the phone the whole
file a second time.
