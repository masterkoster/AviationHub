/**
 * Post-build script: copies Next.js production output to out/ for Tauri.
 *
 * Tauri expects a static file directory at src-tauri/../out.
 * Next.js builds to .next/ by default. This script converts the
 * server build output into a static structure Tauri can serve.
 *
 * Next.js 16 output structure:
 *   .next/server/app/desktop/dashboard/page.html  →  out/desktop/dashboard/index.html
 *   .next/server/app/page.html                    →  out/index.html
 *   .next/static/                                 →  out/_next/static/
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname, relative } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const nextDir = join(root, '.next')
const outDir = join(root, 'out')

console.log('[copy-to-out] Copying Next.js build to out/ for Tauri...')

// Create/recreate out directory
if (existsSync(outDir)) {
  // Remove it to avoid stale files
  cpSync(outDir, join(root, 'out_bak'), { recursive: true, force: true })
}
mkdirSync(outDir, { recursive: true })

// ── 1. Copy static assets (JS, CSS, chunks) ──
const staticSrc = join(nextDir, 'static')
const staticDst = join(outDir, '_next', 'static')
if (existsSync(staticSrc)) {
  cpSync(staticSrc, staticDst, { recursive: true, force: true })
  console.log(`[copy-to-out] Copied static assets → ${staticDst}`)
} else {
  console.warn('[copy-to-out] WARNING: No static assets found in .next/static/')
}

// ── 2. Walk .next/server/app/ and copy all page HTML files ──
const serverAppDir = join(nextDir, 'server', 'app')
let copiedCount = 0

function walkDir(dir, relativePath = '') {
  if (!existsSync(dir)) return
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      // Skip route groups (parentheses) — flatten them
      if (entry.name.startsWith('(')) {
        walkDir(fullPath, relativePath)
      } else {
        walkDir(fullPath, relPath)
      }
    } else if (entry.name === 'page.html') {
      // Next.js page output — copy as index.html
      const dstRelPath = relativePath.replace(/\\/g, '/')
      const dstDir = join(outDir, dstRelPath)
      const dstFile = join(dstDir, 'index.html')
      mkdirSync(dstDir, { recursive: true })

      try {
        let html = readFileSync(fullPath, 'utf-8')
        writeFileSync(dstFile, html)
        copiedCount++
        if (copiedCount <= 20) {
          console.log(`[copy-to-out]   ${relPath}/page.html → ${dstRelPath}/index.html`)
        }
      } catch (e) {
        console.error(`[copy-to-out] Error copying ${fullPath}: ${e.message}`)
      }
    }
  }
}

walkDir(serverAppDir)

// Handle _not-found → 404
const notFoundSrc = join(serverAppDir, '_not-found', 'page.html')
if (existsSync(notFoundSrc)) {
  mkdirSync(join(outDir, '404'), { recursive: true })
  const html = readFileSync(notFoundSrc, 'utf-8')
  writeFileSync(join(outDir, '404', 'index.html'), html)
  console.log('[copy-to-out]   _not-found/page.html → 404/index.html')
}

console.log(`[copy-to-out] Copied ${copiedCount} HTML pages`)

// ── 3. Ensure root index.html exists ──
const rootIndex = join(outDir, 'index.html')
if (!existsSync(rootIndex)) {
  // Create a minimal SPA-style fallback that loads the Next.js app
  const desktopIndex = join(outDir, 'desktop', 'dashboard', 'index.html')
  if (existsSync(desktopIndex)) {
    writeFileSync(rootIndex, `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>AviationHub</title>
<script>window.location.href = '/desktop/dashboard';</script>
</head><body>
<script>window.location.href = '/desktop/dashboard';</script>
</body></html>`)
    console.log('[copy-to-out] Created fallback index.html → redirects to /desktop/dashboard')
  } else {
    writeFileSync(rootIndex, `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>AviationHub</title>
</head><body><h1>AviationHub Desktop</h1>
<p>Loading...</p>
</body></html>`)
    console.log('[copy-to-out] Created minimal index.html (no desktop routes found)')
  }
}

console.log('[copy-to-out] Done!')
