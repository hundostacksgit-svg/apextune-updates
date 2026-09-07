#!/usr/bin/env bash
# Cut the promo to a song.
#
#   tools/promo/make-beat-video.sh mysong.mp3 [seconds] [start-seconds]
#
# Finds the beat, renders every cut onto it, and muxes the audio back so the
# picture and the track stay locked. Output: omnidx-beatcut.mp4 in the repo root.
set -euo pipefail
cd "$(dirname "$0")/../.."

SONG=${1:?usage: make-beat-video.sh <audio file> [length] [start]}
LEN=${2:-15}
START=${3:-0}
FPS=${FPS:-30}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

python3 tools/promo/beatsync.py "$SONG" --length "$LEN" --start "$START"

# Serve the repo so the page can load the screenshots and the beat map.
python3 -m http.server 8099 --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; rm -rf "$WORK"' EXIT
sleep 2

PAGE=beatcut FPS="$FPS" SP="$WORK" node tools/promo/render.mjs

# The audio has to be cut from the same --start the beats were measured from,
# or the picture is right and the sound is late by exactly that much.
ffmpeg -y -v error -framerate "$FPS" -i "$WORK/vid/frames-beatcut/f%05d.jpg" \
  -ss "$START" -i "$SONG" \
  -c:v libx264 -pix_fmt yuv420p -crf 19 -preset slow -r "$FPS" \
  -c:a aac -b:a 192k -shortest -movflags +faststart omnidx-beatcut.mp4

echo "wrote omnidx-beatcut.mp4"
