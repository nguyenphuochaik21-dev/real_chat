import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

// The SVG is the same geometry as ChatlyLogo. Raster outputs are committed for static hosting.
const svg = await readFile(new URL('../src/app/icon.svg', import.meta.url))
for (const size of [32, 192, 512]) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(
      new URL(`../public/icons/chatly-${size}.png`, import.meta.url).pathname.replace(
        /^\/(\w:)/,
        '$1'
      )
    )
}
await sharp(svg)
  .resize(180, 180)
  .flatten({ background: '#6d28d9' })
  .png()
  .toFile(
    new URL('../public/icons/chatly-apple-180.png', import.meta.url).pathname.replace(
      /^\/(\w:)/,
      '$1'
    )
  )
const inset = await sharp(svg).resize(384, 384).png().toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#6d28d9' } })
  .composite([{ input: inset, left: 64, top: 64 }])
  .png()
  .toFile(
    new URL('../public/icons/chatly-maskable-512.png', import.meta.url).pathname.replace(
      /^\/(\w:)/,
      '$1'
    )
  )
const png = await sharp(svg).resize(48, 48).png().toBuffer()
const header = Buffer.alloc(22)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
header[6] = 48
header[7] = 48
header.writeUInt16LE(1, 10)
header.writeUInt16LE(32, 12)
header.writeUInt32LE(png.length, 14)
header.writeUInt32LE(22, 18)
await writeFile(new URL('../src/app/favicon.ico', import.meta.url), Buffer.concat([header, png]))
console.log('Generated favicon, app, Apple and maskable icons from Chatly SVG')
