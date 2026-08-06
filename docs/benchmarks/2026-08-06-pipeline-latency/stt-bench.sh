#!/usr/bin/env bash
# Times the OpenRouter transcription endpoint per model, the way src/openrouter.ts calls it:
# multipart, the file named voice.ogg under an audio/ogg type.
#
# Usage: OPENROUTER_API_KEY=... ./stt-bench.sh <path/to/voice.ogg> <json|verbose_json> <model>...
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
AUDIO="$1"; shift
FORMAT="$1"; shift
OUT="$DIR/stt-results"
mkdir -p "$OUT"

for model in "$@"; do
  slug="${model//\//_}"
  slug="${slug//:/-}"
  timing=$(curl -s -X POST 'https://openrouter.ai/api/v1/audio/transcriptions' \
    -H "Authorization: Bearer $OPENROUTER_API_KEY" \
    -H 'HTTP-Referer: https://tldl.local' \
    -H 'X-Title: tldl-bench' \
    -F "model=$model" \
    -F "file=@$AUDIO;type=audio/ogg;filename=voice.ogg" \
    -F "response_format=$FORMAT" \
    -o "$OUT/$slug.json" \
    -w '%{time_starttransfer} %{time_total} %{http_code}')
  echo "$model $timing"
done
