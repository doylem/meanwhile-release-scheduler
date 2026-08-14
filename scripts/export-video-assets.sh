#!/bin/zsh
# export-video-assets.sh — Export promo-video image layers from the finished artwork
#
# Run AFTER new-release.sh — the master file must already have the correct artwork, and
# assets/images/{PSB_TRACKS} (copied there by new-release.sh) must hold the correct
# multi-line track list.
#
# MW and Horizons compose their promo videos differently, so what gets exported differs:
#   MW:       bg{n}.png (background + track name baked together, mark hidden) + mark.png
#   Horizons: sky.png (background alone, no text) + titles{n}.png (artist/catalogue/track
#             name + wordmark, transparent, mark+background hidden) + mark.png (the sun)
# Both still export one "everything else" pass per track plus one mark pass, so the
# track-reading (Stage 1) and mark export (part of Stage 3) share the same helpers —
# only which layers get hidden for the "per track" pass, and whether there's a separate
# flat-background pass, differs per label.
#
# The master file is not one flat design — it's several side-by-side Photoshop artboards
# (Story, 4x5/Cover Square, FB Banner, SC Banner, Spotify) on one large canvas, each
# with its own independent set of layers. This script targets ARTBOARD_NAME only (the
# square "Cover" board) and isolates it with Document.trim() — Document.crop() does not
# work on documents containing real Photoshop Artboards (confirmed by testing: it
# silently no-ops), and these boards are plain positioned groups rather than real
# Artboards anyway, so trim-on-transparency is the reliable option either way.
#
# The track-name text is NOT a plain text layer — it's a Smart Object (see
# SMART_OBJECTS_JS in new-release.sh). Its link target is THIS RELEASE'S OWN
# assets/images/{PSB_TRACKS} — not the shared template copy (confirmed via the Action
# Manager smartObject descriptor's "link" path). So to show a single track name in each
# per-track export, this script has to, per track:
#   1. write that one track name into the release's own archived PSB
#   2. open the master file fresh (a live/already-open document does not pick up the
#      change — confirmed by testing; only a fresh open resolves current content)
#   3. export the PNG
# then restore the archived PSB to the full track list afterwards.
#
# On success, chains straight into relink-video-project.sh with the same label/cat
# args (Phase 2 — relinks every copied Filmora .wfp project found in assets/videos/
# to this release; relink-video-project.sh itself needs no label-specific logic).
#
# Usage:
#   Interactive:     ./scripts/export-video-assets.sh
#   Non-interactive: ./scripts/export-video-assets.sh MW MW090
#                     ./scripts/export-video-assets.sh MWH MWH024

# ── LABEL CONFIGS ─────────────────────────────────────────────────────────────
LABEL_KEYS=("MW" "MWH")
LABEL_DISPLAY_NAMES=("Meanwhile Recordings" "Meanwhile Horizons")

configure_label() {
  case "$1" in

    MW)
      LABEL_NAME="Meanwhile Recordings"
      TEMPLATE_DIR="/Users/matter/Dropbox/- MEANWHILE/_MW-Template/MW"
      RELEASES_DIR="/Users/matter/Dropbox/- MEANWHILE/Releases - Meanwhile"
      MASTER_EXT="tif"
      MARK_PSB="MW - mark.psb"
      PSB_TRACKS="MW - track names.psb"
      # Static logo asset — copy meanwhile_RGB_logo_2023-no-border.png into
      # _MW-Template/MW/ to have it picked up automatically, or leave blank.
      LOGO_PNG="${TEMPLATE_DIR}/meanwhile_RGB_logo_2023-no-border.png"
      LAYER_TRACKS="TRACK_NAMES"
      LAYER_MARK="Mark"
      JUST_TRACKS="LEFT"
      ARTBOARD_NAME="Meanwhile Release Cover"
      ;;

    MWH)
      LABEL_NAME="Meanwhile Horizons"
      TEMPLATE_DIR="/Users/matter/Dropbox/- MEANWHILE/_MW-Template/MWH"
      RELEASES_DIR="/Users/matter/Dropbox/- MEANWHILE/Releases - Horizons"
      MASTER_EXT="psd"
      MARK_PSB="MWH - mark.psb"
      PSB_TRACKS="MWH - track names.psb"
      LOGO_PNG="${TEMPLATE_DIR}/Meanwhile-horizons-beatport-logo-cropped.png"
      LAYER_TRACKS="TRACK_NAMES"
      LAYER_MARK="Behind"
      JUST_TRACKS="RIGHT"
      ARTBOARD_NAME="MWH Release Cover Square"
      # Horizons splits its per-track export into a flat background (no text) and a
      # transparent text/logo overlay, unlike MW which bakes text into the background —
      # so the per-track pass hides Background+Behind (mark) and shows everything else,
      # and there's an extra background-only pass hiding everything except Background.
      HIDE_FOR_TITLES=("$LAYER_MARK" "Background")
      HIDE_FOR_SKY=("$LAYER_MARK" "Artist + Catalogue" "Tracks" "Horizons logo")
      ;;

  esac
}

