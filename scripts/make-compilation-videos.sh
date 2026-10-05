#!/bin/zsh
# make-compilation-videos.sh — One Filmora promo video project per track, for compilations
#
# Compilations (e.g. "Meanwhile Excursions" on MW — usually 6, 8 or 10 tracks, each by a
# different artist) don't use the per-track bg{n}.png flow from export-video-assets.sh.
# Instead there's a single 9:16 template project (e.g. MW078_excursions_promo_vid.wfp)
# built from shared stills (mark.png, title-cat-story.png, the logo), one sample mp3, and
# two Filmora TEXT clips: the track name (video track 7) and the artist name (video
# track 8). Each track's promo video is that same project with the two texts and the
# audio sample swapped — which is all this script does, once per track.
#
# Run after copying the previous compilation's template .wfp into this release's
# assets/videos/ folder. This script:
#   1. Chains into relink-video-project.sh first, so the template (and any other .wfp in
#      the folder) points at THIS release before anything is copied from it
#   2. Reads the tracklist — CLI args, or assets/videos/tracklist.txt, or prompts (and
#      saves what was typed to tracklist.txt so re-runs don't need it again)
#   3. For each track n, writes {CAT}_{TEMPLATE_SUFFIX}_{nn}.wfp next to the template:
#        - track-name text clip  → that track's title (upper-cased, like the template)
#        - artist-name text clip → that track's artist
#        - the sample audio clip → AUDIO_NAME with n substituted (e.g. "MW vid promo TRACK 3.mp3")
#        - new project name, save path and project GUID, so Filmora treats each as its
#          own project (the GUID keys Filmora's local backup/auto-recovery folder)
#   4. Warns about any media the generated projects reference that isn't on disk yet
#      (usually the per-track mp3 samples, or this volume's title-cat-story.png)
#
# The text lives in each text clip's "scriptBuf" — a JSON document stored as a string
# inside timeline.wesproj, with the visible text duplicated in "Text" and
# TextData[].CharData. Its sibling "scriptBufSize" is the UTF-8 byte length + 1 (a null
# terminator) and has to be kept in sync. The text clips aren't on the main timeline
# directly: video tracks 7/8 each hold a compound clip whose nested timeline (matched by
# timelineId) holds the actual text clip. Both timeline.wesproj and scriptBuf are compact
# JSON that round-trips byte-for-byte through Python's json module, so they're edited
# structurally rather than by substring replace.
#
# Track numbers are Filmora's own UI numbering: video tracks counted from the bottom of
# the timeline, i.e. the order of trackType==1 tracks in the main timeline's trackInfos.
#
# Usage:
#   Interactive:     ./scripts/make-compilation-videos.sh
#   Tracklist file:  ./scripts/make-compilation-videos.sh MW MW094
#                     (reads assets/videos/tracklist.txt, one "Artist - Title" per line)
#   Non-interactive: ./scripts/make-compilation-videos.sh MW MW094 "Graziano Raffa, Lonya - Breakups" ...
#
# Each "Artist - Title" is split on the FIRST " - ", so titles may contain " - " but
# artist names may not.

# ── LABEL CONFIGS ─────────────────────────────────────────────────────────────
LABEL_KEYS=("MW" "MWH")
LABEL_DISPLAY_NAMES=("Meanwhile Recordings" "Meanwhile Horizons")

configure_label() {
  case "$1" in
    MW)
      LABEL_NAME="Meanwhile Recordings"
      RELEASES_DIR="/Users/matter/Dropbox/- MEANWHILE/Releases - Meanwhile"
      # Template project is {anything}_{TEMPLATE_SUFFIX}.wfp in assets/videos/.
      TEMPLATE_SUFFIX="excursions_promo_vid"
      TITLE_VIDEO_TRACK=7
      ARTIST_VIDEO_TRACK=8
      # %d is replaced with the track number.
      AUDIO_NAME="MW vid promo TRACK %d.mp3"
      ;;
    MWH)
      LABEL_NAME="Meanwhile Horizons"
      RELEASES_DIR="/Users/matter/Dropbox/- MEANWHILE/Releases - Horizons"
      TEMPLATE_SUFFIX=""
      ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────────────

print ""
print -P "%F{cyan}%B-- Meanwhile Compilation Videos ──────────────────%b%f"
print ""

