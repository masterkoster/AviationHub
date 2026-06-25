# Native Desktop Boundary Plan (Single Repo)

Status: In Progress

## Goal
Keep one GitHub repository but enforce a hard boundary so desktop is native-first and no longer tied to web page code.

## Rules
1. Desktop code must not import from `app/v1/*`.
2. Desktop routes/pages/components are owned by `app/desktop` + `desktop/*`.
3. Shared visuals (tokens/components/styles) stay shared, but runtime/data/auth paths are desktop-owned.
4. Desktop cloud interactions go through a dedicated desktop API client abstraction (`desktop/lib/cloud-api.ts`).

## Workstream

### Phase A — Immediate stabilization (done in this pass)
- Added lint boundary to block desktop imports from `app/v1/*`.
- Added automated policy script: `npm run check:desktop-boundary`.
- Removed desktop profile dependency on web profile page.
- Added missing native desktop logbook routes:
  - `/desktop/logbook`
  - `/desktop/logbook/new`
  - `/desktop/logbook/totals`
  - `/desktop/logbook/currency`
- Added local logbook data layer (`desktop/lib/local-logbook.ts`) for SQLite-backed desktop views.
- Added desktop cloud API abstraction (`desktop/lib/cloud-api.ts`) and migrated desktop dashboard/signup to use it.

### Phase B — Remove remaining web-coupled auth
- Replaced desktop `next-auth` client usage with desktop-native cloud session bridge (`desktop/lib/cloud-session.ts`).
- Keep cloud auth flow functional for Azure SQL sync without desktop importing web pages.

### Phase C — Full packaging boundary
- Split runtime apps in repo structure (`apps/web`, `apps/desktop`, `apps/api`) while preserving shared packages.
- Add separate CI jobs for desktop/web/api.

### Phase C progress (started)
- Added repository target folders:
  - `apps/web/`
  - `apps/desktop/`
  - `apps/api/`
- Moved desktop cloud/logbook runtime libraries into `apps/desktop/src/lib`:
  - `cloud-base-url.ts`
  - `cloud-api.ts`
  - `cloud-session.ts`
  - `local-logbook.ts`
- Updated desktop pages/hooks/components to import from `apps/desktop/src/lib`.
- Kept backward-compatible re-export shims in `desktop/lib/*` during transition.
- Added CI workflow guard:
  - `.github/workflows/desktop-boundary.yml`
  - Runs both `check:desktop-boundary` and `lint:desktop` on push/PR.

## Definition of Done
- Desktop never imports web page modules.
- Desktop navigation is fully resolved to desktop-native pages.
- Desktop can run and function without requiring web-route fallbacks.
- Visual style remains consistent with current product.
