#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRAME_PATTERN="$ROOT/public/assets/frames/ice-%03d.webp"
OUTPUT="$ROOT/public/assets/ice-melt.webm"

ffmpeg \
  -y \
  -framerate 30 \
  -i "$FRAME_PATTERN" \
  -an \
  -c:v libvpx-vp9 \
  -pix_fmt yuva420p \
  -auto-alt-ref 0 \
  -b:v 0 \
  -crf 30 \
  "$OUTPUT"
