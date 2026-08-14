#!/bin/zsh
# relink-video-project.sh — Relink copied Filmora .wfp project(s) to the current release
#
# Phase 2 of the video promo workflow (see doc/AGENTS.md). Run after copying one or
# more .wfp project files from a previous release (or the shared "MWxxx - Template
# (copy me)" folder) into this release's assets/videos/ folder, and after
# export-video-assets.sh has produced bg{n}.png / mark.png here.
#
# A release can have more than one video project — e.g. MW090_promo_video_square.wfp
# (the main square promo) and MW090_spotify_canvas.wfp (a simpler portrait video for
# Spotify Canvas, using a static spotify-bg.png background instead of the per-track
# bg{n}.png, but the same mark.png). Every .wfp found in assets/videos/ is relinked
# independently — there's no special-casing per project type, since the relink logic
# below is driven entirely by what's already inside the .wfp's own project_info.json.
#
# A .wfp is a zip archive (see ProjectFolder/project_info.json, medias_info.json,
# Medias/*/media.json, Medias/*/timeline.wesproj inside it). Every media reference
# stores an ABSOLUTE path back to wherever it was imported from — when a .wfp is
# copied to a new release folder, those paths still point at the OLD release, so
# Filmora shows the media as offline/missing. For each .wfp found, this script:
#   1. Reads project_info.json's proj_zip_save_path to find the OLD release folder
#      name and OLD project file "stem" it was saved as
#   2. Replaces that folder name with this release's own folder name, and that stem
#      with this release's own CAT_NUMBER-based stem, across every text entry in the
#      archive (skipping binary thumbnails) — a plain substring replace, not a
#      structural rewrite, so nothing else in the project (timeline, effects, etc)
#      is touched
#   3. Re-zips it under the new name and removes the old-named file
#
# It does not touch the shared logo path (_MEANWHILE/Assets/Logo/...) or Filmora's
# own local backup cache path (~/Movies/Wondershare Filmora Mac/Backup/...) since
# neither contains the old release's folder name. A .wfp that already points at this
# release (e.g. re-running the chained export) is detected and skipped cleanly.
#
# After the substring replace, every text entry is re-scanned for any remaining
# "<folder>/assets/videos/" reference that isn't THIS release's folder. proj_zip_save_path
# is only ever the source of the old folder/stem to search-and-replace — it is not a
# guarantee that every media entry actually lived there. A .wfp that was hand-edited, or
# copied from a "template" whose media was never truly relinked, can have proj_zip_save_path
# say one thing while its media.json/timeline.wesproj entries still point somewhere else
# entirely (this happened for real: MWxxx_promo_video_square.wfp claimed to be the
# template, but its media still pointed at MW090's actual release folder). Rather than
# silently shipping a project that "looks" relinked but still plays back the wrong
# artwork, any such leftover reference fails that .wfp loudly and leaves it untouched.
#
# Also fixes one known stale path while it's in there: the spotify-canvas template's
# spotify-bg.png reference points at a "spotify/" subfolder that hasn't existed since
# the template was created — the file has always lived directly in assets/videos/.
# A no-op for any .wfp that doesn't reference that path.
#
# Finally, prunes any media entry that's both missing on disk and not referenced
# anywhere in the project — the usual cause is a naming convention that changed
# between releases (e.g. Horizons' old capitalized "Titles1.png"/"Titles2.png" vs the
# current lowercase "titles1.png"/"titles2.png"/"titles3.png"), carried forward as
# harmless-looking but orphaned entries every time a .wfp is copied to start a new
# release. This runs even when nothing needed renaming, so re-running against an
# already-correct project still cleans it up.
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

