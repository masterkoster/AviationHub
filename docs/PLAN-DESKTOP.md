# AviationHub Desktop App — Master Build Plan

> Status: **Approved** · Phase 1-1.7 DONE · Phase 2+ pending
> Decision locked: **Two-Tier Sidebar (Option A)** for module architecture

## Vision
A native-feeling desktop app (Thinkorswim / TradingView Desktop vibe) for pilots — fast, keyboard-driven, balanced-density dashboard with rearrangeable panels. Works offline-first (local SQLite via Tauri), auto-syncs to cloud (Azure SQL via Next.js API) when online. Shares UI components with the web app but has its own desktop-optimized layout, custom title bar, and local-first data layer.

## User Decisions (locked)
| Decision | Choice |
|---|---|
| Dashboard density | Balanced — key stats + recent flights, tabs for deeper views |
| Customization | Both — rearrangeable panels AND layout presets |
| Cloud sync | Auto-sync in background — never blocks the user |
| Code sharing | Shared components, desktop-specific layout (refactor v1 to separate fetch from render) |
| Local auth | Username-only, email optional (email only for cloud sync) |
| Dashboard panels | All 8 (Stats, Recent Flights, Currency, Aircraft, Time Chart, Quick-Add, Deadlines, Mini Calendar) |

## Architecture
```
next-dashboard/
├── app/                          # Existing Next.js app (untouched)
│   ├── v1/                       # Web pages (login, dashboard, logbook, ...)
│   ├── api/v1/                   # Cloud API routes (Azure SQL via Prisma)
│   └── components/providers.tsx  # Hides web chrome on /desktop routes
│
├── desktop/                      # NEW — desktop-only React layer
│   ├── components/
│   │   ├── title-bar.tsx         # Custom title bar w/ window controls + sync status
│   │   ├── command-palette.tsx   # Ctrl+K palette
│   │   ├── shortcut-provider.tsx # Global keyboard shortcut context
│   │   ├── dashboard-grid.tsx    # Rearrangeable panel grid
│   │   └── panels/               # Widget components
│   ├── hooks/
│   │   ├── use-tauri.ts          # Detect Tauri, wrap invoke
│   │   ├── use-local-db.ts       # SQLite via Tauri SQL plugin
│   │   ├── use-sync.ts           # Cloud sync status
│   │   └── use-shortcuts.ts      # Shortcut registry
│   └── lib/
│       ├── local-db.ts           # Data access layer
│       ├── cloud-sync.ts         # Background sync engine
│       └── auth.ts                # Local auth
│
├── shared/                       # NEW — extracted from existing code
│   ├── types/
│   ├── utils/
│   └── components/
│
└── src-tauri/
    ├── src/commands/             # NEW — Rust IPC commands
    └── tauri.conf.json           # decorations: false (Phase 1)
```

## Phase Breakdown

### Phase 1: Native Feel (Week 1-2)
1.1 Custom title bar (remove OS decorations, build React title bar with min/max/close + sync badge)
1.2 Global keyboard shortcuts (Ctrl+N, F, S, K, comma, Esc, Ctrl+1..7)
1.3 Command palette (Ctrl+K) with fuzzy search across pages + actions
1.4 Desktop layout shell (persistent sidebar, dense layout, window state persistence)
1.5 Polish (context menus, system tray, OS notifications, drag-and-drop CSV)

### Phase 2: Local-First Data (Week 2-3)
2.1 Tauri IPC data layer (Rust commands for CRUD on local SQLite)
2.2 React data hooks (SWR-style, calls Tauri IPC instead of fetch)
2.3 Local auth (username-only, bcrypt in Rust)
2.4 Offline indicator + sync queue count
2.5 Desktop-specific pages (wrap existing v1 components with desktop data hooks)

### Phase 3: Cloud Sync (Week 3-4)
3.1 Sync engine (drain sync_queue → cloud API; pull cloud → local)
3.2 Conflict resolution (last-write-wins, audit history preserved)
3.3 Cloud auth bridge ("Sign in with cloud account" to enable sync)
3.4 Sync status UI + history modal
3.5 Initial cloud pull (seed local from cloud on link)

### Phase 4: Dashboard Customization (Week 4-5)
4.1 Dashboard grid (drag/drop, resize, show/hide panels)
4.2 8 panel widgets (Stats, Flights, Currency, Aircraft, Time Chart, Quick-Add, Deadlines, Calendar)
4.3 Layout persistence (3-4 presets + custom save to SQLite)
4.4 Settings page

### Phase 5: Shared Code Extraction (Week 5-6)
5.1 Extract types to shared/types/
5.2 Extract utils to shared/utils/
5.3 Extract presentation components to shared/components/
5.4 Update imports (web + desktop)
5.5 Path aliases + build config

## Technical Notes
- Tauri v2.11.3, Rust MSVC toolchain (rust-toolchain.toml pins this)
- tauri-plugin-sql already wired with 7 migrations (users, pilot_profile, aircraft, logbook_entries, logbook_entry_history, currency_rules, sync_queue)
- Tauri dev URL points at Next.js dev server (localhost:3000); we'll add /desktop route
- Next.js 16, React 19, Tailwind v4 (CSS-based theme), shadcn/ui (Radix), lucide-react icons
- Existing dependencies usable: cmdk (command palette), react-resizable-panels (drag/drop), recharts (charts)
- To add: @tauri-apps/api, @tauri-apps/plugin-sql, @tauri-apps/plugin-store
- Auth: web (NextAuth, Azure SQL); desktop (local SQLite users table, bcrypt in Rust)
- Conflict policy: last-write-wins (simple, predictable), audit history both sides