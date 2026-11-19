// Genera los íconos de Ozo (SVG + PNG 192/512 + maskable) sin dependencias.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const out = new URL('../public/', import.meta.url)
mkdirSync(out, { recursive: true })

// Geometría en unidades de 0..1: cuadrado redondeado negro + aro blanco grueso.
const shape = (maskable) => ({
  radius: maskable ? 0 : 0.22, // el maskable ocupa todo el lienzo
  ringOuter: maskable ? 0.27 : 0.33,
  ringInner: maskable ? 0.15 : 0.185,
})

function crc32(buf) {
  let c, crc = ~0
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return ~crc >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(size, maskable) {
  const { radius, ringOuter, ringInner } = shape(maskable)
  const SS = 4
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const inside = (x, y) => {
    // rectángulo redondeado
    const r = radius
    const dx = Math.max(r - x, x - (1 - r), 0)
    const dy = Math.max(r - y, y - (1 - r), 0)
    return dx * dx + dy * dy <= r * r
  }
  for (let py = 0; py < size; py++) {
    const row = py * (size * 4 + 1)
    raw[row] = 0
    for (let px = 0; px < size; px++) {
      let a = 0, w = 0
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / size
        const y = (py + (sy + 0.5) / SS) / size
        if (!inside(x, y)) continue
        a++
        const d = Math.hypot(x - 0.5, y - 0.5)
        if (d <= ringOuter && d >= ringInner) w++
      }
      const n = SS * SS
      const i = row + 1 + px * 4
      const v = a ? Math.round((w / a) * 255) : 0
      raw[i] = v; raw[i + 1] = v; raw[i + 2] = v; raw[i + 3] = Math.round((a / n) * 255)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

const s = shape(false)
const mid = (s.ringOuter + s.ringInner) / 2 * 512
const sw = (s.ringOuter - s.ringInner) * 512
writeFileSync(new URL('icon.svg', out),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${s.radius * 512}" fill="#000"/><circle cx="256" cy="256" r="${mid}" fill="none" stroke="#fff" stroke-width="${sw}"/></svg>\n`)
writeFileSync(new URL('icon-192.png', out), png(192, false))
writeFileSync(new URL('icon-512.png', out), png(512, false))
writeFileSync(new URL('icon-maskable-512.png', out), png(512, true))
writeFileSync(new URL('apple-touch-icon.png', out), png(180, true))
console.log('íconos generados en public/')
