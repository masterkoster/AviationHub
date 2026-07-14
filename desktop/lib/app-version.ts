import tauriConf from '../../src-tauri/tauri.conf.json'

/**
 * Application version — used by What's New modal and update checks.
 *
 * src-tauri/tauri.conf.json is the single source of truth (it's also what
 * `tauri build` stamps into the installer and what the updater compares
 * against), so this reads straight from it instead of hardcoding a string
 * that can drift. package.json's "version" field is a separate, manual
 * mirror — bump it to match when you bump tauri.conf.json (see
 * docs/RELEASING.md).
 */
export const APP_VERSION: string = tauriConf.version
