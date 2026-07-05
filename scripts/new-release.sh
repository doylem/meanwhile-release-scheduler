#!/bin/zsh
# new-release.sh — Artwork asset generator for Meanwhile labels
#
# Two ways to run:
#   Interactive:   ./scripts/new-release.sh
#   From the app:  ./scripts/new-release.sh MW "MW091" "Artist" "EP Title" "Track 1" "Track 2"
#
# Files are copied into {release folder}/assets/images/ so PSBs live
# alongside the rest of the release folder structure.

# ── LABEL CONFIGS ─────────────────────────────────────────────────────────────
LABEL_KEYS=("MW" "MWH")
LABEL_DISPLAY_NAMES=("Meanwhile Recordings" "Meanwhile Horizons")

configure_label() {
  case "$1" in

    MW)
      LABEL_NAME="Meanwhile Recordings"
      TEMPLATE_DIR="/Users/matter/Dropbox/- MEANWHILE/_MW-Template/MW"
      RELEASES_DIR="/Users/matter/Dropbox/- MEANWHILE/Releases - Meanwhile"
      RELEASE_FOLDER_TEMPLATE="/Users/matter/Dropbox/- MEANWHILE/Releases - Meanwhile/MWxxx - Template (copy me)"
      TEMPLATE_TIF="MW-Template.tif"
      MARK_PSB="MW - mark.psb"
      PSB_FILES=(
        "MW - Artist name.psb"
        "MW - track names.psb"
        "MW - Logo and cat.psb"
        "MW - mark.psb"
        "MW - background.psb"
      )
      PSB_ARTIST="MW - Artist name.psb";  LAYER_ARTIST="ARTIST_NAME";   JUST_ARTIST="LEFT"
      PSB_TRACKS="MW - track names.psb";  LAYER_TRACKS="TRACK_NAMES";   JUST_TRACKS="LEFT"
      PSB_CAT="MW - Logo and cat.psb";    LAYER_CAT="RELEASE_CATALOGUE"; JUST_CAT="RIGHT"
      SMART_OBJECTS_JS='[
        {layerName:"ARTIST NAME",    psbFile:"MW - Artist name.psb"},
        {layerName:"TRACK 1 TRACK 2",psbFile:"MW - track names.psb"},
        {layerName:"Logo and cat",   psbFile:"MW - Logo and cat.psb"},
        {layerName:"Mark",           psbFile:"MW - mark.psb"},
        {layerName:"Background",     psbFile:"MW - background.psb"}
      ]'
      ;;

    MWH)
      # ── Complete this block after the one-time Horizons template setup ──
      LABEL_NAME="Meanwhile Horizons"
      TEMPLATE_DIR="/Users/matter/Dropbox/- MEANWHILE/_MW-Template/MWH"  # <- update
      RELEASES_DIR="/Users/matter/Dropbox/- MEANWHILE/Releases - Horizons"
      TEMPLATE_TIF="MWH-Template.tif"                                     # <- update
      MARK_PSB=""                                                          # <- update
      PSB_FILES=()                                                         # <- add PSB filenames
      PSB_ARTIST=""; LAYER_ARTIST="ARTIST_NAME"
      PSB_TRACKS=""; LAYER_TRACKS="TRACK NAMES"
      PSB_CAT="";    LAYER_CAT="RELEASE_CATALOGUE"
      SMART_OBJECTS_JS='[]'                                                # <- add Smart Object mapping
      ;;

  esac
}

# ─────────────────────────────────────────────────────────────────────────────

print ""
print -P "%F{cyan}%B-- Meanwhile Release Assets ----------------------%b%f"
print ""

