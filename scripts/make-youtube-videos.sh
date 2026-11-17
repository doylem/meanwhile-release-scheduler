#!/bin/zsh
# make-youtube-videos.sh — One YouTube-ready MP4 per mastered track
#
# For every release pack/masters/*.wav, renders a widescreen video: the full,
# untouched master as audio, and a still frame of the square cover artwork centred
# over a blurred, darkened, zoomed-in copy of itself. The picture fades in from black
# at the start and out to black at the end; the audio is not faded.
#
# Inputs (all inside the release folder):
#   release pack/masters/*.wav          — one video per file (.asd sidecars ignored)
#   release pack/artwork/*Cover*.jpg    — the flat square cover (MW "Meanwhile Release
#                                         Cover.jpg", MWH "MWH Release Cover Square.jpg")
#   release pack/artwork/*YouTube*.jpg|png — OPTIONAL designed 16:9 frame. If present it's
#                                         used as-is (scaled to fit) instead of the
#                                         generated blurred-cover frame.
#
# Output: release pack/youtube/  (deliberately NOT release pack/videos/, which
# check-dropbox treats as the promo-video deliverable)
#   {CAT} - youtube frame.png           — the still frame (also handy as a thumbnail)
#   {CAT} - {track}.mp4                 — {track} = master filename minus " MASTERED"
#
# The frame is composited ONCE to a PNG, then each track encodes that PNG with only
# the fades applied — blurring a 4K frame per video frame would be far slower. The PNG
# is decoded once and repeated with the loop filter rather than "-loop 1" (which
# re-decodes the 4K PNG every frame) — ~6x faster, about 4x realtime on an M3 Pro.
# Existing MP4s are skipped unless FORCE=1. Each MP4 is written to a temp name and
# renamed on success, so Dropbox never syncs a half-written file.
#
# Env overrides:
#   HEIGHT=1080   output height (default 2160 = 4K; width is always 16:9)
#   FADE=3        fade in/out seconds (default 2)
#   FORCE=1       re-render MP4s that already exist
#
# Usage:
#   Interactive:     ./scripts/make-youtube-videos.sh
#   Non-interactive: ./scripts/make-youtube-videos.sh MW MW096
#   One track only:  ./scripts/make-youtube-videos.sh MW MW096 ambision
#                    (3rd arg = case-insensitive substring of the master filename)

setopt extendedglob

HEIGHT="${HEIGHT:-2160}"
FADE="${FADE:-2}"
WIDTH=$(( HEIGHT * 16 / 9 ))
COVER_SIZE=$(( HEIGHT * 5 / 6 ))   # square cover = 5/6 of frame height (1800px at 4K)
FPS=30

# ── LABEL CONFIGS ─────────────────────────────────────────────────────────────
LABEL_KEYS=("MW" "MWH")
LABEL_DISPLAY_NAMES=("Meanwhile Recordings" "Meanwhile Horizons")

configure_label() {
  case "$1" in
    MW)
      LABEL_NAME="Meanwhile Recordings"
      RELEASES_DIR="$HOME/Dropbox/- MEANWHILE/Releases - Meanwhile"
      ;;
    MWH)
      LABEL_NAME="Meanwhile Horizons"
      RELEASES_DIR="$HOME/Dropbox/- MEANWHILE/Releases - Horizons"
      ;;
    *)
      print -P "%F{red}Unknown label: $1 (expected MW or MWH)%f"; exit 1
      ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────────────

print ""
print -P "%F{cyan}%B-- Meanwhile YouTube Videos ──────────────────────%b%f"
print ""

for tool in ffmpeg ffprobe; do
  if ! command -v $tool > /dev/null; then
    print -P "%F{red}$tool not found.%f %F{white}Install with: brew install ffmpeg%f"
    exit 1
  fi
done

