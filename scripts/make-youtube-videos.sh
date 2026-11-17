#!/bin/zsh
# make-youtube-videos.sh — One YouTube-ready MP4 per mastered track
#
# For every release pack/masters/*.wav, renders a 16:9 video: the full, untouched master
# as audio, and a still frame of that track's square cover centred (with a soft drop
# shadow) over a zoomed, lightly blurred, desaturated copy of itself. The picture fades
# in from black at the start and out to black at the end; the audio is not faded.
#
# Per-track covers come from export-video-assets.sh, which writes (in assets/videos/):
#   cover{n}.png       — the whole cover, mark included, showing ONLY track n's name
#   track-names.txt    — the track names, line n = cover{n}.png
# Each master is matched to a track by name (see match_track). A master that can't be
# matched — or a release where export-video-assets.sh hasn't been run since cover{n}.png
# was added — falls back to the full release cover release pack/artwork/*Cover*.jpg,
# which lists every track, with a warning.
#
# Output: release pack/youtube/  (deliberately NOT release pack/videos/, which
# check-dropbox treats as the promo-video deliverable)
#   {CAT} - {track}.png   — the still frame (also handy as the thumbnail)
#   {CAT} - {track}.mp4   — {track} = master filename minus " MASTERED"
#
# Look (matched against the hand-made MW093 Tonaco video): cover at 91% of frame height,
# shadow ~0.8% of height blur offset down-right, background = assets/videos/cover-mark.png
# (the mark alone, from export-video-assets.sh) on black, scaled to 124% of frame width,
# saturation 0.5, light blur. Falls back to the track's cover if cover-mark.png is missing.
#
# The frame is composited ONCE to a PNG; the video then decodes it once and repeats it
# with the loop filter ("-loop 1" re-decodes the 4K PNG every frame and was ~6x slower),
# so only the fades are computed per frame. ~2x realtime on an M3 Pro.
# Existing MP4s are skipped unless FORCE=1. Each MP4 is encoded in a local temp dir and
# moved into Dropbox only when finished (see WORK_DIR).
#
# Env overrides:
#   HEIGHT=1080   output height (default 2160 = 4K; width is always 16:9)
#   FADE=3        fade in/out seconds (default 2)
#   FORCE=1       re-render MP4s that already exist
#   FRAME_ONLY=1  only build the frame PNG(s) for review — no MP4s encoded
#   BG_SATURATION=0  background saturation (0 = greyscale; default per label)
#   BG_MAX_LEVEL=0.55  background highlight cap, 0–1 (default per label)
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
COVER_SIZE=$(( HEIGHT * 91 / 100 ))   # 1965px at 4K
BG_SIZE=$(( WIDTH * 124 / 100 ))       # background cover, square, overflows the frame
SHADOW_BLUR=$(( HEIGHT / 120 ))        # 18px at 4K
SHADOW_OFFSET=$(( HEIGHT / 240 ))      # 9px at 4K
SHADOW_OPACITY=0.7
FPS=30

# ── LABEL CONFIGS ─────────────────────────────────────────────────────────────
LABEL_KEYS=("MW" "MWH")
LABEL_DISPLAY_NAMES=("Meanwhile Recordings" "Meanwhile Horizons")

configure_label() {
  case "$1" in
    MW)
      LABEL_NAME="Meanwhile Recordings"
      RELEASES_DIR="$HOME/Dropbox/- MEANWHILE/Releases - Meanwhile"
      # Background: the mark alone on black (no gradient)
      BG_ASSET="cover-mark.png"
      BG_SATURATION="${BG_SATURATION:-0.5}"
      BG_MAX_LEVEL="${BG_MAX_LEVEL:-1}"
      ;;
    MWH)
      LABEL_NAME="Meanwhile Horizons"
      RELEASES_DIR="$HOME/Dropbox/- MEANWHILE/Releases - Horizons"
      # Background: the sky alone. The Horizons mark (sun) is dark grey on its own — it
      # only reads on the cover via blending with the sky — so it vanishes on black.
      # Greyscale with highlights capped at 55%, so the bright clouds don't pull focus
      # from the cover (approved on MWH026).
      BG_ASSET="sky.png"
      BG_SATURATION="${BG_SATURATION:-0}"
      BG_MAX_LEVEL="${BG_MAX_LEVEL:-0.55}"
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
VIDEO_ASSETS_DIR="${RELEASE_DIR}/assets/videos"
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

