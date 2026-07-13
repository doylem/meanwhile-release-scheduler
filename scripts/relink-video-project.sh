#!/bin/zsh
# relink-video-project.sh — Relink a copied Filmora .wfp project to the current release
#
# Phase 2 of the video promo workflow (see doc/AGENTS.md). Run after copying a .wfp
# project file from a previous release into this release's assets/videos/ folder,
# and after export-video-assets.sh has produced bg{n}.png / mark.png here.
#
# A .wfp is a zip archive (see ProjectFolder/project_info.json, medias_info.json,
# Medias/*/media.json, Medias/*/timeline.wesproj inside it). Every media reference
# stores an ABSOLUTE path back to wherever it was imported from — when a .wfp is
# copied to a new release folder, those paths still point at the OLD release, so
# Filmora shows the media as offline/missing. This script:
#   1. Finds the one .wfp file in assets/videos/
#   2. Reads project_info.json's proj_zip_save_path to find the OLD release folder
#      name and OLD project file "stem" it was saved as
#   3. Replaces that folder name with this release's own folder name, and that stem
#      with this release's own CAT_NUMBER-based stem, across every text entry in the
#      archive (skipping binary thumbnails) — a plain substring replace, not a
#      structural rewrite, so nothing else in the project (timeline, effects, etc)
#      is touched
#   4. Re-zips it under the new name and removes the old-named file
#
# It does not touch the shared logo path (_MEANWHILE/Assets/Logo/...) or Filmora's
# own local backup cache path (~/Movies/Wondershare Filmora Mac/Backup/...) since
# neither contains the old release's folder name.
#
# mp3 samples are intentionally left alone — drop those into assets/videos/ and
# relink the two audio clips by hand in Filmora, then export.
#
# Usage:
#   Interactive:     ./scripts/relink-video-project.sh
#   Non-interactive: ./scripts/relink-video-project.sh MW MW091

# ── LABEL CONFIGS ─────────────────────────────────────────────────────────────
LABEL_KEYS=("MW" "MWH")
LABEL_DISPLAY_NAMES=("Meanwhile Recordings" "Meanwhile Horizons")

configure_label() {
  case "$1" in
    MW)
      LABEL_NAME="Meanwhile Recordings"
      RELEASES_DIR="/Users/matter/Dropbox/- MEANWHILE/Releases - Meanwhile"
      ;;
    MWH)
      LABEL_NAME="Meanwhile Horizons"
      RELEASES_DIR="/Users/matter/Dropbox/- MEANWHILE/Releases - Horizons"
      ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────────────

print ""
print -P "%F{cyan}%B-- Meanwhile Video Project Relink ─────────────────%b%f"
print ""

