# Where the wait actually goes, 2026-08-06

Run against one real WhatsApp voice note: 416.28s of German, 981 KB, mono 16 kHz Opus in Ogg.
Neither the audio nor the text any model made of it is in the repo. It is somebody's private
message, they did not send it to be published, and what survives here is the measurements.

Every number below came off the real endpoint with a real key. Costs are what OpenRouter
reported, not list prices multiplied out.

## The finding

Transcription was never the problem. It is about a tenth of the wait.

| | transcribe | rewrite, first word | rewrite, done | cost |
| --- | --- | --- | --- | --- |
| `whisper-large-v3:nitro` + `deepseek-v4-flash` | 2.41s | 10.88s | 27.09s | $0.0135 |
| `whisper-large-v3-turbo` + `gemini-3-flash-preview` | 1.10s | 0.88s | 3.33s | $0.0071 |

Six times faster to the first word on screen, eight times faster to a finished message,
and a little under half the price.

## Transcription

`response_format` is the first thing to know: `verbose_json` is not ignored by endpoints
that do not implement it, it is a hard 400. Six of twelve models refuse it. Two more refuse
Ogg/Opus outright whatever the format. The column below records which.

| model | runs | median s | range | cost | verbose_json | chars |
| --- | --- | --- | --- | --- | --- | --- |
| `openai/whisper-large-v3-turbo` | 4 | 1.10 | 0.99-1.29 | $0.0046 | ok | 7795 |
| `deepgram/nova-3` | 1 | 1.47 | - | $0.0298 | ok | 72 |
| `nvidia/parakeet-tdt-0.6b-v3` | 4 | 1.87 | 1.45-5.43 | $0.0104 | rejected | 8037 |
| `openai/whisper-large-v3` | 1 | 2.00 | - | $0.0128 | ok | 7770 |
| `openai/whisper-large-v3:nitro` | 4 | 2.41 | 2.21-2.97 | $0.0128 | ok | 7770 |
| `x-ai/grok-stt-1.0` | 4 | 3.06 | 2.85-3.64 | $0.0116 | ok | 6956 |
| `microsoft/mai-transcribe-1.5` | 1 | 3.47 | - | $0.0417 | rejected | 8455 |
| `mistralai/voxtral-mini-transcribe` | 1 | 4.47 | - | $0.0208 | rejected | 7811 |
| `openai/gpt-4o-mini-transcribe` | 1 | 12.74 | - | $0.0140 | rejected | 7947 |
| `fish-audio/transcribe-1` | 1 | 13.32 | - | $0.0417 | ok | 8104 |
| `openai/gpt-transcribe` | 1 | 14.62 | - | $0.0313 | rejected | 7807 |
| `qwen/qwen3-asr-flash-2026-02-10` | - | - | - | - | rejected | rejects Ogg/Opus |
| `google/chirp-3` | - | - | - | - | rejected | rejects Ogg/Opus |

Turbo is 2.2 times faster than large-v3 and 2.8 times cheaper. Groq's own figures, 189x
against 216x real time, predict a 14% gap; the gap on the wire is much wider than the
decode, so most of what turbo saves is not decode time.

Turbo also reads better. For one stretch in the middle large-v3 loses its casing and its
punctuation and stutters through the passage, repeating half-clauses; turbo renders the same
seconds as two clean sentences. Across the whole message large-v3 runs 46.7 words per sentence
mark against turbo's 37.6. Turbo also hears one German compound as the single word it is where
large-v3 splits it into two.

`deepgram/nova-3` charged the most and returned 72 characters of English fragments off
seven minutes of German. `grok-stt-1.0` came back 10% shorter than the whisper pair, which
is content going missing rather than compression.

`:nitro` is currently doing nothing. Plain `openai/whisper-large-v3` cost $0.01283, which is
Groq's $0.111/hour over 416.28s to five figures. Together's endpoint would have been $0.0104.
Both slugs land on Groq.

## Rewrite

Same transcript in every run, the live `src/prompt.ts`, streaming, so "first word" is the
moment text starts appearing on screen. `shorter` is against the 7795-character transcript;
the prompt asks for a third to a quarter, so 67-75% is the target.

