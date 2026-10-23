// Generates the PNG icons (no dependencies): node icons/make-icons.js
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(size, rounded) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const bg = [200, 85, 61], fg = [250, 247, 242], s = size / 512;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const px = x / s, py = y / s, d = Math.hypot(px - 256, py - 256);
      let col = bg, a = 255;
      if (rounded) { // rounded square corners
        const cx = Math.max(112 - px, 0, px - 400), cy = Math.max(112 - py, 0, py - 400);
        if (Math.hypot(cx, cy) > 112) a = 0;
      }
      if (d < 150) col = fg;
      if (d < 113 && d > 95) col = bg;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2]; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const out = (n, b) => fs.writeFileSync(path.join(__dirname, n), b);
out('icon-192.png', png(192, true));
out('icon-512.png', png(512, false)); // full-bleed so it works as maskable
out('apple-touch-icon.png', png(180, false)); // iOS rounds it itself