FULL_COVERS=("${ARTWORK_DIR}"/*(#i)cover*.(#i)(jpg|jpeg|png)(N.))
FULL_COVER="${FULL_COVERS[1]}"

# Background source, per label (BG_ASSET in configure_label), from export-video-assets.sh:
# MW = cover-mark.png (mark alone, transparent, at its cover position → mark on black),
# MWH = sky.png (sky alone, no sun/text). If missing, the track's own cover is used.
BG_SOURCE="${VIDEO_ASSETS_DIR}/${BG_ASSET}"
if [[ ! -f "$BG_SOURCE" ]]; then
  print -P "%F{yellow}No assets/videos/${BG_ASSET} — run export-video-assets.sh. Using the cover as background.%f"
  BG_SOURCE=""
fi

TRACK_NAMES=()
if [[ -f "${VIDEO_ASSETS_DIR}/track-names.txt" ]]; then
  TRACK_NAMES=("${(@f)$(<"${VIDEO_ASSETS_DIR}/track-names.txt")}")
  TRACK_NAMES=(${TRACK_NAMES:#})
fi

# Lower-case, punctuation → spaces, single-spaced, padded with spaces at both ends so
# "*${needle}*" only matches whole words.
norm() {
  local s="${(L)1}"
  s="${s//[^a-z0-9]/ }"
  print -r -- " ${(j: :)${=s}} "
}

# Print the 1-based track number whose name best matches master filename $1, or
# nothing if none (or a tie). A track's full name (e.g. "Leaves (Dub Mix)") matching
# beats just its base name before any "(" ("Leaves"), so an original and its remix
# resolve to the right cover; longer matches beat shorter ones.
match_track() {
  local master="$(norm "$1")" best="" best_score=0 tied=0 n full base score
  for (( n = 1; n <= ${#TRACK_NAMES[@]}; n++ )); do
    full="$(norm "${TRACK_NAMES[$n]}")"
    base="$(norm "${TRACK_NAMES[$n]%%\(*}")"
    score=0
    if [[ "$master" == *"$full"* ]]; then score=$(( 1000 + ${#full} ))
    elif [[ "$base" != "  " && "$master" == *"$base"* ]]; then score=${#base}
    fi
    if (( score > best_score )); then best=$n; best_score=$score; tied=0
    elif (( score > 0 && score == best_score )); then tied=1
    fi
  done
  (( tied )) || print -r -- "$best"
}

mkdir -p "$OUT_DIR"

print -P "%F{white}Release:%f  ${RELEASE_DIR:t}"
if [[ ${#TRACK_NAMES[@]} -gt 0 ]]; then
  print -P "%F{white}Tracks:%f   ${(j:, :)TRACK_NAMES}  %F{white}(assets/videos/track-names.txt)%f"
else
  print -P "%F{yellow}No assets/videos/track-names.txt — run export-video-assets.sh first for per-track covers.%f"
  print -P "%F{yellow}Falling back to the full cover for every track.%f"
fi
print -P "%F{white}Output:%f   release pack/youtube/  (${WIDTH}x${HEIGHT}, ${FADE}s fades)"
print ""

START_EPOCH=$(date +%s)

# MP4s are encoded here, off Dropbox, then moved in whole. Encoding to a temp name
# inside the Dropbox folder and renaming over an existing file got reverted by
# Dropbox's sync (the finished MP4 vanished and the temp file came back).
WORK_DIR="$(mktemp -d -t meanwhile-youtube)"
trap 'rm -rf "$WORK_DIR"' EXIT

# ── Frame: cover centred with drop shadow over a zoomed, muted copy of itself ─
# Highlight cap only when below 1 — colorlevels at 1 isn't a byte-exact no-op.
BG_LEVELS_FILTER=""
if (( BG_MAX_LEVEL < 1 )); then
  BG_LEVELS_FILTER=",colorlevels=romax=${BG_MAX_LEVEL}:gomax=${BG_MAX_LEVEL}:bomax=${BG_MAX_LEVEL}"
fi

# Input 0 = this track's cover, input 1 = background source (BG_SOURCE, or the cover).
# The background is laid over black first, which is a no-op for an opaque cover.
FRAME_FILTER="[0:v]null[b];
  color=c=black:s=${BG_SIZE}x${BG_SIZE}:d=1[blk];
  [1:v]scale=${BG_SIZE}:${BG_SIZE}:flags=bicubic,format=rgba[bgsrc];
  [blk][bgsrc]overlay=0:0,crop=${WIDTH}:${HEIGHT},
     gblur=sigma=$(( HEIGHT / 360 )),eq=saturation=${BG_SATURATION}:brightness=-0.03${BG_LEVELS_FILTER}[bg];
  [b]scale=${COVER_SIZE}:${COVER_SIZE}:flags=lanczos,format=rgba[fg];
  color=c=black@${SHADOW_OPACITY}:s=${COVER_SIZE}x${COVER_SIZE}:d=1,format=rgba,
     pad=w=iw+$(( SHADOW_BLUR * 8 )):h=ih+$(( SHADOW_BLUR * 8 )):x=$(( SHADOW_BLUR * 4 )):y=$(( SHADOW_BLUR * 4 )):color=black@0,
     gblur=sigma=${SHADOW_BLUR}[sh];
  [bg][sh]overlay=x=(W-w)/2+${SHADOW_OFFSET}:y=(H-h)/2+${SHADOW_OFFSET}[bs];
  [bs][fg]overlay=(W-w)/2:(H-h)/2,format=rgb24"

# ── One frame + MP4 per master ────────────────────────────────────────────────
FAILED=()
for WAV in "${MASTERS[@]}"; do
  TRACK="${WAV:t:r}"
  TRACK="${TRACK//(#i)[ _-]#mastered/}"
  OUT_MP4="${OUT_DIR}/${CAT_NUMBER} - ${TRACK}.mp4"
  TMP_MP4="${WORK_DIR}/${CAT_NUMBER} - ${TRACK}.mp4"
  FRAME_PNG="${OUT_DIR}/${CAT_NUMBER} - ${TRACK}.png"

  if [[ -f "$OUT_MP4" && -z "$FORCE" && -z "$FRAME_ONLY" ]]; then
    print -P "%F{white}Skipping (exists, FORCE=1 to redo):%f ${OUT_MP4:t}"
    continue
  fi

  # Pick this track's cover
  COVER=""
  if [[ ${#TRACK_NAMES[@]} -gt 0 ]]; then
    N="$(match_track "${WAV:t:r}")"
    if [[ -n "$N" && -f "${VIDEO_ASSETS_DIR}/cover${N}.png" ]]; then
      COVER="${VIDEO_ASSETS_DIR}/cover${N}.png"
    elif [[ -n "$N" ]]; then
      print -P "%F{yellow}cover${N}.png missing — re-run export-video-assets.sh. Using the full cover.%f"
    else
      print -P "%F{yellow}Couldn't match \"${WAV:t}\" to a track name. Using the full cover.%f"
    fi
  fi
  if [[ -z "$COVER" ]]; then
    COVER="$FULL_COVER"
  fi
  if [[ -z "$COVER" ]]; then
    print -P "%F{red}No cover found for ${TRACK} (no cover{n}.png, no release pack/artwork/*Cover*).%f"
    FAILED+=("$TRACK"); continue
  fi

  print -P "%F{yellow}Rendering%f ${TRACK}  %F{white}← ${COVER:t}%f"
  if ! ffmpeg -hide_banner -loglevel error -y -i "$COVER" -i "${BG_SOURCE:-$COVER}" \
       -filter_complex "$FRAME_FILTER" -frames:v 1 "$FRAME_PNG"; then
    print -P "  %F{red}✗ failed to build frame%f"; FAILED+=("$TRACK"); continue
  fi
  if [[ -n "$FRAME_ONLY" ]]; then
    print -P "  %F{green}✓%f ${FRAME_PNG:t}  %F{white}(FRAME_ONLY — no video)%f"
    continue
  fi

  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WAV")
  if [[ -z "$DUR" ]]; then
    print -P "%F{red}Could not read duration:%f ${WAV:t}"; FAILED+=("$TRACK"); continue
  fi
  FADE_OUT_START=$(( DUR - FADE ))
  MINS=$(( ${DUR%.*} / 60 )); SECS=$(( ${DUR%.*} % 60 ))

  print -P "  %F{white}$(printf '%d:%02d' $MINS $SECS), encoding…%f"

  if ffmpeg -hide_banner -loglevel error -stats -y \
       -i "$FRAME_PNG" -i "$WAV" -t "$DUR" \
       -filter_complex "[0:v]format=yuv420p,loop=loop=-1:size=1,fps=${FPS},fade=t=in:st=0:d=${FADE},fade=t=out:st=${FADE_OUT_START}:d=${FADE}[v]" \
       -map "[v]" -map 1:a \
       -c:v libx264 -preset fast -tune stillimage -crf 18 -r $FPS -g $(( FPS * 2 )) \
       -c:a aac -b:a 384k -ar 48000 \
       -movflags +faststart "$TMP_MP4"; then
    rm -f "$OUT_MP4"
    mv "$TMP_MP4" "$OUT_MP4"
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
