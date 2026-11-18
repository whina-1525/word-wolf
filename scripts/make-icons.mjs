import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(x, y, size)
      const offset = row + 1 + x * 4
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
      raw[offset + 3] = a
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function pixel(x, y, size) {
  const nx = (x + 0.5) / size
  const ny = (y + 0.5) / size
  const dx = Math.max(Math.abs(nx - 0.5) - 0.32, 0)
  const dy = Math.max(Math.abs(ny - 0.5) - 0.32, 0)
  const outside = Math.hypot(dx, dy) * size
  if (outside > 1.2) return [0, 0, 0, 0]
  let red = 243
  let green = 236
  let blue = 223
  const bubble = Math.hypot(nx - 0.46, ny - 0.56)
  if (bubble < 0.28) {
    red = 225
    green = 90
    blue = 50
  }
  const moon = Math.hypot(nx - 0.66, ny - 0.36)
  const bite = Math.hypot(nx - 0.74, ny - 0.32)
  if (moon < 0.16 && bite > 0.12) {
    red = 255
    green = 244
    blue = 230
  }
  const alpha = outside <= 0 ? 255 : Math.round(255 * (1 - Math.min(1, outside / 1.2)))
  return [red, green, blue, alpha]
}

const directory = path.resolve('public')
fs.mkdirSync(directory, { recursive: true })
fs.writeFileSync(path.join(directory, 'icon-192.png'), png(192, pixel))
fs.writeFileSync(path.join(directory, 'icon-512.png'), png(512, pixel))
console.log('icons ok')
