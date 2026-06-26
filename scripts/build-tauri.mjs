/**
 * Tauri build script.
 *
 * Builds Next.js, temporarily starts a production server to capture
 * server-rendered HTML for each desktop route, and saves them as static
 * files for Tauri.
 *
 * IMPORTANT: The server runs ONLY during build time (on CI). The final
 * .exe has zero servers — just plain HTML/JS/CSS files served locally.
 *
 * This is the same approach as static site generation (SSG): a server
 * during build produces static output that needs zero infrastructure.
 */
import { existsSync, mkdirSync, cpSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync, spawn } from 'child_process'
import http from 'http'
import net from 'net'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'out')

/** Find a free TCP port on localhost */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

// ── 1. Build Next.js ──
console.log('[build-tauri] Building Next.js...')
execSync('npx next build', { cwd: root, stdio: 'inherit', shell: true })

// ── 2. Prepare out/ ──
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

// ── 3. Copy static assets immediately ──
const staticSrc = join(root, '.next', 'static')
const staticDst = join(outDir, '_next', 'static')
if (existsSync(staticSrc)) {
  cpSync(staticSrc, staticDst, { recursive: true, force: true })
}

// ── 4. Copy public assets ──
const publicDir = join(root, 'public')
if (existsSync(publicDir)) {
  for (const entry of readdirSync(publicDir, { withFileTypes: true })) {
    const src = join(publicDir, entry.name)
    const dst = join(outDir, entry.name)
    if (entry.isDirectory()) cpSync(src, dst, { recursive: true, force: true })
    else cpSync(src, dst, { force: true })
  }
}

// ── 5. Start Next.js production server on a free port ──
const PORT = await getFreePort()
console.log(`[build-tauri] Starting temp server on :${PORT} to capture HTML...`)
const serverProcess = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  cwd: root,
  stdio: 'pipe',
  shell: true,
})

serverProcess.stdout.on('data', (d) => process.stdout.write(`[next] ${d}`))
serverProcess.stderr.on('data', (d) => process.stderr.write(`[next] ${d}`))

// ── 6. Wait for the server to return real HTML ──
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Timed out waiting for server')), 60000)

  function poll(attempt = 0) {
    const req = http.get(`http://127.0.0.1:${PORT}/desktop/dashboard`, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        if (data.includes('<!DOCTYPE html>')) {
          clearTimeout(timeout)
          console.log(`[build-tauri] Server ready (poll ${attempt + 1})`)
          resolve()
        } else if (attempt < 60) {
          setTimeout(() => poll(attempt + 1), 1000)
        } else {
          clearTimeout(timeout)
          reject(new Error('Bad response: ' + data.slice(0, 200)))
        }
      })
    })
    req.on('error', () => {
      if (attempt < 60) setTimeout(() => poll(attempt + 1), 1000)
      else { clearTimeout(timeout); reject(new Error('Server never started')) }
    })
    req.end()
  }
  poll()
})

// ── 7. Fetch and save each desktop route ──
const desktopRoutes = [
  '',                    // → index.html (redirects to dashboard)
  'desktop/dashboard',
  'desktop/logbook',
  'desktop/logbook/new',
  'desktop/logbook/currency',
  'desktop/logbook/totals',
  'desktop/aircraft',
  'desktop/calendar',
  'desktop/calendar/new',
  'desktop/login',
  'desktop/signup',
  'desktop/profile',
  'desktop/setup',
  'desktop/map',
  'desktop/accounts',
  'desktop/modules/fuel-saver',
  'desktop/modules/route-planner',
]

let fetched = 0
let errors = []

for (const route of desktopRoutes) {
  const urlPath = route ? `/${route}` : '/desktop'
  const html = await new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}${urlPath}`, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => resolve({ status: res.statusCode, data }))
    })
    req.on('error', () => resolve(null))
    req.end()
  })

  if (!html || html.status !== 200 || html.data.startsWith('{"error')) {
    if (html) errors.push(`${route || '/'} (HTTP ${html.status})`)
    else errors.push(`${route || '/'} (connection error)`)
    continue
  }

  const routePath = route || 'desktop'
  const dirPath = join(outDir, routePath)
  mkdirSync(dirPath, { recursive: true })
  writeFileSync(join(dirPath, 'index.html'), html.data)
  fetched++
}

console.log(`[build-tauri] Fetched ${fetched}/${desktopRoutes.length} pages` +
  (errors.length ? `\n[build-tauri] Errors: ${errors.join(', ')}` : ''))

// ── 8. Kill server ──
console.log('[build-tauri] Killing temp server...')
serverProcess.kill('SIGTERM')
await new Promise((r) => setTimeout(r, 2000))

// ── 9. Ensure root index.html exists ──
const rootIndex = join(outDir, 'index.html')
if (!existsSync(rootIndex)) {
  writeFileSync(rootIndex, `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>AviationHub</title>
<meta http-equiv="refresh" content="0;url=/desktop/dashboard">
</head><body>
<script>window.location.href = '/desktop/dashboard';</script>
</body></html>`)
}

// ── 10. Verify ──
const dashboardFile = join(outDir, 'desktop', 'dashboard', 'index.html')
const staticFile = join(outDir, '_next', 'static')

let ok = true
if (!existsSync(join(outDir, 'index.html'))) { console.error('[build-tauri] ❌ Missing root index.html'); ok = false }
else console.log('[build-tauri] ✅ index.html')

if (!existsSync(dashboardFile)) { console.error('[build-tauri] ❌ Missing desktop/dashboard/index.html'); ok = false }
else {
  const c = readFileSync(dashboardFile, 'utf-8')
  if (c.includes('<!DOCTYPE html>')) console.log('[build-tauri] ✅ desktop/dashboard/index.html (valid HTML)')
  else { console.error('[build-tauri] ❌ Invalid HTML'); ok = false }
}

if (!existsSync(staticFile)) { console.error('[build-tauri] ❌ Missing _next/static'); ok = false }
else {
  const fcount = countFiles(staticFile)
  console.log(`[build-tauri] ✅ _next/static (${fcount} files)`)
}

if (ok) {
  console.log('[build-tauri] ✅ Done! Zero servers in final app — just static files.')
} else {
  process.exit(1)
}

function countFiles(dir) {
  try {
    let n = 0
    function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) walk(join(d, e.name)); else n++ } }
    walk(dir)
    return n
  } catch { return 0 }
}
