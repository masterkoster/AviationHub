/**
 * Post-build script: copies Next.js production output to out/ for Tauri.
 * 
 * Tauri expects a static file directory at src-tauri/../out.
 * Next.js builds to .next/ by default. This script copies the
 * client-side static assets and creates HTML entry points.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const nextDir = join(root, '.next')
const outDir = join(root, 'out')

console.log('[copy-to-out] Copying Next.js build to out/ for Tauri...')

// Create out directory
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

// Copy static assets
const staticSrc = join(nextDir, 'static')
const staticDst = join(outDir, '_next', 'static')
if (existsSync(staticSrc)) {
  cpSync(staticSrc, staticDst, { recursive: true, force: true })
  console.log(`[copy-to-out] Copied static assets to ${staticDst}`)
}

// Copy server-side HTML files
const serverAppDir = join(nextDir, 'server', 'app')
function copyHtmlFiles(srcDir, dstDir, prefix = '') {
  if (!existsSync(srcDir)) return
  const entries = readdirSync(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'next-font-manifest.json') continue
    const srcPath = join(srcDir, entry.name)
    const dstPath = join(dstDir, entry.name)
    if (entry.isDirectory()) {
      // Handle route groups and params
      const dirName = entry.name.startsWith('(') ? '' : entry.name
      const subPrefix = prefix ? `${prefix}/${dirName}` : dirName
      if (entry.name.endsWith('.html')) continue
      copyHtmlFiles(srcPath, dstDir, subPrefix)
    } else if (entry.name === 'index.html' || entry.name.endsWith('.html')) {
      // Copy HTML to the right location
      const htmlDir = prefix ? join(dstDir, prefix) : dstDir
      if (!existsSync(htmlDir)) mkdirSync(htmlDir, { recursive: true })
      const htmlDst = join(htmlDir, entry.name)
        .replace(/\\/g, '/')
        .replace(/_not-found/g, '404')
      
      try {
        let html = readFileSync(srcPath, 'utf-8')
        // Fix asset paths - remove next static prefix
        html = html.replace(/\/_next\/static\//g, '/_next/static/')
        writeFileSync(htmlDst, html)
        console.log(`[copy-to-out] Copied HTML: ${srcPath} -> ${htmlDst}`)
      } catch (e) {
        console.error(`[copy-to-out] Error copying ${srcPath}: ${e.message}`)
      }
    }
  }
}

import { readdirSync } from 'fs'
copyHtmlFiles(serverAppDir, outDir)

// Also copy any root-level index.html
const rootHtml = join(nextDir, 'server', 'app', 'index.html')
if (existsSync(rootHtml)) {
  writeFileSync(join(outDir, 'index.html'), readFileSync(rootHtml))
  console.log('[copy-to-out] Copied root index.html')
}

// Create a fallback index.html if none exists
if (!existsSync(join(outDir, 'index.html'))) {
  writeFileSync(join(outDir, 'index.html'), `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>AviationHub</title>
<meta http-equiv="refresh" content="0;url=/desktop/dashboard">
</head><body>
<script>window.location.href = '/desktop/dashboard';</script>
</body></html>`)
  console.log('[copy-to-out] Created fallback index.html')
}

console.log('[copy-to-out] Done!')
