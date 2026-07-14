# Releasing the desktop app

Terse reference for shipping a new AviationHub desktop build and for the
backend/desktop version-update contract. See also:
- `lib/version.ts` — backend's `MIN_SUPPORTED_DESKTOP_VERSION` + compare helper
- `apps/desktop/src/lib/entitlements.ts` — client-side fetch/cache/compare
- `desktop/components/update-required.tsx` — the blocking force-update screen
- `.github/workflows/desktop-release.yml` — build/sign/publish pipeline

## Version sources (drift risk)

Three places currently carry a version number:

| File | Role |
|---|---|
| `src-tauri/tauri.conf.json` (`version`) | **Single source of truth.** Stamped into the installer by `tauri build`; the release workflow reads it to name the release and to populate `update.json`'s `version` field, which the Tauri updater compares against the running app. |
| `desktop/lib/app-version.ts` (`APP_VERSION`) | Reads `tauri.conf.json` directly via a JSON import (`resolveJsonModule`) — **no longer hand-maintained**, cannot drift from the config file. Used by the What's New modal and the force-update screen. |
| `package.json` (`version`) | npm's own version field. **Still manual** — nothing reads it into the app. Bump it by hand to match `tauri.conf.json` on every release (cosmetic/tooling only; nothing functional depends on it matching). |

### To bump the version

1. Edit `src-tauri/tauri.conf.json` → `"version"`.
2. Edit `package.json` → `"version"` to match (manual, see above).
3. Commit, tag `vX.Y.Z` (must match the config version — see gap below), push the tag.

## Release procedure (ship 1.1.0)

1. Bump `src-tauri/tauri.conf.json` and `package.json` to `1.1.0` (see above), commit.
2. `git tag v1.1.0 && git push origin v1.1.0` — this is the workflow trigger
   (`.github/workflows/desktop-release.yml` runs on `push: tags: v*`).
3. CI (`build-windows` job):
   - `npx tauri build` — builds the Next.js static export + Rust/NSIS/MSI bundles,
     signing them with `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` if those secrets are set.
   - Generates `update.json` from the *config* version (not the git tag — keep
     them in sync per step 1) with the NSIS installer's signature and download URL.
   - Uploads the installer, MSI, portable exe, checksums, and `update.json` as a
     GitHub Release named `AviationHub vX.Y.Z`, **published** (not draft — see
     gap fixed below), `prerelease: false`.
4. Installed clients running the desktop app poll `@tauri-apps/plugin-updater`
   (see `desktop/components/update-banner.tsx`), which hits the endpoint
   configured in `tauri.conf.json` (`releases/latest/download/update.json`),
   compares versions, and offers an in-app install.
5. Separately, the backend can force old clients to update immediately by
   bumping `MIN_SUPPORTED_DESKTOP_VERSION` in `lib/version.ts` and deploying
   the web app — no desktop release needed for this step. Any running client
   below that version gets a blocking "update required" screen the next time
   it fetches `/api/v1/entitlements` (or picks up the cached value from a
   prior fetch). Treat this as a rare, deliberate action (see comment in
   `lib/version.ts`), not something bumped on every release.

## Auto-update pipeline: what's wired, what's missing

Checked `desktop-release.yml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
`src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`.

**Working / present:**
- Updater plugin registered in Rust (`src-tauri/src/lib.rs`:
  `.plugin(tauri_plugin_updater::Builder::default().build())`) and declared
  in `Cargo.toml` (`tauri-plugin-updater = "2"`).
- `tauri.conf.json` `plugins.updater` is configured: `active: true`,
  endpoint `https://github.com/masterkoster/next-dashboard/releases/latest/download/update.json`,
  and a `pubkey` (minisign public key) is present.
- The workflow generates `update.json` with `version`, `pub_date`, and a
  `windows-x86_64` platform entry (signature + download URL) — matches what
  the Tauri updater expects.
- **Fixed in this change:** the release step had `draft: true`, which means
  the GitHub Release (and its `update.json`/installer assets) was never
  actually published — `releases/latest/download/...` only resolves against
  published, non-prerelease releases, so the configured endpoint would 404
  until a human manually un-drafted the release in the GitHub UI. Changed to
  `draft: false` so the pipeline is actually end-to-end.

**Gaps (not fixed here — need explicit follow-up, no keys were invented):**
1. **`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repo
   secrets** — referenced by the workflow but their presence can't be
   verified from the repo. If unset, `tauri build` produces an unsigned
   bundle, no `.sig` file, and `update.json`'s `signature` field ends up
   `""`. The updater plugin requires a valid signature matching the
   `pubkey` in `tauri.conf.json` and will reject the update — installed
   clients would silently never see 1.1.0. **Confirm these secrets exist in
   the repo settings before relying on auto-update.**
2. **`@tauri-apps/plugin-process` is not registered on the Rust side.** It's
   a JS dependency (`package.json`) and is called from the frontend
   (`update-banner.tsx`'s `relaunch()`, and the new
   `update-required.tsx`'s install flow), but `src-tauri/Cargo.toml` has no
   `tauri-plugin-process` dependency and `src-tauri/src/lib.rs` never calls
   `.plugin(tauri_plugin_process::init())`. Calling `relaunch()` today will
   fail at runtime — the frontend downloads and installs the update but
   can't restart the app afterward. Needs a Rust-side fix (add the Cargo
   dependency, register the plugin) plus a rebuild; not done here since it
   can't be verified without `cargo build`/`tauri build`, which is out of
   scope for this change.
3. **`src-tauri/capabilities/default.json` grants no `updater:*` or
   `process:*` permissions.** Tauri v2 requires explicit capability grants
   for a plugin to be callable from the webview, even if the plugin is
   registered in Rust. The current permission list has none for `updater`
   or `process`, so `check()` / `downloadAndInstall()` / `relaunch()` calls
   from the frontend will likely fail with a permission-denied error at
   runtime. Needs `"updater:default"` and `"process:default"` (or the
   narrower `allow-check` / `allow-relaunch` equivalents) added to the
   `permissions` array, then a rebuild to verify.
4. Only `windows-latest` is built (`build-windows` job); `tauri.conf.json`
   bundle targets include `appimage` and `dmg`, but there's no macOS/Linux
   job, so those targets are unused today. Not a bug, just dead config —
   harmless unless someone assumes cross-platform releases already work.

**Net effect:** the *pipeline* to publish `update.json` now works end-to-end
after the `draft: false` fix, assuming the signing secrets are configured.
The *client-side* auto-install flow (`check()` → `downloadAndInstall()` →
`relaunch()`) is very likely broken today because of gaps 2 and 3 above —
those need a Rust change and a real build to confirm, so a 1.0.1 → 1.1.0
auto-update should be treated as unverified until someone fixes the
capabilities/plugin registration and test-installs a build.
