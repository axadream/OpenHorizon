// Generates public/icons/icon-192.png and icon-512.png from public/icons/icon.svg.
// Requires `sharp` (npm i -D sharp). If it is not installed, prints a message and exits.
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const svgPath = path.join(root, 'public', 'icons', 'icon.svg')
const outDir = path.join(root, 'public', 'icons')

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.log('sharp is not installed. Run `npm i -D sharp` to generate PNG icons. The SVG fallback remains at public/icons/icon.svg.')
  process.exit(0)
}

const svg = await readFile(svgPath)
await mkdir(outDir, { recursive: true })
for (const size of [192, 512]) {
  const out = path.join(outDir, `icon-${size}.png`)
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(out)
  console.log(`wrote ${out}`)
}