# ── MODE: CLI args vs interactive ─────────────────────────────────────────────
TRACK_ARGS=()
if [[ $# -ge 2 ]]; then
  LABEL_KEY="$1"
  CAT_NUMBER="$2"
  TRACK_ARGS=("${@:3}")
  configure_label "$LABEL_KEY"
  print -P "  %F{white}$LABEL_NAME%f"
  print ""

elif [[ $# -gt 0 ]]; then
  print -P "%F{red}Usage: ./scripts/make-compilation-videos.sh [labelKey catNumber [\"Artist - Title\" ...]]%f"
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

# ── GUARD: unconfigured label ──────────────────────────────────────────────────
if [[ -z "$TEMPLATE_SUFFIX" ]]; then
  print -P "%F{red}$LABEL_NAME has no compilation video template configured.%f"
  print -P "%F{white}Open scripts/make-compilation-videos.sh and complete the $LABEL_KEY block.%f"
  exit 1
fi

# ── FIND RELEASE FOLDER ───────────────────────────────────────────────────────
EXISTING=("${RELEASES_DIR}"/${CAT_NUMBER}*(N/))

if [[ ${#EXISTING[@]} -eq 1 ]]; then
  RELEASE_DIR="${EXISTING[1]}"
elif [[ ${#EXISTING[@]} -gt 1 ]]; then
  print -P "%F{red}Multiple folders match ${CAT_NUMBER}*:%f"
  for d in "${EXISTING[@]}"; do print -P "  %F{white}${d:t}%f"; done
  print -P "%F{white}Rename or remove duplicates and try again.%f"
  exit 1
else
  print -P "%F{red}No release folder found matching ${CAT_NUMBER}* in:%f"
  print -P "  %F{white}${RELEASES_DIR}%f"
  exit 1
fi

VIDEOS_DIR="${RELEASE_DIR}/assets/videos"
TRACKLIST_FILE="${VIDEOS_DIR}/tracklist.txt"

# ── STAGE 1: relink every copied .wfp (incl. the template) to this release ────
SCRIPT_DIR="${0:A:h}"
"$SCRIPT_DIR/relink-video-project.sh" "$LABEL_KEY" "$CAT_NUMBER" || {
  print -P "%F{red}Relink failed — fix the project(s) above before generating per-track videos.%f"
  exit 1
}

TEMPLATES=("${VIDEOS_DIR}"/*_${TEMPLATE_SUFFIX}.wfp(N))
if [[ ${#TEMPLATES[@]} -ne 1 ]]; then
  print -P "%F{red}Expected exactly one *_${TEMPLATE_SUFFIX}.wfp in assets/videos/, found ${#TEMPLATES[@]}.%f"
  for f in "${TEMPLATES[@]}"; do print -P "  %F{white}${f:t}%f"; done
  print -P "%F{white}Copy the previous compilation's template .wfp in (and remove any extras).%f"
  exit 1
fi
TEMPLATE_WFP="${TEMPLATES[1]}"

# ── STAGE 2: tracklist ────────────────────────────────────────────────────────
TRACK_LINES=()
if [[ ${#TRACK_ARGS[@]} -gt 0 ]]; then
  TRACK_LINES=("${TRACK_ARGS[@]}")
elif [[ -f "$TRACKLIST_FILE" ]]; then
  TRACK_LINES=("${(@f)$(<"$TRACKLIST_FILE")}")
  print -P "%F{white}Tracklist:%f  ${TRACKLIST_FILE:t}"
else
  print -P "%F{yellow}Tracks%f  %F{white}(\"Artist - Title\", blank line to finish)%f"
  n=1
  while true; do
    print -Pn "  ${n}. "
    read LINE
    [[ -z "$LINE" ]] && break
    TRACK_LINES+=("$LINE")
    (( n++ ))
  done
  if [[ ${#TRACK_LINES[@]} -gt 0 ]]; then
    print -l -- "${TRACK_LINES[@]}" > "$TRACKLIST_FILE"
    print -P "  %F{white}Saved to ${TRACKLIST_FILE:t} for re-runs.%f"
  fi
fi

# Drop blank/whitespace-only lines.
TRACK_LINES=(${TRACK_LINES:#[[:space:]]#})

if [[ ${#TRACK_LINES[@]} -eq 0 ]]; then
  print -P "%F{red}No tracks given.%f"
  exit 1
fi

for line in "${TRACK_LINES[@]}"; do
  if [[ "$line" != *" - "* ]]; then
    print -P "%F{red}Not in \"Artist - Title\" form:%f  $line"
    exit 1
  fi
done

print ""
print -P "%F{white}Template:%f  ${TEMPLATE_WFP:t}"
print -P "%F{white}Tracks:%f    ${#TRACK_LINES[@]}"
print ""

# ── STAGE 3: generate one .wfp per track ──────────────────────────────────────
WORK_ROOT="/tmp/meanwhile-compilation-videos-${CAT_NUMBER}"
rm -rf "$WORK_ROOT"
mkdir -p "$WORK_ROOT/template"
unzip -q "$TEMPLATE_WFP" -d "$WORK_ROOT/template"

TRACKS_JSON="$WORK_ROOT/tracks.json"
python3 - "$TRACKS_JSON" "${TRACK_LINES[@]}" << 'PYEOF'
import json, sys
out, lines = sys.argv[1], sys.argv[2:]
tracks = []
for line in lines:
    artist, title = line.split(" - ", 1)
    tracks.append({"artist": artist.strip(), "title": title.strip()})
with open(out, "w") as f:
    json.dump(tracks, f)
PYEOF

RESULT_TSV="$WORK_ROOT/result.tsv"
python3 - "$WORK_ROOT" "$TRACKS_JSON" "$VIDEOS_DIR" "${TEMPLATE_WFP:t:r}" \
  "$TITLE_VIDEO_TRACK" "$ARTIST_VIDEO_TRACK" "$AUDIO_NAME" > "$RESULT_TSV" << 'PYEOF'
import json, os, re, shutil, sys, uuid

(work_root, tracks_json, videos_dir, template_stem,
 title_track, artist_track, audio_name) = sys.argv[1:8]
title_track, artist_track = int(title_track), int(artist_track)

with open(tracks_json) as f:
    tracks = json.load(f)

template_dir = os.path.join(work_root, "template")
project_info_path = os.path.join(template_dir, "ProjectFolder", "project_info.json")
with open(project_info_path) as f:
    info = json.load(f)
timeline_rel = os.path.join(
    "ProjectFolder", "Medias", info["timeline_mediaId"], "timeline.wesproj"
)

def fail(msg):
    print("  ERROR: " + msg)
    sys.exit(1)

def text_clips(timeline, video_track_no):
    """Text clips (type 4) on the given 1-based video track of the main timeline,
    following compound clips (type 7) into their nested timelines."""
    by_id = {t["timelineId"]: t for t in timeline["timelineInfos"]}
    main = by_id[timeline["currentTimelineId"]]
    video_tracks = [t for t in main["trackInfos"] if t.get("trackType") == 1]
    if video_track_no > len(video_tracks):
        fail("template has only %d video tracks, need track %d" % (len(video_tracks), video_track_no))
    found = []
    def collect(clips):
        for c in clips:
            if c.get("type") == 4 and "scriptBuf" in c:
                found.append(c)
            elif c.get("type") == 7 and c.get("timelineId") in by_id:
                for tr in by_id[c["timelineId"]]["trackInfos"]:
                    collect(tr.get("clipList", []))
    collect(video_tracks[video_track_no - 1].get("clipList", []))
    return found

def set_text(clip, text):
    buf = json.loads(clip["scriptBuf"])
    buf["Text"] = text
    runs = buf.get("TextData") or []
    if not runs:
        fail("text clip has no TextData runs")
    # One styled run carrying the whole string — the template only ever has one,
    # and extra runs would keep stale text.
    runs[0]["CharData"] = text
    buf["TextData"] = runs[:1]
    new_buf = json.dumps(buf, separators=(",", ":"), ensure_ascii=False)
    clip["scriptBuf"] = new_buf
    clip["scriptBufSize"] = len(new_buf.encode("utf-8")) + 1

audio_re = re.compile(re.escape(audio_name).replace("%d", r"\d+") + "$")

def swap_audio(timeline, n):
    """Point the sample audio clip at track n's mp3. Returns (old, new) absolute paths."""
    new_name = audio_name.replace("%d", str(n))
    swapped = []
    for t in timeline["timelineInfos"]:
        for tr in t["trackInfos"]:
            for c in tr.get("clipList", []):
                fn = c.get("filename", "")
                if audio_re.search(fn):
                    c["filename"] = audio_re.sub(new_name, fn)
                    swapped.append((fn, c["filename"]))
    if len(swapped) != 1:
        fail("expected exactly one audio clip matching %r, found %d" % (audio_name, len(swapped)))
    # Clips find their media through a "resources" entry with the same sourceUuid,
    # which carries its own copy of the path.
    for r in timeline.get("resources", []):
        fn = r.get("filename", "")
        if audio_re.search(fn):
            r["filename"] = audio_re.sub(new_name, fn)
    old_uri, new_uri = swapped[0]
    to_path = lambda uri: "/" + uri[len("file://"):].lstrip("/")
    return to_path(old_uri), to_path(new_uri)

def repoint_media_bin(project_dir, old_path, new_path):
    """The clip is also mapped (extra.json) to a media-bin entry, which stores the
    path separately. Repoint that entry too, so the clip, its resource and its bin
    entry agree — otherwise the bin entry is left pointing at the template's mp3, and
    relink-video-project.sh's prune later drops it as unused."""
    medias_dir = os.path.join(project_dir, "ProjectFolder", "Medias")
    info_path = os.path.join(medias_dir, "medias_info.json")
    with open(info_path, encoding="utf-8") as f:
        medias_info = json.load(f)
    new_display = os.path.splitext(os.path.basename(new_path))[0]
    for media_id, item in medias_info.get("media_items", {}).items():
        if item.get("download_url") != old_path:
            continue
        item["download_url"] = new_path
        item["name"] = new_display
        media_json = os.path.join(medias_dir, media_id, "media.json")
        if os.path.isfile(media_json):
            with open(media_json, encoding="utf-8") as f:
                content = f.read()
            with open(media_json, "w", encoding="utf-8") as f:
                f.write(content.replace(json.dumps(old_path, ensure_ascii=False)[1:-1], json.dumps(new_path, ensure_ascii=False)[1:-1]))
    with open(info_path, "w", encoding="utf-8") as f:
        json.dump(medias_info, f)

def new_guid():
    return "-".join("%02X" % b for b in uuid.uuid4().bytes)

pad = max(2, len(str(len(tracks))))
referenced = set()

for n, track in enumerate(tracks, start=1):
    new_stem = "%s_%0*d" % (template_stem, pad, n)
    out_dir = os.path.join(work_root, new_stem)
    shutil.copytree(template_dir, out_dir)

    # Timeline: swap the two texts and the audio sample.
    timeline_path = os.path.join(out_dir, timeline_rel)
    with open(timeline_path, encoding="utf-8") as f:
        timeline = json.load(f)
    title_clips = text_clips(timeline, title_track)
    artist_clips = text_clips(timeline, artist_track)
    if not title_clips:
        fail("no text clip on video track %d (track name)" % title_track)
    if not artist_clips:
        fail("no text clip on video track %d (artist name)" % artist_track)
    for c in title_clips:
        set_text(c, track["title"].upper())
    for c in artist_clips:
        set_text(c, track["artist"].upper())
    old_audio, new_audio = swap_audio(timeline, n)
    with open(timeline_path, "w", encoding="utf-8") as f:
        f.write(json.dumps(timeline, separators=(",", ":"), ensure_ascii=False))
    repoint_media_bin(out_dir, old_audio, new_audio)

    for m in re.finditer(r'"file://([^"]*)"', json.dumps(timeline, ensure_ascii=False)):
        referenced.add("/" + m.group(1))

    # Project identity: name, save path, GUID (+ the backup path keyed by it).
    pi_path = os.path.join(out_dir, project_info_path[len(template_dir) + 1:])
    with open(pi_path, encoding="utf-8") as f:
        pi = f.read()
    old_guid = info["project_guid"]
    pi = pi.replace(template_stem + ".wfp", new_stem + ".wfp")
    pi = pi.replace('"%s"' % template_stem, '"%s"' % new_stem)
    pi = pi.replace(old_guid, new_guid())
    with open(pi_path, "w", encoding="utf-8") as f:
        f.write(pi)

    print("TRACK\t%d\t%s\t%s\t%s" % (n, new_stem, track["artist"].upper(), track["title"].upper()))

missing = sorted(p for p in referenced if not os.path.isfile(p))
for p in missing:
    print("MISSING\t" + p)
PYEOF
GEN_STATUS=$?

if (( GEN_STATUS != 0 )); then
  cat "$RESULT_TSV"
  print -P "%F{red}Generation failed — nothing written to assets/videos/. Scratch files in ${WORK_ROOT}%f"
  exit 1
fi

# ── STAGE 4: zip each generated project into assets/videos/ ───────────────────
WRITTEN=0
MISSING=()
while IFS=$'\t' read -r KIND A B C D; do
  if [[ "$KIND" == "MISSING" ]]; then
    MISSING+=("$A")
    continue
  fi
  [[ "$KIND" == "TRACK" ]] || continue
  OUT_WFP="${VIDEOS_DIR}/${B}.wfp"
  rm -f "$OUT_WFP"
  ( cd "$WORK_ROOT/$B" && zip -q -X -D -r "$OUT_WFP" ProjectFolder )
  if [[ -f "$OUT_WFP" ]]; then
    print -P "  %F{green}✓%f  videos/${OUT_WFP:t}  %F{white}${C} — ${D}%f"
    (( WRITTEN++ ))
  else
    print -P "  %F{red}✗%f  videos/${OUT_WFP:t}  %F{white}(zip failed)%f"
  fi
done < "$RESULT_TSV"

print ""
if (( ${#MISSING[@]} > 0 )); then
  print -P "%F{yellow}Referenced media not on disk yet (Filmora will show these offline):%f"
  for p in "${MISSING[@]}"; do print -P "  %F{white}${p:t}%f"; done
  print ""
fi

if (( WRITTEN < ${#TRACK_LINES[@]} )); then
  print -P "%F{red}Wrote ${WRITTEN} of ${#TRACK_LINES[@]} project(s).%f"
  exit 1
fi

print -P "%F{white}Wrote ${WRITTEN} project(s). Open each in Filmora, check the text fits, and export.%f"
print ""