# ── MODE: CLI args vs interactive ─────────────────────────────────────────────
if [[ $# -eq 2 ]]; then
  LABEL_KEY="$1"
  CAT_NUMBER="$2"
  configure_label "$LABEL_KEY"
  print -P "  %F{white}$LABEL_NAME%f"
  print ""

elif [[ $# -gt 0 ]]; then
  print -P "%F{red}Usage: ./scripts/relink-video-project.sh [labelKey catNumber]%f"
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
NEW_FOLDER_BASENAME="${RELEASE_DIR:t}"

# ── FIND THE .wfp FILE ─────────────────────────────────────────────────────────
WFP_FILES=("${VIDEOS_DIR}"/*.wfp(N))

if [[ ${#WFP_FILES[@]} -eq 0 ]]; then
  print -P "%F{red}No .wfp file found in:%f"
  print -P "  %F{white}${VIDEOS_DIR}%f"
  print -P "%F{white}Copy a template .wfp project in first.%f"
  exit 1
elif [[ ${#WFP_FILES[@]} -gt 1 ]]; then
  print -P "%F{red}Multiple .wfp files found — remove duplicates and try again:%f"
  for f in "${WFP_FILES[@]}"; do print -P "  %F{white}${f:t}%f"; done
  exit 1
fi

WFP_PATH="${WFP_FILES[1]}"
print -P "%F{white}Release:%f  ${RELEASE_DIR:t}"
print -P "%F{white}Project:%f  ${WFP_PATH:t}"
print ""

# ── UNZIP TO SCRATCH DIR ───────────────────────────────────────────────────────
WORK_DIR="/tmp/meanwhile-video-relink-${CAT_NUMBER}"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
unzip -q "$WFP_PATH" -d "$WORK_DIR"

PROJECT_INFO="$WORK_DIR/ProjectFolder/project_info.json"
if [[ ! -f "$PROJECT_INFO" ]]; then
  print -P "%F{red}ProjectFolder/project_info.json not found inside the .wfp — unexpected format.%f"
  exit 1
fi

# ── COMPUTE OLD/NEW FOLDER + STEM, REWRITE TEXT FILES ─────────────────────────
python3 - "$WORK_DIR" "$PROJECT_INFO" "$NEW_FOLDER_BASENAME" "$CAT_NUMBER" << 'PYEOF'
import json, os, sys, glob

work_dir, project_info_path, new_folder_basename, cat_number = sys.argv[1:5]

with open(project_info_path) as f:
    info = json.load(f)

old_full_path = info.get("proj_zip_save_path", "")
if not old_full_path:
    print("NOFIX: proj_zip_save_path missing from project_info.json")
    sys.exit(0)

# Normalize: work without a leading slash so the same substring matches both
# "/Users/matter/..." and Filmora's "file://Users/matter/..." URI form.
old_path = old_full_path.lstrip("/")

marker = "/assets/videos/"
if marker not in old_path:
    print("NOFIX: proj_zip_save_path did not contain /assets/videos/: " + old_full_path)
    sys.exit(0)

old_release_folder, rest = old_path.split(marker, 1)
old_filename = rest.rsplit("/", 1)[-1]
old_stem = old_filename[:-4] if old_filename.lower().endswith(".wfp") else old_filename

old_folder_basename = old_release_folder.rsplit("/", 1)[-1]
new_release_folder = old_release_folder[: -len(old_folder_basename)] + new_folder_basename

if "_" in old_stem:
    suffix = old_stem.split("_", 1)[1]
    new_stem = cat_number + "_" + suffix
else:
    new_stem = cat_number + "_promo_video"

if old_folder_basename == new_folder_basename:
    print("NOFIX: already points at this release (%s)" % old_folder_basename)
    sys.exit(0)

print("OLD_FOLDER=" + old_release_folder)
print("NEW_FOLDER=" + new_release_folder)
print("OLD_STEM=" + old_stem)
print("NEW_STEM=" + new_stem)

# Only rewrite text-based entries; leave binary thumbnails untouched.
text_exts = (".json", ".wesproj")
changed = []
for path in glob.glob(os.path.join(work_dir, "**", "*"), recursive=True):
    if not os.path.isfile(path):
        continue
    if not path.lower().endswith(text_exts):
        continue
    with open(path, "r", encoding="utf-8", errors="strict") as f:
        content = f.read()
    new_content = content.replace(old_release_folder, new_release_folder).replace(old_stem, new_stem)
    if new_content != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        changed.append(os.path.relpath(path, work_dir))

print("CHANGED_COUNT=%d" % len(changed))
for c in changed:
    print("CHANGED: " + c)

with open(os.path.join(work_dir, ".relink_result"), "w") as f:
    json.dump({"new_stem": new_stem, "old_stem": old_stem}, f)
PYEOF

if [[ ! -f "$WORK_DIR/.relink_result" ]]; then
  print -P "%F{yellow}Nothing to relink — project already points at this release, or its format was unrecognised.%f"
  print ""
  exit 0
fi

NEW_STEM=$(python3 -c "import json; print(json.load(open('$WORK_DIR/.relink_result'))['new_stem'])")
rm -f "$WORK_DIR/.relink_result"

# ── REBUILD THE .wfp ───────────────────────────────────────────────────────────
NEW_WFP_PATH="${VIDEOS_DIR}/${NEW_STEM}.wfp"
rm -f "$NEW_WFP_PATH"

( cd "$WORK_DIR" && zip -q -X -D -r "$NEW_WFP_PATH" ProjectFolder )

if [[ ! -f "$NEW_WFP_PATH" ]]; then
  print -P "%F{red}Failed to rebuild the .wfp — check /tmp for scratch files.%f"
  exit 1
fi

if [[ "$NEW_WFP_PATH" != "$WFP_PATH" ]]; then
  rm -f "$WFP_PATH"
fi

print ""
print -P "  %F{green}✓%f  videos/${NEW_WFP_PATH:t}"
print -P "  %F{white}Relinked to this release's assets/videos/ folder.%f"
print ""
print -P "  %F{white}Next: open it in Filmora, drop the mp3 samples into assets/videos/,%f"
print -P "  %F{white}relink the two audio clips by hand, then export.%f"
print ""
