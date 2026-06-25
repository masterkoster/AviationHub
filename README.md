# AviationHub Desktop

> A modern pilot logbook and flight planner for Windows.

[![Desktop Boundary](https://github.com/yourusername/aviationhub/actions/workflows/desktop-boundary.yml/badge.svg)](https://github.com/yourusername/aviationhub/actions/workflows/desktop-boundary.yml)

---

## Features

- **Pilot Logbook** — Log flights with full time breakdowns (PIC, SIC, night, instrument, cross-country). Search and filter your entire history.
- **Interactive Map** — Explore 20,000+ airports with fuel prices, frequencies, and runway info. Plan routes visually with waypoints.
- **Currency Tracking** — FAA currency rules computed from your logbook — night landings, IPC, BFR, medical. Always know your status.
- **Weight & Balance** — Built-in W&B calculator with CG visualization. Pre-flight planning made simple.
- **Fuel Planning** — Compare fuel prices, calculate range, and find the cheapest stops along your route.
- **Route Weather** — METAR, TAF, and wind aloft data for your entire route. See fuel impact from headwinds.
- **Offline-First** — Works entirely offline. Your data stays on your machine. No account required.
- **Encrypted Backups** — Export and import your data with .ahb encrypted backup files.
- **Keyboard Shortcuts** — Power-user workflows with Ctrl+1-8 for rapid navigation.

## Download

[![Download Latest](https://img.shields.io/badge/Download-Latest%20Release-blue)](https://github.com/yourusername/aviationhub/releases/latest)

### System Requirements
- Windows 10 or later
- 64-bit processor
- 4GB RAM minimum (8GB recommended)
- ~200MB disk space

### Installation
1. Download the latest NSIS installer from [Releases](https://github.com/yourusername/aviationhub/releases/latest)
2. Run the `.exe` file
3. If Windows SmartScreen appears, click **More info** → **Run anyway**
4. Follow the setup wizard

## Screenshots

<!-- Screenshots coming soon -->
<p align="center">
  <i>Screenshots coming soon. <a href="#setup">Download the app</a> to try it yourself!</i>
</p>

## Usage

### Two Modes

| Mode | Description |
|------|-------------|
| **Local Mode** | Your data stays on your machine. No account required. Works completely offline. Protected with a PIN. |
| **Cloud Mode** | Sign in to sync across devices. Access your logbook from the desktop app and (soon) the web. |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Command palette |
| `Ctrl+1` | Dashboard |
| `Ctrl+2` | Logbook |
| `Ctrl+N` | New flight entry |
| `Ctrl+3` | Totals |
| `Ctrl+4` | Currency |
| `Ctrl+5` | Aircraft |
| `Ctrl+6` | Profile |
| `Ctrl+7` | Map |
| `Ctrl+8` | Calendar |

## Development

### Prerequisites
- Node.js 20+
- Rust toolchain (for Tauri builds)
- Windows SDK (for NSIS installer)

### Setup
```bash
npm install
npm run dev        # Start Next.js dev server (http://localhost:3000)
npm run tauri:dev  # Start Tauri desktop app
```

### Build
```bash
npm run build      # Build Next.js
npm run tauri:build # Build Tauri desktop app
```

### Quality Checks
```bash
npm run check:desktop-boundary  # Validate desktop boundary rules
npm run lint:desktop            # Lint desktop-specific code
```

### Project Structure
```
app/
  desktop/          # Desktop app pages
    dashboard/      # Main dashboard
    logbook/        # Flight logbook CRUD
    aircraft/       # Aircraft management
    map/            # Interactive map + route planner
    calendar/       # Agenda / calendar
    profile/        # User settings + backup/restore
    accounts/       # Account picker (PS4-style)
    login/          # Mode selection + cloud sign-in
    signup/         # Account creation
    setup/          # First-time setup wizard
desktop/
  components/       # Desktop-specific UI components
  hooks/            # Desktop hooks (auth, shortcuts, Tauri)
  lib/              # Desktop utilities (auth, backup, setup)
apps/desktop/src/lib/  # Core desktop library (DB, cloud API, storage)
src-tauri/          # Tauri backend (Rust, SQLite migrations)
```

## Tech Stack

- **Frontend:** Next.js 15 (App Router), React, Tailwind CSS, shadcn/ui
- **Desktop:** Tauri v2 (Rust backend)
- **Database:** SQLite (via Tauri SQL plugin)
- **Cloud API:** Next.js API routes (optional cloud sync)

## License

Proprietary. All rights reserved. See [LICENSE](LICENSE) for details.