| model | sort | runs | first word s | range | total s | cost | shorter |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `google/gemini-3.5-flash-lite` | latency | 3 | 0.42 | 0.41-0.43 | 2.66 | $0.0024 | 51-77% |
| `google/gemini-3-flash-preview` | latency | 6 | 0.88 | 0.73-1.26 | 3.33 | $0.0025 | 71-77% |
| `google/gemini-3.6-flash` | latency | 3 | 4.74 | 3.39-5.00 | 7.84 | $0.0113 | 72-78% |
| `google/gemini-3.1-flash-lite` | latency | 6 | 4.99 | 1.00-6.08 | 5.94 | $0.0031 | 65-79% |
| `google/gemini-3.5-flash` | latency | 3 | 6.95 | 6.26-7.01 | 8.59 | $0.0209 | 69-72% |
| `deepseek/deepseek-v4-flash` | default | 1 | 8.91 | - | 29.86 | $0.0005 | 47% |
| `deepseek/deepseek-v4-flash` | throughput | 4 | 10.88 | 7.49-30.31 | 27.09 | $0.0007 | 39-62% |
| `google/gemini-3.6-flash` | throughput | 1 | 11.74 | - | 14.69 | $0.0176 | 74% |
| `deepseek/deepseek-v4-flash` | latency | 3 | 17.65 | 15.20-20.26 | 40.63 | $0.0009 | 36-48% |

deepseek is the slowest thing in the pipeline and the least predictable: first word between
7.49s and 30.31s, one run 65.61s end to end. It also misses the brief, returning roughly half
the transcript where the prompt asks for a quarter. That contradicts the note in `ddd665e`
that it compressed hardest. Different message and possibly different settings, so call it
unreplicated rather than wrong, but it does not hold here.

Ranges matter more than medians in this table. `gemini-3.1-flash-lite` looks mid-table at
4.99s but its six runs are bimodal, 1.00s when it skips thinking and 4.86-6.08s when it does
not. `gemini-3.5-flash-lite` has the fastest first word of anything measured and the widest
spread of output length, 51% to 77%, so its compression is a coin flip.
`gemini-3-flash-preview` is the only one that is both quick and consistent: six runs inside
0.73-1.26s, output inside 1802-2259 characters.

### Provider routing on the rewrite

Three passes of `gemini-3-flash-preview`, changing only the routing.

| sort | first word s | total s | cost | served by | thinking |
| --- | --- | --- | --- | --- | --- |
| `throughput` | 0.76-1.12 | 3.07-3.50 | $0.0025 | Google AI Studio | none |
| `latency` | 0.83-1.16 | 3.15-3.63 | $0.0026 | Google AI Studio | none |
| none | 8.92-9.59 | 11.92-13.58 | $0.0058 | Google | 1513-1650ch |

Sorting is load-bearing and either sort will do. Without one the request lands on Vertex, which
honours `reasoning: { effort: 'low' }` where AI Studio ignores it, and the thinking is the whole
difference: ten times the wait and more than twice the price for the same job.

Dropping the `reasoning` field entirely changes nothing on AI Studio, 0.79-0.84s either way. It
stays on the request because the fallback model does read it.

### Two settings that sound right and are not

`reasoning: { enabled: false }` does not buy back the wait. First word 11.18s against 12.48s
for `low`, no thinking emitted, and output grew to 4528 characters. `f2e1692` reverted it for
producing spoken-length output; that still happens, and there is no latency to gain either.

`provider: { sort: 'latency' }` made deepseek worse, 17.65s to first word against 10.88s under
`throughput`. OpenRouter's latency statistic is not time to first token in a way that helps here.

### One call instead of two

Sending the voice note straight to an audio model and asking for the rewrite skips
transcription entirely.

| model | runs | first word s | total s | cost | shorter |
| --- | --- | --- | --- | --- | --- |
| `google/gemini-3-flash-preview` | 3 | 1.83 | 4.28 | $0.0063 | 76-81% |
| `google/gemini-3.1-flash-lite` | 3 | 2.76 | 8.17 | $0.0080 | -2-10% |
| `google/gemini-3.6-flash` | 3 | 5.21 | 6.54 | $0.0203 | 72-84% |

Fast, and it invents. Both of the usable ones expanded an organisation the speaker named only
in short into a longer name they never said, and misspelled a domain term. One replaced a
person's name outright with a different name that sounds nothing like it, where every
transcription model heard a consistent third thing. `gemini-3.1-flash-lite` ignored the prompt
and transcribed. The two-call pipeline is faster, cheaper, keeps the transcript and the
duration, and a model that only ever sees text cannot mishear a name.

## Re-running this

```
export OPENROUTER_API_KEY=...
./stt-bench.sh ~/voice.ogg verbose_json openai/whisper-large-v3-turbo openai/whisper-large-v3:nitro
node rewrite-bench.ts 3 stt-results/openai_whisper-large-v3-turbo.txt ~/voice.ogg
```

`transcription.json` and `rewrite.json` hold every run of this one: timings, costs, character
counts. What each model actually wrote is not here, because the message it wrote about belongs
to the person who sent it. Bring your own and read the output, because half of this cannot be
judged from timings.
