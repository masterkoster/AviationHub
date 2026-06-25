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

const violations = []

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

  if (!ALLOW_API_FETCH.has(filePath) && /fetch\(\s*['"]\/api\//.test(content)) {
    violations.push(`${rel}: direct relative /api fetch (use desktop cloud-api/session bridge)`)
  }
}

for (const dir of TARGET_DIRS) {
  await walk(dir)
}

if (violations.length > 0) {
  console.error('\nDesktop boundary check failed:\n')
  for (const v of violations) console.error(`- ${v}`)
  process.exit(1)
}

console.log('Desktop boundary check passed.')
