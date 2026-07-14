const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const os = require('os')

const SRC = path.resolve(process.argv[2])
const DEST = path.resolve(process.argv[3])
const CONCURRENCY = Math.min(os.cpus().length, 8)

function collectPngFiles(dir) {
  // Iterative BFS to avoid stack overflow on deep/wide directory trees
  const files = []
  const stack = [dir]
  while (stack.length) {
    const d = stack.pop()
    const entries = fs.readdirSync(d, { withFileTypes: true })
    for (const ent of entries) {
      const full = path.join(d, ent.name)
      if (ent.isDirectory()) stack.push(full)
      else if (ent.name.endsWith('.png')) files.push(full)
    }
  }
  return files
}

async function convertOne(pngPath) {
  const stats = await fs.promises.stat(pngPath)
  if (stats.size < 500) return // transparent stub — skip entirely
  const rel = path.relative(SRC, pngPath)
  const out = path.join(DEST, rel.replace(/\.png$/, '.jpg'))
  const dir = path.dirname(out)
  await fs.promises.mkdir(dir, { recursive: true })
  try {
    await sharp(pngPath, { failOn: 'truncated' })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 75, mozjpeg: true })
      .toFile(out)
  } catch (e) { /* skip corrupt */ }
}

async function runPool(files, concurrency) {
  let idx = 0
  let done = 0
  const total = files.length
  async function worker() {
    while (idx < total) {
      const i = idx++
      await convertOne(files[i])
      done++
      if (done % 5000 === 0) process.stdout.write(`  ${done}/${total}\r`)
    }
  }
  const workers = Array.from({ length: concurrency }, () => worker())
  await Promise.all(workers)
  console.log(`  ${done}/${total} converted`)
}

;(async () => {
  // Recursively clear destination first
  fs.rmSync(DEST, { recursive: true, force: true })
  fs.mkdirSync(DEST, { recursive: true })

  console.log(`Collecting PNGs from ${SRC}...`)
  const files = await collectPngFiles(SRC)
  console.log(`Found ${files.length} PNGs, converting with ${CONCURRENCY} workers...`)
  const t0 = Date.now()
  await runPool(files, CONCURRENCY)
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
})().catch(e => { console.error(e); process.exit(1) })
