# Shell scripts (macOS, Photoshop/Filmora automation — not GitHub Actions)

See `doc/AGENTS.md` first for orientation; come here for the details behind that pointer.

These are separate from the TypeScript `scripts/*.ts` GitHub Actions scripts. They run
locally on the label's Mac and automate Photoshop artwork/video prep. `new-release.sh`
and `export-video-assets.sh` require Adobe Photoshop 2026; `relink-video-project.sh` is
pure file manipulation (zip/JSON text) and needs neither Photoshop nor Filmora installed
to run. All three are zsh.

Full pipeline: `new-release.sh` → `export-video-assets.sh` (auto-chains into) →
`relink-video-project.sh` → manual (drop mp3 samples into `assets/videos/`, relink the
two audio clips by hand in Filmora, export).

**`scripts/new-release.sh`** — Sets up Photoshop artwork for a new release:
- Creates `{CAT} - {Artist} - {Title}/assets/images/` under the label's Releases folder
  in Dropbox, copying PSB template files and a template TIF.
- Runs a generated JSX script in Photoshop to update text layers (artist, track names,
  catalogue number) in the template PSBs, then uses AppleScript System Events to click
  "Layer → Smart Objects → Update All Modified Content" (required because Photoshop 2026's
  scripting API doesn't expose `updateAllLinkedContent`).
- Strips macOS quarantine attributes from copied files.
- Usage: `./scripts/new-release.sh` (interactive) or
  `./scripts/new-release.sh MW MW091 "Artist" "Title" "Track 1" "Track 2"`.

**`scripts/export-video-assets.sh`** — Exports per-track PNG backgrounds and mark PNG
for promo videos. Run *after* `new-release.sh` when artwork is finalised:
- The TIF is **not** one flat design — it's several side-by-side Photoshop Artboards
  (Story, 4x5, Cover, FB Banner, SC Banner, Spotify Banner) on one large canvas, each
  with its own independent Mark / TRACK 1 TRACK 2 / Background layers. The script
  targets one named artboard only (`ARTBOARD_NAME`, "Meanwhile Release Cover" for MW).
- `Document.crop()` does not work on documents containing real Photoshop Artboards —
  confirmed by direct testing, it silently no-ops. The script instead hides every
  sibling top-level artboard and uses `Document.trim(TrimType.TRANSPARENT, ...)`,
  which works on pixel bounds rather than artboard metadata.
- The track-name text is a Smart Object (`TRACK 1 TRACK 2` layer), not a plain text
  layer, so it can't be set directly. Its link target is **this release's own**
  `assets/images/{PSB_TRACKS}` (e.g. `MW - track names.psb`) — confirmed via the
  Action Manager `smartObject` descriptor's `link` path. (`new-release.sh`'s own
  comment claiming the link points at the shared template folder is wrong for this
  file — don't trust it without re-checking.) Per track, the script writes that one
  track name into the release's archived PSB, then opens the TIF **fresh** — a
  document that's already open does not pick up the change even after "Update All
  Modified Content"; only a fresh open resolves current linked content — isolates
  the target artboard, hides the Mark smart object, trims, and exports. The archived
  PSB is restored to the full track list afterwards.
- Opens the mark PSB (same release-local-copy convention) and exports `mark.png`
  with transparency to `assets/videos/`.
- On success, chains straight into `relink-video-project.sh` with the same label/cat args.
- Usage: `./scripts/export-video-assets.sh` (interactive) or
  `./scripts/export-video-assets.sh MW MW091`.

**`scripts/relink-video-project.sh`** — Phase 2: relinks a Filmora `.wfp` project file
copied in from a previous release so it points at the current one. Run after copying a
template `.wfp` into `assets/videos/` — normally invoked automatically at the end of
`export-video-assets.sh`, but can be run standalone too. Pure file manipulation — no
Photoshop involved:
- A `.wfp` is a zip archive. Every media reference (`ProjectFolder/project_info.json`,
  `Medias/medias_info.json`, `Medias/*/media.json`, `Medias/*/timeline.wesproj`) stores
  an **absolute path** back to wherever it was imported from, so a copied `.wfp` still
  points at the old release until relinked.
- Reads `proj_zip_save_path` from `project_info.json` to discover the *old* release
  folder name and project-file "stem" — no hardcoded old catalogue number, works
  whichever release the template was copied from.
- Does a literal substring replace (old release folder → this release's folder, old
  stem → `{CAT_NUMBER}_<same suffix>`) across every `.json`/`.wesproj` text entry,
  leaving binary thumbnails untouched. Matches on the path *without* a leading slash so
  it catches both `/Users/...` and Filmora's `file://Users/...` (note: no third slash)
  forms in one pass.
- Deliberately does **not** touch paths that don't contain the old release folder name —
  e.g. the shared logo at `_MEANWHILE/Assets/Logo/...` or Filmora's own local backup
  cache path (`~/Movies/Wondershare Filmora Mac/Backup/...`) are left alone.
- Rebuilds the zip with `zip -X -D` (no directory entries, matching the original's flat
  16-entries-file structure) under the new stem name, removes the old-named file.
- If the `.wfp` already points at the current release (e.g. re-running the chained
  export), it detects that and exits cleanly with nothing to do.
- Leaves mp3 samples alone entirely — those get dropped in and relinked by hand in
  Filmora, then exported. That's intentionally manual.
- Usage: `./scripts/relink-video-project.sh` (interactive) or
  `./scripts/relink-video-project.sh MW MW091`.

**Label config** lives at the top of each shell script (`configure_label()` function) —
MW is fully configured, MWH has placeholder stubs.