# ─────────────────────────────────────────────────────────────────────────────

print ""
print -P "%F{cyan}%B-- Meanwhile Video Asset Export ──────────────────%b%f"
print ""

# ── MODE: CLI args vs interactive ─────────────────────────────────────────────
if [[ $# -eq 2 ]]; then
  LABEL_KEY="$1"
  CAT_NUMBER="$2"
  configure_label "$LABEL_KEY"
  print -P "  %F{white}$LABEL_NAME%f"
  print ""

elif [[ $# -gt 0 ]]; then
  print -P "%F{red}Usage: ./scripts/export-video-assets.sh [labelKey catNumber]%f"
  print -P "%F{white}Either supply both args or none for interactive mode.%f"
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
if [[ -z "$MARK_PSB" || -z "$PSB_TRACKS" || -z "$ARTBOARD_NAME" ]]; then
  print -P "%F{red}$LABEL_NAME is not fully configured yet.%f"
  print -P "%F{white}Open scripts/export-video-assets.sh and complete the $LABEL_KEY block.%f"
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

ASSETS_DIR="${RELEASE_DIR}/assets/images"
VIDEOS_DIR="${RELEASE_DIR}/assets/videos"
TIF_PATH="${ASSETS_DIR}/${CAT_NUMBER} - Release Assets.${MASTER_EXT}"
# Both PSBs are read from this release's own archived copies — that's what the
# master file's Smart Objects are actually linked to, not the shared template.
MARK_PSB_PATH="${ASSETS_DIR}/${MARK_PSB}"
TRACKS_PSB_PATH="${ASSETS_DIR}/${PSB_TRACKS}"

if [[ ! -f "$TIF_PATH" ]]; then
  print -P "%F{red}Master file not found: ${TIF_PATH:t}%f"
  print -P "%F{white}Run new-release.sh first to set up the release artwork.%f"
  exit 1
fi

if [[ ! -f "$MARK_PSB_PATH" ]]; then
  print -P "%F{red}Mark PSB not found: ${MARK_PSB_PATH:t}%f"
  print -P "%F{white}Run new-release.sh first to set up the release artwork.%f"
  exit 1
fi

if [[ ! -f "$TRACKS_PSB_PATH" ]]; then
  print -P "%F{red}Track names PSB not found: ${TRACKS_PSB_PATH:t}%f"
  print -P "%F{white}Run new-release.sh first to set up the release artwork.%f"
  exit 1
fi

print -P "%F{white}Release:%f  ${RELEASE_DIR:t}"
print -P "%F{white}Master:%f   ${TIF_PATH:t}"
print -P "%F{white}Output:%f   assets/videos/"
print ""

START_EPOCH=$(date +%s)

# ── ESCAPE HELPER ─────────────────────────────────────────────────────────────
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# JS array literal of quoted strings, e.g. jsArray(("A" "B")) -> ["A","B"]
jsArray() {
  local out="[" first=1
  for item in "$@"; do
    if [[ $first -eq 0 ]]; then out+=","; fi
    out+="\"$(esc "$item")\""
    first=0
  done
  out+="]"
  print -n "$out"
}

# Shared JSX helper functions, inlined into every generated file below.
JSX_HELPERS='
function findLayer(layers, name) {
  for (var i = 0; i < layers.length; i++) {
    if (layers[i].name === name) return layers[i];
    if (layers[i].typename === "LayerSet") {
      var f = findLayer(layers[i].layers, name);
      if (f) return f;
    }
  }
  return null;
}

function exportPNG(doc, outFile, transparency) {
  var opts = new ExportOptionsSaveForWeb();
  opts.format       = SaveDocumentType.PNG;
  opts.PNG8         = false;   // PNG-24
  opts.transparency = transparency;
  doc.exportDocument(outFile, ExportType.SAVEFORWEB, opts);
}

function setTrackText(psbPath, layerName, text, justification) {
  var doc   = open(new File(psbPath));
  var layer = findLayer(doc.layers, layerName);
  if (!layer) {
    alert("Layer not found: " + layerName + "\nin: " + doc.name);
  } else {
    layer.textItem.contents = text;
    var justMap = { "LEFT": Justification.LEFT, "RIGHT": Justification.RIGHT, "CENTER": Justification.CENTER };
    if (justMap[justification]) layer.textItem.justification = justMap[justification];
    doc.save();
  }
  doc.close(SaveOptions.DONOTSAVECHANGES);
}

// Isolate ARTBOARD_NAME in a fresh duplicate of the master file: hide every sibling
// top-level board, hide each name in hideNames within the target board (everything
// else in the target board keeps its authored visibility), then trim. Document.crop()
// does not work on documents containing real Photoshop Artboards (confirmed by
// testing: it silently no-ops), so trim() is used instead, based on pixel
// transparency rather than artboard bounds metadata.
function makeExportDoc(tifPath, artboardName, hideNames) {
  var tifDoc = open(new File(tifPath));
  var exportDoc = tifDoc.duplicate("mw_video_export", false);
  tifDoc.close(SaveOptions.DONOTSAVECHANGES);

  var target = null;
  for (var i = 0; i < exportDoc.layers.length; i++) {
    var l = exportDoc.layers[i];
    if (l.typename !== "LayerSet") continue;
    var isTarget = (l.name === artboardName);
    l.visible = isTarget;
    if (isTarget) target = l;
  }

  if (!target) {
    alert("Artboard not found: " + artboardName);
    return null;
  }

  for (var h = 0; h < hideNames.length; h++) {
    var hideLayer = findLayer(target.layers, hideNames[h]);
    if (hideLayer) hideLayer.visible = false;
  }

  exportDoc.trim(TrimType.TRANSPARENT, true, true, true, true);
  return exportDoc;
}
'

run_jsx() {
  # AppleScript's default Apple Event timeout is 120s — too short once a document
  # this large (100MB+ master, 600MB+ linked background for Horizons) is involved,
  # so it's raised explicitly here rather than relying on the default.
  osascript << APPLEEOF > /dev/null
with timeout of 1800 seconds
  tell application "Adobe Photoshop 2026"
    do javascript of file "$1"
  end tell
end timeout
APPLEEOF
}

# ── STAGE 1: read track names from the release's own archived PSB ─────────────
TRACKS_FILE="/tmp/meanwhile-video-tracks-${CAT_NUMBER}.txt"
rm -f "$TRACKS_FILE"

READ_TRACKS_JSX="/tmp/meanwhile-video-read-tracks-${CAT_NUMBER}.jsx"
cat > "$READ_TRACKS_JSX" << JSXEOF
${JSX_HELPERS}
var PSB_PATH     = "$(esc "$TRACKS_PSB_PATH")";
var LAYER_TRACKS = "$(esc "$LAYER_TRACKS")";
var OUT_PATH     = "$(esc "$TRACKS_FILE")";

var doc   = open(new File(PSB_PATH));
var layer = findLayer(doc.layers, LAYER_TRACKS);

if (!layer) {
  alert("Layer not found: " + LAYER_TRACKS + "\nin: " + doc.name);
} else {
  var rawLines = layer.textItem.contents.split("\r");
  var out = new File(OUT_PATH);
  out.lineFeed = "Unix"; // force \n — default may be Macintosh (\r), which breaks line-based reads
  out.open("w");
  for (var i = 0; i < rawLines.length; i++) {
    var t = rawLines[i].replace(/^\s+|\s+$/g, "");
    if (t.length > 0) out.writeln(t);
  }
  out.close();
}
doc.close(SaveOptions.DONOTSAVECHANGES);
JSXEOF

print -P "  %F{cyan}Reading track names from ${PSB_TRACKS:t}...%f"
run_jsx "$READ_TRACKS_JSX"

if [[ ! -f "$TRACKS_FILE" ]]; then
  print -P "%F{red}Could not read track names — check Photoshop for an alert dialog.%f"
  exit 1
fi

tracks=("${(@f)$(<"$TRACKS_FILE")}")
tracks=(${tracks:#})

if [[ ${#tracks[@]} -eq 0 ]]; then
  print -P "%F{red}No track names found in ${PSB_TRACKS:t}.%f"
  exit 1
fi

print -P "  %F{white}Tracks (${#tracks[@]}):%f  ${(j:, :)tracks}"
print ""

# ── STAGE 2: per track — write single track name into the archived PSB, open  ─
#             the master file fresh, export the per-track image(s) ───────────
for (( n = 1; n <= ${#tracks[@]}; n++ )); do
  TRACK_NAME="${tracks[$n]}"
  print -P "  %F{white}Track ${n}:%f  ${TRACK_NAME}"

  EXPORT_BG_JSX="/tmp/meanwhile-video-export-bg-${CAT_NUMBER}-${n}.jsx"

  if [[ "$LABEL_KEY" == "MWH" ]]; then
    cat > "$EXPORT_BG_JSX" << JSXEOF
${JSX_HELPERS}
var PSB_PATH      = "$(esc "$TRACKS_PSB_PATH")";
var LAYER_TRACKS  = "$(esc "$LAYER_TRACKS")";
var JUST_TRACKS   = "$(esc "$JUST_TRACKS")";
var TRACK_TEXT    = "$(esc "$TRACK_NAME")";
var TIF_PATH      = "$(esc "$TIF_PATH")";
var ARTBOARD_NAME = "$(esc "$ARTBOARD_NAME")";
var HIDE_NAMES    = $(jsArray "${HIDE_FOR_TITLES[@]}");
var OUT_PATH      = "$(esc "${VIDEOS_DIR}/titles${n}.png")";

setTrackText(PSB_PATH, LAYER_TRACKS, TRACK_TEXT, JUST_TRACKS);

var exportDoc = makeExportDoc(TIF_PATH, ARTBOARD_NAME, HIDE_NAMES);
if (exportDoc) {
  exportPNG(exportDoc, new File(OUT_PATH), true);
  exportDoc.close(SaveOptions.DONOTSAVECHANGES);
}
JSXEOF
  else
    cat > "$EXPORT_BG_JSX" << JSXEOF
${JSX_HELPERS}
var PSB_PATH      = "$(esc "$TRACKS_PSB_PATH")";
var LAYER_TRACKS  = "$(esc "$LAYER_TRACKS")";
var JUST_TRACKS   = "$(esc "$JUST_TRACKS")";
var TRACK_TEXT    = "$(esc "$TRACK_NAME")";
var TIF_PATH      = "$(esc "$TIF_PATH")";
var ARTBOARD_NAME = "$(esc "$ARTBOARD_NAME")";
var LAYER_MARK    = "$(esc "$LAYER_MARK")";
var OUT_PATH      = "$(esc "${VIDEOS_DIR}/bg${n}.png")";

setTrackText(PSB_PATH, LAYER_TRACKS, TRACK_TEXT, JUST_TRACKS);

var exportDoc = makeExportDoc(TIF_PATH, ARTBOARD_NAME, [LAYER_MARK]);
if (exportDoc) {
  exportPNG(exportDoc, new File(OUT_PATH), false);
  exportDoc.close(SaveOptions.DONOTSAVECHANGES);
}
JSXEOF
  fi

  run_jsx "$EXPORT_BG_JSX"
done

# ── STAGE 3: restore the archived PSB to the full track list, export mark.png  ─
#             (and, for Horizons, the flat sky.png background) ────────────────
FULL_TRACK_TEXT=""
for t in "${tracks[@]}"; do
  if [[ -n "$FULL_TRACK_TEXT" ]]; then FULL_TRACK_TEXT="${FULL_TRACK_TEXT}\\r"; fi
  FULL_TRACK_TEXT="${FULL_TRACK_TEXT}$(esc "$t")"
done

FINISH_JSX="/tmp/meanwhile-video-finish-${CAT_NUMBER}.jsx"

if [[ "$LABEL_KEY" == "MWH" ]]; then
  cat > "$FINISH_JSX" << JSXEOF
${JSX_HELPERS}
var PSB_PATH     = "$(esc "$TRACKS_PSB_PATH")";
var LAYER_TRACKS = "$(esc "$LAYER_TRACKS")";
var JUST_TRACKS  = "$(esc "$JUST_TRACKS")";
var FULL_TEXT    = "${FULL_TRACK_TEXT}";
var MARK_PSB     = "$(esc "$MARK_PSB_PATH")";
var MARK_OUT     = "$(esc "${VIDEOS_DIR}/mark.png")";
var TIF_PATH     = "$(esc "$TIF_PATH")";
var ARTBOARD_NAME= "$(esc "$ARTBOARD_NAME")";
var HIDE_NAMES   = $(jsArray "${HIDE_FOR_SKY[@]}");
var SKY_OUT      = "$(esc "${VIDEOS_DIR}/sky.png")";

setTrackText(PSB_PATH, LAYER_TRACKS, FULL_TEXT, JUST_TRACKS);

// mark.png — from the mark PSB with transparency
var markDoc = open(new File(MARK_PSB));
for (var m = 0; m < markDoc.layers.length; m++) {
  var ml = markDoc.layers[m];
  if (ml.isBackgroundLayer || ml.name.toLowerCase() === "background") {
    try { ml.visible = false; } catch (e) {}
  }
}
exportPNG(markDoc, new File(MARK_OUT), true);
markDoc.close(SaveOptions.DONOTSAVECHANGES);

// sky.png — flat background only, isolated from the master file
var skyDoc = makeExportDoc(TIF_PATH, ARTBOARD_NAME, HIDE_NAMES);
if (skyDoc) {
  exportPNG(skyDoc, new File(SKY_OUT), true);
  skyDoc.close(SaveOptions.DONOTSAVECHANGES);
}
JSXEOF
else
  cat > "$FINISH_JSX" << JSXEOF
${JSX_HELPERS}
var PSB_PATH     = "$(esc "$TRACKS_PSB_PATH")";
var LAYER_TRACKS = "$(esc "$LAYER_TRACKS")";
var JUST_TRACKS  = "$(esc "$JUST_TRACKS")";
var FULL_TEXT    = "${FULL_TRACK_TEXT}";
var MARK_PSB     = "$(esc "$MARK_PSB_PATH")";
var OUT_PATH     = "$(esc "${VIDEOS_DIR}/mark.png")";

setTrackText(PSB_PATH, LAYER_TRACKS, FULL_TEXT, JUST_TRACKS);

// mark.png — from the mark PSB with transparency
var markDoc = open(new File(MARK_PSB));
for (var m = 0; m < markDoc.layers.length; m++) {
  var ml = markDoc.layers[m];
  if (ml.isBackgroundLayer || ml.name.toLowerCase() === "background") {
    try { ml.visible = false; } catch (e) {}
  }
}
exportPNG(markDoc, new File(OUT_PATH), true);
markDoc.close(SaveOptions.DONOTSAVECHANGES);
JSXEOF
fi

print -P "  %F{cyan}Restoring track list + exporting mark.png$( [[ "$LABEL_KEY" == "MWH" ]] && echo " + sky.png")...%f"
run_jsx "$FINISH_JSX"

# ── COPY STATIC LOGO (if available in template folder) ────────────────────────
if [[ -f "$LOGO_PNG" ]]; then
  cp "$LOGO_PNG" "$VIDEOS_DIR/"
  print -P "  %F{green}+%f  videos/$(basename "$LOGO_PNG")"
fi

# ── REPORT ────────────────────────────────────────────────────────────────────
print ""
EXPECTED=()
if [[ "$LABEL_KEY" == "MWH" ]]; then
  for (( n = 1; n <= ${#tracks[@]}; n++ )); do
    EXPECTED+=("${VIDEOS_DIR}/titles${n}.png")
  done
  EXPECTED+=("${VIDEOS_DIR}/sky.png")
  EXPECTED+=("${VIDEOS_DIR}/mark.png")
else
  for (( n = 1; n <= ${#tracks[@]}; n++ )); do
    EXPECTED+=("${VIDEOS_DIR}/bg${n}.png")
  done
  EXPECTED+=("${VIDEOS_DIR}/mark.png")
fi

FOUND=0
for f in "${EXPECTED[@]}"; do
  if [[ -f "$f" ]]; then
    MTIME=$(stat -f %m "$f")
    if (( MTIME >= START_EPOCH )); then
      print -P "  %F{green}✓%f  videos/${f:t}"
      (( FOUND++ ))
    else
      print -P "  %F{red}✗%f  videos/${f:t}  %F{white}(stale — not written this run)%f"
    fi
  else
    print -P "  %F{red}✗%f  videos/${f:t}  %F{white}(missing)%f"
  fi
done

print ""
if (( FOUND < ${#EXPECTED[@]} )); then
  print -P "  %F{red}Not all files were written — check Photoshop for an alert dialog.%f"
  print ""
  exit 1
fi
print ""

# ── CHAIN: relink the Filmora .wfp project to this release ────────────────────
SCRIPT_DIR="${0:A:h}"
"$SCRIPT_DIR/relink-video-project.sh" "$LABEL_KEY" "$CAT_NUMBER"