# ── MODE: CLI args vs interactive ─────────────────────────────────────────────
TRACK_FILTER=""
if [[ $# -eq 2 || $# -eq 3 ]]; then
  LABEL_KEY="$1"
  CAT_NUMBER="$2"
  TRACK_FILTER="$3"
  configure_label "$LABEL_KEY"
  print -P "  %F{white}$LABEL_NAME%f"
  print ""

elif [[ $# -gt 0 ]]; then
  print -P "%F{red}Usage: ./scripts/make-youtube-videos.sh [labelKey catNumber [trackFilter]]%f"
  exit 1

else
  print -P "%F{yellow}Label:%f"
  for i in $(seq 1 ${#LABEL_KEYS[@]}); do
    print -P "  $i.  ${LABEL_DISPLAY_NAMES[$i]}  %F{white}(${LABEL_KEYS[$i]})%f"
  done
  print -Pn "  > "
  read LABEL_CHOICE

  if [[ "$LABEL_CHOICE" =~ ^[0-9]+$ ]] && (( LABEL_CHOICE >= 1 && LABEL_CHOICE <= ${#LABEL_KEYS[@]} )); then
    LABEL_KEY="${LABEL_KEYS[$LABEL_CHOICE]}"
  else
    print -P "%F{red}Invalid choice.%f"; exit 1
  fi

  configure_label "$LABEL_KEY"
  print -P "  %F{white}$LABEL_NAME%f"
  print ""

  print -Pn "%F{yellow}Catalogue number%f  : "
  read CAT_NUMBER
  if [[ -z "$CAT_NUMBER" ]]; then print -P "%F{red}Required.%f"; exit 1; fi
fi

# ── FIND RELEASE FOLDER ───────────────────────────────────────────────────────
EXISTING=("${RELEASES_DIR}"/${CAT_NUMBER}*(N/))

if [[ ${#EXISTING[@]} -eq 1 ]]; then
  RELEASE_DIR="${EXISTING[1]}"
elif [[ ${#EXISTING[@]} -gt 1 ]]; then
  print -P "%F{red}Multiple folders match ${CAT_NUMBER}*:%f"
  for d in "${EXISTING[@]}"; do print -P "  %F{white}${d:t}%f"; done
  exit 1
else
  print -P "%F{red}No release folder found matching ${CAT_NUMBER}* in:%f"
  print -P "  %F{white}${RELEASES_DIR}%f"
  exit 1
fi

PACK_DIR="${RELEASE_DIR}/release pack"
MASTERS_DIR="${PACK_DIR}/masters"
ARTWORK_DIR="${PACK_DIR}/artwork"
OUT_DIR="${PACK_DIR}/youtube"

# ── INPUTS ────────────────────────────────────────────────────────────────────
MASTERS=("${MASTERS_DIR}"/*.(#i)wav(N.))
if [[ -n "$TRACK_FILTER" ]]; then
  # Match on the filename only — the release folder name often contains track titles.
  FILTERED=()
  for m in "${MASTERS[@]}"; do
    [[ "${m:t}" == (#i)*${TRACK_FILTER}* ]] && FILTERED+=("$m")
  done
  MASTERS=("${FILTERED[@]}")
fi
if [[ ${#MASTERS[@]} -eq 0 ]]; then
  print -P "%F{red}No masters found${TRACK_FILTER:+ matching \"$TRACK_FILTER\"} in:%f"
  print -P "  %F{white}${MASTERS_DIR}%f"
  exit 1
fi

DESIGNED_FRAME=("${ARTWORK_DIR}"/*(#i)youtube*.(#i)(jpg|jpeg|png)(N.))
COVERS=("${ARTWORK_DIR}"/*(#i)cover*.(#i)(jpg|jpeg|png)(N.))
COVERS=(${COVERS:#*(#i)youtube*})

if [[ ${#DESIGNED_FRAME[@]} -eq 0 && ${#COVERS[@]} -eq 0 ]]; then
  print -P "%F{red}No cover artwork found in:%f"
  print -P "  %F{white}${ARTWORK_DIR}%f"
  print -P "%F{white}Expected a *Cover*.jpg (or a *YouTube*.jpg/png frame).%f"
  exit 1
fi

mkdir -p "$OUT_DIR"
FRAME_PNG="${OUT_DIR}/${CAT_NUMBER} - youtube frame.png"

print -P "%F{white}Release:%f  ${RELEASE_DIR:t}"
if [[ ${#DESIGNED_FRAME[@]} -gt 0 ]]; then
  print -P "%F{white}Frame:%f    ${DESIGNED_FRAME[1]:t} (designed)"
else
  print -P "%F{white}Cover:%f    ${COVERS[1]:t}"
fi
print -P "%F{white}Output:%f   release pack/youtube/  (${WIDTH}x${HEIGHT}, ${FADE}s fades)"
print ""

START_EPOCH=$(date +%s)

# ── STAGE 1: composite the still frame ────────────────────────────────────────
print -P "%F{yellow}Building frame…%f"
if [[ ${#DESIGNED_FRAME[@]} -gt 0 ]]; then
  # Letterbox rather than crop, so nothing in a designed frame is ever cut off.
  FRAME_FILTER="[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos,
    pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,format=rgb24"
  FRAME_INPUT="${DESIGNED_FRAME[1]}"
else
  # Background: cover zoomed to fill the frame, blurred and darkened. The blur runs
  # at quarter resolution then scales back up — same look, much faster.
  FRAME_FILTER="[0:v]split[a][b];
    [a]scale=$(( WIDTH / 4 )):$(( WIDTH / 4 )),crop=$(( WIDTH / 4 )):$(( HEIGHT / 4 )),
       gblur=sigma=12,eq=brightness=-0.18:saturation=0.9,
       scale=${WIDTH}:${HEIGHT}:flags=bicubic[bg];
    [b]scale=${COVER_SIZE}:${COVER_SIZE}:flags=lanczos[fg];
    [bg][fg]overlay=(W-w)/2:(H-h)/2,format=rgb24"
  FRAME_INPUT="${COVERS[1]}"
fi

if ! ffmpeg -hide_banner -loglevel error -y -i "$FRAME_INPUT" \
     -filter_complex "$FRAME_FILTER" -frames:v 1 "$FRAME_PNG"; then
  print -P "%F{red}Failed to build frame.%f"; exit 1
fi
print -P "  %F{green}✓%f ${FRAME_PNG:t}"
print ""

# ── STAGE 2: one MP4 per master ───────────────────────────────────────────────
FAILED=()
for WAV in "${MASTERS[@]}"; do
  TRACK="${WAV:t:r}"
  TRACK="${TRACK//(#i)[ _-]#mastered/}"
  OUT_MP4="${OUT_DIR}/${CAT_NUMBER} - ${TRACK}.mp4"
  TMP_MP4="${OUT_DIR}/.${CAT_NUMBER} - ${TRACK}.partial.mp4"

  if [[ -f "$OUT_MP4" && -z "$FORCE" ]]; then
    print -P "%F{white}Skipping (exists, FORCE=1 to redo):%f ${OUT_MP4:t}"
    continue
  fi

  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WAV")
  if [[ -z "$DUR" ]]; then
    print -P "%F{red}Could not read duration:%f ${WAV:t}"; FAILED+=("$TRACK"); continue
  fi
  FADE_OUT_START=$(( DUR - FADE ))
  MINS=$(( ${DUR%.*} / 60 )); SECS=$(( ${DUR%.*} % 60 ))

  print -P "%F{yellow}Rendering%f ${TRACK} %F{white}($(printf '%d:%02d' $MINS $SECS))%f"

  if ffmpeg -hide_banner -loglevel error -stats -y \
       -i "$FRAME_PNG" -i "$WAV" -t "$DUR" \
       -filter_complex "[0:v]format=yuv420p,loop=loop=-1:size=1,fps=${FPS},fade=t=in:st=0:d=${FADE},fade=t=out:st=${FADE_OUT_START}:d=${FADE}[v]" \
       -map "[v]" -map 1:a \
       -c:v libx264 -preset fast -tune stillimage -crf 18 -r $FPS -g $(( FPS * 2 )) \
       -c:a aac -b:a 384k -ar 48000 \
       -movflags +faststart "$TMP_MP4"; then
    mv -f "$TMP_MP4" "$OUT_MP4"
    print -P "  %F{green}✓%f ${OUT_MP4:t}"
  else
    rm -f "$TMP_MP4"
    print -P "  %F{red}✗ failed%f"
    FAILED+=("$TRACK")
  fi
done

ELAPSED=$(( $(date +%s) - START_EPOCH ))
print ""
if [[ ${#FAILED[@]} -gt 0 ]]; then
  print -P "%F{red}Done with ${#FAILED[@]} failure(s) in ${ELAPSED}s:%f ${(j:, :)FAILED}"
  exit 1
fi
print -P "%F{green}%BDone in ${ELAPSED}s.%b%f  ${OUT_DIR}"