# ── FIND .wfp FILES ────────────────────────────────────────────────────────────
WFP_FILES=("${VIDEOS_DIR}"/*.wfp(N))

if [[ ${#WFP_FILES[@]} -eq 0 ]]; then
  print -P "%F{red}No .wfp file found in:%f"
  print -P "  %F{white}${VIDEOS_DIR}%f"
  print -P "%F{white}Copy a template .wfp project in first.%f"
  exit 1
fi

print -P "%F{white}Release:%f   ${RELEASE_DIR:t}"
print -P "%F{white}Projects:%f  ${#WFP_FILES[@]} found"
for f in "${WFP_FILES[@]}"; do print -P "             %F{white}${f:t}%f"; done
print ""

RELINKED_COUNT=0
SKIPPED_COUNT=0
FAILED_COUNT=0

# ── RELINK EACH .wfp INDEPENDENTLY ────────────────────────────────────────────
# Every project file found gets the same treatment — there's nothing promo- or
# canvas-specific here, it's all driven by what's already inside each .wfp's own
# project_info.json.
for WFP_PATH in "${WFP_FILES[@]}"; do
  print -P "%F{cyan}-- ${WFP_PATH:t} --%f"

  WORK_DIR="/tmp/meanwhile-video-relink-${CAT_NUMBER}-${WFP_PATH:t:r}"
  rm -rf "$WORK_DIR"
  mkdir -p "$WORK_DIR"
  unzip -q "$WFP_PATH" -d "$WORK_DIR"

  PROJECT_INFO="$WORK_DIR/ProjectFolder/project_info.json"
  if [[ ! -f "$PROJECT_INFO" ]]; then
    print -P "  %F{red}ProjectFolder/project_info.json not found inside the .wfp — unexpected format, skipping.%f"
    print ""
    (( FAILED_COUNT++ ))
    continue
  fi

  # ── COMPUTE OLD/NEW FOLDER + STEM, REWRITE TEXT FILES ─────────────────────
  python3 - "$WORK_DIR" "$PROJECT_INFO" "$NEW_FOLDER_BASENAME" "$CAT_NUMBER" << 'PYEOF'
import json, os, re, shutil, sys, glob

work_dir, project_info_path, new_folder_basename, cat_number = sys.argv[1:5]

with open(project_info_path) as f:
    info = json.load(f)

old_full_path = info.get("proj_zip_save_path", "")
if not old_full_path:
    print("  NOFIX: proj_zip_save_path missing from project_info.json")
    sys.exit(0)

# Normalize: work without a leading slash so the same substring matches both
# "/Users/matter/..." and Filmora's "file://Users/matter/..." URI form.
old_path = old_full_path.lstrip("/")

marker = "/assets/videos/"
if marker not in old_path:
    print("  NOFIX: proj_zip_save_path did not contain /assets/videos/: " + old_full_path)
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

needs_rename = old_folder_basename != new_folder_basename

if needs_rename:
    print("  OLD_FOLDER=" + old_release_folder)
    print("  NEW_FOLDER=" + new_release_folder)
    print("  OLD_STEM=" + old_stem)
    print("  NEW_STEM=" + new_stem)

# Known stale path in the spotify-canvas template: spotify-bg.png was originally
# imported from a "spotify/" subfolder that no longer exists — the file has always
# lived directly in assets/videos/ in both MW090's project and the shared template.
# A no-op for any .wfp that doesn't reference this path (e.g. the square promo).
stale_marker = "/assets/videos/spotify/spotify-bg.png"
fixed_marker = "/assets/videos/spotify-bg.png"

# Only rewrite text-based entries; leave binary thumbnails untouched.
text_exts = (".json", ".wesproj")
text_files = [
    p for p in glob.glob(os.path.join(work_dir, "**", "*"), recursive=True)
    if os.path.isfile(p) and p.lower().endswith(text_exts)
]

changed = []
for path in text_files:
    with open(path, "r", encoding="utf-8", errors="strict") as f:
        content = f.read()
    new_content = (
        content.replace(old_release_folder, new_release_folder)
        .replace(old_stem, new_stem)
        .replace(stale_marker, fixed_marker)
    )
    if new_content != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        changed.append(os.path.relpath(path, work_dir))

if needs_rename:
    print("  CHANGED_COUNT=%d" % len(changed))
    for c in changed:
        print("  CHANGED: " + c)

# ── VERIFY: no reference to a DIFFERENT release folder survived the rewrite ──
# Each media entry embeds its own absolute "<release folder>/assets/videos/..."
# path independently of proj_zip_save_path. If a .wfp was ever hand-edited, or
# built from a copy whose media was never actually relinked (e.g. a "template"
# that's secretly a renamed old release), the substring replace above only
# touches text matching THIS project's own old_release_folder and silently
# leaves any other release's folder name untouched — producing a project that
# LOOKS relinked (project_info.json points at the new release) but still plays
# back media from wherever it actually came from. Catch that here instead of
# quietly shipping a half-fixed .wfp.
stale_pattern = re.compile(r'([^"/]+)/assets/videos/')
stale = {}
for path in text_files:
    with open(path, "r", encoding="utf-8", errors="strict") as f:
        content = f.read()
    for m in stale_pattern.finditer(content):
        folder_name = m.group(1)
        if folder_name != new_folder_basename:
            stale.setdefault(folder_name, set()).add(os.path.relpath(path, work_dir))

if stale:
    print("  STALE REFERENCES — media still points at a different release than proj_zip_save_path claims:")
    for folder_name in sorted(stale):
        print("    " + folder_name)
        for p in sorted(stale[folder_name]):
            print("      in " + p)
    with open(os.path.join(work_dir, ".relink_stale"), "w") as f:
        json.dump({k: sorted(v) for k, v in stale.items()}, f)
    sys.exit(0)  # do not write .relink_result — refuse to ship a partial fix

# ── PRUNE: drop orphaned media entries that are both missing on disk and unused ──
# A .wfp copied forward from an older release can carry media entries whose filename
# convention has since changed (e.g. MWH024's old "Titles1.png"/"Titles2.png" vs the
# current "titles1.png"/"titles2.png"/"titles3.png") — after the folder substitution
# above they resolve to a path that never existed for THIS release either. Only prune
# an entry if it's both missing on disk AND not referenced by any file:// path
# elsewhere in the project — something actually used stays untouched even if it
# happens to be offline right now (e.g. not yet synced locally).
medias_info_path = os.path.join(work_dir, "ProjectFolder", "Medias", "medias_info.json")
pruned = []
if os.path.isfile(medias_info_path):
    with open(medias_info_path) as f:
        medias_info = json.load(f)
    media_items = medias_info.get("media_items", {})

    used_paths = set()
    for path in text_files:
        if path == medias_info_path:
            continue
        with open(path, "r", encoding="utf-8", errors="strict") as f:
            content = f.read()
        for m in re.finditer(r'"file://([^"]*)"', content):
            used_paths.add(m.group(1))

    def exists_exact_case(path):
        # os.path.isfile() resolves case-insensitively on the default macOS/APFS
        # filesystem, so "Titles1.png" would incorrectly report as existing when
        # only "titles1.png" is actually there. Check the directory listing instead.
        dir_path, filename = os.path.split(path)
        try:
            return filename in os.listdir(dir_path)
        except OSError:
            return False

    for media_id, item in list(media_items.items()):
        download_url = item.get("download_url", "")
        if not download_url:
            continue  # structural entries (e.g. the sequence "Folder"), not real media
        if exists_exact_case(download_url):
            continue
        if download_url.lstrip("/") in used_paths:
            continue
        pruned.append((media_id, item.get("name", ""), download_url))
        del media_items[media_id]
        media_folder = os.path.join(work_dir, "ProjectFolder", "Medias", media_id)
        if os.path.isdir(media_folder):
            shutil.rmtree(media_folder)

    if pruned:
        with open(medias_info_path, "w") as f:
            json.dump(medias_info, f)
        print("  PRUNED_COUNT=%d" % len(pruned))
        for media_id, name, path in pruned:
            print("    PRUNED: " + name + " (" + media_id + ") -> " + path)

if not needs_rename and not pruned:
    print("  NOFIX: already points at this release (%s)" % old_folder_basename)
    sys.exit(0)

with open(os.path.join(work_dir, ".relink_result"), "w") as f:
    json.dump({"new_stem": new_stem, "old_stem": old_stem}, f)
PYEOF

  if [[ -f "$WORK_DIR/.relink_stale" ]]; then
    print -P "  %F{red}Refusing to relink — this project's media points at a different release than%f"
    print -P "  %F{red}its own saved-path metadata claims (see STALE REFERENCES above).%f"
    print -P "  %F{white}Fix it by hand in Filmora (relink the offending media), or patch the archive%f"
    print -P "  %F{white}text directly, then re-run.%f"
    print ""
    (( FAILED_COUNT++ ))
    continue
  fi

  if [[ ! -f "$WORK_DIR/.relink_result" ]]; then
    print -P "  %F{yellow}Nothing to relink — already points at this release, or its format was unrecognised.%f"
    print ""
    (( SKIPPED_COUNT++ ))
    continue
  fi

  NEW_STEM=$(python3 -c "import json; print(json.load(open('$WORK_DIR/.relink_result'))['new_stem'])")
  rm -f "$WORK_DIR/.relink_result"

  # ── REBUILD THE .wfp ─────────────────────────────────────────────────────
  NEW_WFP_PATH="${VIDEOS_DIR}/${NEW_STEM}.wfp"
  rm -f "$NEW_WFP_PATH"

  ( cd "$WORK_DIR" && zip -q -X -D -r "$NEW_WFP_PATH" ProjectFolder )

  if [[ ! -f "$NEW_WFP_PATH" ]]; then
    print -P "  %F{red}Failed to rebuild the .wfp — check ${WORK_DIR} for scratch files.%f"
    print ""
    (( FAILED_COUNT++ ))
    continue
  fi

  if [[ "$NEW_WFP_PATH" != "$WFP_PATH" ]]; then
    rm -f "$WFP_PATH"
  fi

  print -P "  %F{green}✓%f  videos/${NEW_WFP_PATH:t}"
  print ""
  (( RELINKED_COUNT++ ))
done

# ── REPORT ────────────────────────────────────────────────────────────────────
SUMMARY="Relinked ${RELINKED_COUNT}, skipped ${SKIPPED_COUNT} (already up to date)"
if (( FAILED_COUNT > 0 )); then
  SUMMARY="${SUMMARY}, ${FAILED_COUNT} failed"
fi
SUMMARY="${SUMMARY} of ${#WFP_FILES[@]} project(s)."
print -P "%F{white}${SUMMARY}%f"
print ""

if (( FAILED_COUNT > 0 )); then
  exit 1
fi

if (( RELINKED_COUNT > 0 )); then
  print -P "  %F{white}Next: open the relinked project(s) in Filmora, drop the mp3 samples into%f"
  print -P "  %F{white}assets/videos/ if missing, relink any offline media by hand, then export.%f"
  print ""
fi
