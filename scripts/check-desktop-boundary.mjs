import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const TARGET_DIRS = [
  path.join(ROOT, 'app', 'desktop'),
  path.join(ROOT, 'desktop'),
  path.join(ROOT, 'apps', 'desktop'),
]

const FILE_EXT = new Set(['.ts', '.tsx'])

const ALLOW_API_FETCH = new Set([
  path.join(ROOT, 'desktop', 'lib', 'cloud-api.ts'),
  path.join(ROOT, 'desktop', 'lib', 'cloud-session.ts'),
  path.join(ROOT, 'apps', 'desktop', 'src', 'lib', 'cloud-api.ts'),
  path.join(ROOT, 'apps', 'desktop', 'src', 'lib', 'cloud-session.ts'),
])

// Known pre-existing raw /api fetches, tracked for migration to cloud-api.
// These do NOT fail the check but are reported so the debt stays visible.
// Migrate a file to cloudApi, then DELETE its line here. New offenders (not
// listed) still fail. Paths are repo-relative, POSIX-style.
// modules/tools/* are intentionally left here — those routes are being retired.
const PENDING_MIGRATION = new Set([
  'app/desktop/aircraft/[nNumber]/page.tsx',
  'app/desktop/calendar/page.tsx',
  'app/desktop/dashboard/page.tsx',
  'app/desktop/discover/state/[code]/page.tsx',
  'app/desktop/forgot-password/page.tsx',
  'app/desktop/modules/tools/fuel-burn-tool.tsx',
  'app/desktop/modules/tools/sunrise-sunset-tool.tsx',
  'app/desktop/modules/tools/weight-balance-tool.tsx',
  'app/desktop/reset-password/page.tsx',
])

// Catches both quoted (fetch('/api/...')) and template-literal (fetch(`/api/...`)) calls.
const RAW_API_FETCH = /fetch\(\s*[`'"]\/api\//

const violations = []
const pending = []

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(fullPath)
      continue
    }
    if (!FILE_EXT.has(path.extname(entry.name))) continue
    await checkFile(fullPath)
  }
}

async function checkFile(filePath) {
  const content = await readFile(filePath, 'utf8')
  const rel = path.relative(ROOT, filePath)

  if (content.includes("@/app/v1/")) {
    violations.push(`${rel}: imports web app/v1 modules`)
  }

  if (content.includes('next-auth')) {
    violations.push(`${rel}: imports next-auth in desktop boundary`)
  }

  if (!ALLOW_API_FETCH.has(filePath) && RAW_API_FETCH.test(content)) {
    const relPosix = rel.split(path.sep).join('/')
    if (PENDING_MIGRATION.has(relPosix)) {
      pending.push(relPosix)
    } else {
      violations.push(`${rel}: direct relative /api fetch (use desktop cloud-api/session bridge)`)
    }
  }
}

for (const dir of TARGET_DIRS) {
  await walk(dir)
}

// A file listed as pending but no longer using raw fetch is stale — nudge to clean it up.
const staleAllowlist = [...PENDING_MIGRATION].filter((p) => !pending.includes(p))

if (violations.length > 0) {
  console.error('\nDesktop boundary check failed:\n')
  for (const v of violations) console.error(`- ${v}`)
  console.error('\nRoute backend calls through the desktop cloud-api bridge (apps/desktop/src/lib/cloud-api.ts).')
  process.exit(1)
}

if (pending.length > 0) {
  console.log(`Desktop boundary check passed (${pending.length} file(s) pending cloud-api migration).`)
} else {
  console.log('Desktop boundary check passed.')
}

if (staleAllowlist.length > 0) {
  console.log('\nPENDING_MIGRATION entries no longer using raw /api fetch — remove them from check-desktop-boundary.mjs:')
  for (const p of staleAllowlist) console.log(`- ${p}`)
}