# ── MODE: CLI args (from app) vs interactive ───────────────────────────────────
if [[ $# -ge 5 ]]; then
  # Non-interactive — all data supplied by the app.
  # Args: labelShortCode catNumber artistName releaseTitle track1 [track2 ...]
  LABEL_KEY="$1"; CAT_NUMBER="$2"; ARTIST_NAME="$3"; RELEASE_TITLE="$4"
  shift 4
  tracks=("$@")
  configure_label "$LABEL_KEY"
  print -P "  %F{white}$LABEL_NAME%f"
  print ""

elif [[ $# -gt 0 ]]; then
  print -P "%F{red}Usage: ./scripts/new-release.sh [labelKey catNumber artist title track1 track2...]%f"
  print -P "%F{white}Either supply all args (5+) or none for interactive mode.%f"
  exit 1

else
  # Interactive mode
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

  print -Pn "%F{yellow}Artist name(s)%f    : "
  read ARTIST_NAME
  if [[ -z "$ARTIST_NAME" ]]; then print -P "%F{red}Required.%f"; exit 1; fi

  print -Pn "%F{yellow}EP / release title%f : "
  read RELEASE_TITLE
  if [[ -z "$RELEASE_TITLE" ]]; then print -P "%F{red}Required.%f"; exit 1; fi

  print -P "%F{yellow}Track names%f (empty line to finish):"
  tracks=()
  n=1
  while true; do
    print -Pn "  Track $n: "
    read track
    [[ -z "$track" ]] && break
    tracks+=("$track")
    (( n++ ))
  done
  if [[ ${#tracks[@]} -eq 0 ]]; then print -P "%F{red}At least one track required.%f"; exit 1; fi
fi

# ── GUARD: catch unconfigured labels ──────────────────────────────────────────
if [[ ${#PSB_FILES[@]} -eq 0 ]]; then
  print -P "%F{red}$LABEL_NAME is not fully configured yet.%f"
  print -P "%F{white}Open scripts/new-release.sh and complete the $LABEL_KEY block.%f"
  exit 1
fi

# ── RESOLVE RELEASE FOLDER ────────────────────────────────────────────────────
# Search for an existing folder matching {CAT_NUMBER}* first.
# Use it if found; fall back to creating {CAT} - {ARTIST} - {TITLE}.
TIF_NAME="${CAT_NUMBER} - Release Assets.tif"

EXISTING=("${RELEASES_DIR}"/${CAT_NUMBER}*(N/))

if [[ ${#EXISTING[@]} -eq 1 ]]; then
  RELEASE_DIR="${EXISTING[1]}"
  FOLDER_NAME="${RELEASE_DIR:t}"
  FOLDER_STATUS="%F{white}(existing)%f"
elif [[ ${#EXISTING[@]} -gt 1 ]]; then
  print -P "%F{red}Multiple folders match ${CAT_NUMBER}*:%f"
  for d in "${EXISTING[@]}"; do print -P "  %F{white}${d:t}%f"; done
  print -P "%F{white}Rename or remove duplicates and try again.%f"
  exit 1
else
  FOLDER_NAME="${CAT_NUMBER} - ${ARTIST_NAME} - ${RELEASE_TITLE}"
  RELEASE_DIR="${RELEASES_DIR}/${FOLDER_NAME}"
  FOLDER_STATUS="%F{white}(new)%f"
fi

ASSETS_DIR="${RELEASE_DIR}/assets/images"

# ── SUMMARY ───────────────────────────────────────────────────────────────────
print -P "%F{white}%B${LABEL_NAME} -- ${CAT_NUMBER}%b%f"
print -P "%F{white}${ARTIST_NAME}%f"
for track in "${tracks[@]}"; do
  print -P "  %F{white}*%f $track"
done
print -P "  %F{white}->%f ${FOLDER_NAME} ${FOLDER_STATUS}"
print ""

if [[ -f "${ASSETS_DIR}/${PSB_FILES[1]}" ]]; then
  print -Pn "%F{yellow}PSB files already exist in assets/images/. Overwrite?%f [y/N] "
  read CONFIRM
  if [[ "$CONFIRM" != [yY] ]]; then exit 0; fi
  print ""
fi

print -Pn "Generate? [Y/n] "
read CONFIRM
if [[ "$CONFIRM" == [nN] ]]; then exit 0; fi
print ""

# ── COPY FILES ────────────────────────────────────────────────────────────────

# If this is a new folder, seed it from the release folder template first
if [[ "$FOLDER_STATUS" == *"new"* ]]; then
  if [[ -d "$RELEASE_FOLDER_TEMPLATE" ]]; then
    cp -r "$RELEASE_FOLDER_TEMPLATE/." "$RELEASE_DIR"
    print -P "  %F{green}+%f  ${FOLDER_NAME}/ (from template)"
  else
    mkdir -p "$RELEASE_DIR"
    print -P "  %F{green}+%f  ${FOLDER_NAME}/"
  fi
fi

mkdir -p "$ASSETS_DIR"
print -P "  %F{green}+%f  assets/images/"

for psb in "${PSB_FILES[@]}"; do
  if [[ ! -f "$TEMPLATE_DIR/$psb" ]]; then
    print -P "  %F{red}x%f  Missing template file: $psb"
    exit 1
  fi
  cp "$TEMPLATE_DIR/$psb" "$ASSETS_DIR/$psb"
  print -P "  %F{green}+%f  assets/images/$psb"
done

cp "$TEMPLATE_DIR/$TEMPLATE_TIF" "$ASSETS_DIR/$TIF_NAME"
print -P "  %F{green}+%f  assets/images/$TIF_NAME"

# Strip macOS quarantine flag so Photoshop can open the copied files
xattr -d com.apple.quarantine "$ASSETS_DIR"/* 2>/dev/null || true

# ── BUILD STRINGS FOR JSX EMBEDDING ──────────────────────────────────────────
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

TRACK_TEXT=""
for track in "${tracks[@]}"; do
  if [[ -n "$TRACK_TEXT" ]]; then TRACK_TEXT="${TRACK_TEXT}\\r"; fi
  TRACK_TEXT="${TRACK_TEXT}$(esc "$track")"
done

# ── GENERATE TEMP JSX ─────────────────────────────────────────────────────────
JSX_FILE="/tmp/meanwhile-release-${CAT_NUMBER}.jsx"

cat > "$JSX_FILE" << JSXEOF
// Auto-generated by scripts/new-release.sh
var TEMPLATE_DIR = "$(esc "$TEMPLATE_DIR")";
var ASSETS_DIR   = "$(esc "$ASSETS_DIR")";
var CAT_NUMBER   = "$(esc "$CAT_NUMBER")";
var TEMPLATE_TIF = "$(esc "$TEMPLATE_TIF")";
var PSB_ARTIST   = "$(esc "$PSB_ARTIST")";
var PSB_TRACKS   = "$(esc "$PSB_TRACKS")";
var PSB_CAT      = "$(esc "$PSB_CAT")";
var LAYER_ARTIST = "$(esc "$LAYER_ARTIST")"; var JUST_ARTIST = "$(esc "$JUST_ARTIST")";
var LAYER_TRACKS = "$(esc "$LAYER_TRACKS")"; var JUST_TRACKS = "$(esc "$JUST_TRACKS")";
var LAYER_CAT    = "$(esc "$LAYER_CAT")";    var JUST_CAT    = "$(esc "$JUST_CAT")";
var MARK_PSB     = "$(esc "$MARK_PSB")";

// Strategy: update PSBs in the template folder (where the TIF's links point),
// copy updated PSBs to the release folder as an archive, then open the template
// TIF — Photoshop finds the PSBs at their original paths and shows updated content.

function main() {
  // 1. Update text in the template PSBs
  updatePSBText(TEMPLATE_DIR + "/" + PSB_ARTIST, LAYER_ARTIST, "$(esc "$ARTIST_NAME")", JUST_ARTIST);
  updatePSBText(TEMPLATE_DIR + "/" + PSB_TRACKS, LAYER_TRACKS, "${TRACK_TEXT}",          JUST_TRACKS);
  updatePSBText(TEMPLATE_DIR + "/" + PSB_CAT,    LAYER_CAT,    CAT_NUMBER,               JUST_CAT);

  // 2. Archive updated PSBs in the release folder
  copyFile(TEMPLATE_DIR + "/" + PSB_ARTIST, ASSETS_DIR + "/" + PSB_ARTIST);
  copyFile(TEMPLATE_DIR + "/" + PSB_TRACKS, ASSETS_DIR + "/" + PSB_TRACKS);
  copyFile(TEMPLATE_DIR + "/" + PSB_CAT,    ASSETS_DIR + "/" + PSB_CAT);

  // 3. Open the release TIF — System Events will trigger Update All Modified Content after this returns
  open(new File(ASSETS_DIR + "/" + CAT_NUMBER + " - Release Assets.tif"));
}

function copyFile(srcPath, dstPath) {
  var src = new File(srcPath);
  if (src.exists) src.copy(dstPath);
}

function updatePSBText(psbPath, layerName, newText, justification) {
  var file  = new File(psbPath);
  var doc   = open(file);
  var layer = findLayer(doc.layers, layerName);
  if (!layer)                        { alert("Layer not found: " + layerName + "\nin: " + file.name); doc.close(SaveOptions.DONOTSAVECHANGES); return; }
  if (layer.kind !== LayerKind.TEXT) { alert("Not a text layer: " + layerName + "\nin: " + file.name); doc.close(SaveOptions.DONOTSAVECHANGES); return; }

  layer.textItem.contents = newText;

  // Explicitly force the correct justification — PS 2026 resets paragraph
  // formatting when contents is set, so we hardcode the intended value.
  var justMap = { "LEFT": Justification.LEFT, "RIGHT": Justification.RIGHT, "CENTER": Justification.CENTER };
  if (justMap[justification]) layer.textItem.justification = justMap[justification];

  doc.save();
  doc.close(SaveOptions.DONOTSAVECHANGES);
}

function findLayer(layers, name) {
  for (var i = 0; i < layers.length; i++) {
    if (layers[i].name === name) return layers[i];
    if (layers[i].typename === "LayerSet") { var f = findLayer(layers[i].layers, name); if (f) return f; }
  }
  return null;
}

main();
JSXEOF

# ── RUN IN PHOTOSHOP ──────────────────────────────────────────────────────────
print ""
print -P "  %F{cyan}Running script in Photoshop...%f"
osascript << APPLEEOF > /dev/null
tell application "Adobe Photoshop 2026"
  do javascript of file "${JSX_FILE}"
end tell
APPLEEOF

# Click Layer > Smart Objects > Update All Modified Content via UI automation
osascript << APPLEEOF > /dev/null
delay 1
tell application "System Events"
  tell process "Adobe Photoshop 2026"
    click menu item "Update All Modified Content" of menu 1 of menu item "Smart Objects" of menu 1 of menu bar item "Layer" of menu bar 1
  end tell
end tell
APPLEEOF

print ""
print -P "  %F{white}Done. Add your artwork to:%f"
print -P "  %F{cyan}${TEMPLATE_DIR}/${MARK_PSB}%f"
print -P "  %F{white}Save it and the TIF updates automatically.%f"
print ""
