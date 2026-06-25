# Phase 1.6 + 1.7 — Map Port + First-Run Setup Wizard

> Status: **Approved** · In Progress

## A. Flight Map Port with Offline Tile Cache
- A.1 Extract LeafletMap + MapControls to `shared/components/map/`
- A.2 Desktop map page wrapper (thin — only mounts map, not the 3,123-line fuel-saver page)
- A.3 Offline tile cache layer (Rust fetches+stores tiles, React banner shows "Downloaded March 22, 47 days old [Update Now]")
- A.4 Data layer: airports → direct Tauri SQLite, TFRs → bundled JSON, PIREPs → live+cache, fuel → cache with date
- A.5 Nav wiring: "Map" sidebar item + Ctrl+7 + command palette
- A.6 Performance measurement

## B. First-Time Setup Wizard
- B.1 First-run detection via `tauri-plugin-store` (key: `setup_complete`)
- B.2 Multi-step wizard: Welcome → Choose Mode (Local/Cloud) → Profile or Sign-in → Done
- B.3 Local auth Rust commands (create_local_user with name + optional home airport)
- B.5 On completion: write store, redirect to /desktop/dashboard
- B.6 Wire first-run check into DesktopShell

## Decisions Locked
| Decision | Choice |
|---|---|
| Map to port | Fuel Saver map only |
| Cloud sign-in | Inside the desktop app |
| Local setup fields | Name + optional Home Airport only (no username/password for local mode) |
| Wizard style | Multi-step (separated screens) |
| Tile strategy | Downloadable cache + date awareness + "Update?" prompt |
| Build order | B.1→B.2→B.5→B.6 → B.3 → A.1→A.2 → A.5 → A.3 → A.4 → A.6 |