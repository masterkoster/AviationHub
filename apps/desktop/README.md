# apps/desktop (planned target)

This directory is reserved for the dedicated desktop runtime package.

Current desktop runtime still uses:
- `app/desktop/*`
- `desktop/*`
- `src-tauri/*`

Migration policy:
- Move desktop React runtime and desktop-only libs into `apps/desktop`.
- Keep Tauri shell under `src-tauri` until final packaging move.
- Use `desktop/lib/cloud-api.ts` and `desktop/lib/cloud-session.ts` for cloud bridge.
