/**
 * Version-update contract between the backend and the Tauri desktop client.
 *
 * The backend advertises the oldest desktop app version it still supports
 * via MIN_SUPPORTED_DESKTOP_VERSION (served on /api/health and
 * /api/v1/entitlements). Desktop clients compare their own build version
 * against it and show a blocking "update required" screen when they fall
 * below the line — see apps/desktop/src/lib/entitlements.ts and
 * desktop/components/update-required.tsx.
 *
 * Bump this only when shipping a backend change that old clients can no
 * longer speak to safely. Bumping it forces every older install to update
 * before continuing, so treat it as a deliberate, rare action — not part of
 * routine releases.
 */
export const MIN_SUPPORTED_DESKTOP_VERSION = '0.0.0'

/**
 * Compare two dotted numeric version strings ('x.y.z', any number of
 * segments). No pre-release/build-metadata support — desktop app versions
 * are plain numeric triples. Missing/non-numeric segments are treated as 0.
 *
 * @returns true if `a` is strictly below `b`.
 */
export function isVersionBelow(a: string, b: string): boolean {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na < nb) return true
    if (na > nb) return false
  }
  return false
}

function parseVersion(v: string): number[] {
  return String(v)
    .trim()
    .split('.')
    .map((seg) => {
      const n = parseInt(seg, 10)
      return Number.isFinite(n) ? n : 0
    })
}
