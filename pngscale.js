#!/usr/bin/env node
// pngscale.js — nearest-neighbour PNG downscaler using only node:zlib.
// Copyright (c) 2026 0xnothings
// Usage: node pngscale.js <in.png> <out.png> <size> [--nearest|--box]
//
// Written because a 460x460 avatar is 70 KB and a favicon needs to be a few KB.
// Handles only what the source actually is: 8-bit RGBA, no interlace. Anything
// else exits with a clear message rather than writing a corrupt file.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const [, , src, dst, sizeArg, modeArg] = process.argv;
if (!src || !dst || !sizeArg) {
  console.error('usage: node pngscale.js <in.png> <out.png> <size> [--nearest|--box]');
  process.exit(1);
}
const SIZE = Number(sizeArg);
const BOX = modeArg === '--box';

const buf = readFileSync(src);
let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
const idat = [];
const chunks = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.slice(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    w = data.readUInt32BE(0); h = data.readUInt32BE(4);
    bitDepth = data[8]; colorType = data[9];
    if (data[12] !== 0) { console.error('interlaced PNG is not supported'); process.exit(1); }
  }
  if (type === 'IDAT') idat.push(data);
  if (type !== 'IHDR' && type !== 'IDAT' && type !== 'IEND') chunks.push([type, data]);
  pos += 12 + len;
}
if (bitDepth !== 8 || colorType !== 6) {
  console.error(`expected 8-bit RGBA (got bitDepth=${bitDepth} colorType=${colorType})`);
  process.exit(1);
}

// ── unfilter ───────────────────────────────────────────────────────────────
const bpp = 4, stride = w * bpp;
const raw = inflateSync(Buffer.concat(idat));
const px = Buffer.alloc(h * stride);
let p = 0;
for (let y = 0; y < h; y++) {
  const ft = raw[p++];
  const line = raw.slice(p, p + stride); p += stride;
  const out = px.slice(y * stride, (y + 1) * stride);
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? out[x - bpp] : 0;
    const b = y > 0 ? px[(y - 1) * stride + x] : 0;
    const c = (x >= bpp && y > 0) ? px[(y - 1) * stride + x - bpp] : 0;
    let v = line[x];
    if (ft === 1) v += a;
    else if (ft === 2) v += b;
    else if (ft === 3) v += (a + b) >> 1;
    else if (ft === 4) {
      const pp = a + b - c;
      const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
      v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
    }
    out[x] = v & 255;
  }
}

// ── resample ───────────────────────────────────────────────────────────────
const out = Buffer.alloc(SIZE * SIZE * bpp);
const scale = w / SIZE;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const o = (y * SIZE + x) * bpp;
    if (!BOX) {
      const sx = Math.min(w - 1, Math.floor(x * scale));
      const sy = Math.min(h - 1, Math.floor(y * scale));
      const s = (sy * w + sx) * bpp;
      px.copy(out, o, s, s + bpp);
    } else {
      // box filter: average the source block. Averages colour in premultiplied
      // space so transparent pixels do not drag the edges toward black.
      const x0 = Math.floor(x * scale), x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale));
      const y0 = Math.floor(y * scale), y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < h; yy++) {
        for (let xx = x0; xx < x1 && xx < w; xx++) {
          const s = (yy * w + xx) * bpp;
          const al = px[s + 3] / 255;
          r += px[s] * al; g += px[s + 1] * al; b += px[s + 2] * al; a += px[s + 3];
          n++;
        }
      }
      if (!n) continue;
      const aAvg = a / n / 255;
      out[o] = aAvg > 0 ? Math.round(r / n / aAvg) : 0;
      out[o + 1] = aAvg > 0 ? Math.round(g / n / aAvg) : 0;
      out[o + 2] = aAvg > 0 ? Math.round(b / n / aAvg) : 0;
      out[o + 3] = Math.round(a / n);
    }
  }
}

// ── re-filter (filter type 1 = Sub) and write ──────────────────────────────
const filt = Buffer.alloc(SIZE * (SIZE * bpp + 1));
for (let y = 0; y < SIZE; y++) {
  const ro = y * (SIZE * bpp + 1);
  filt[ro] = 1;
  for (let x = 0; x < SIZE * bpp; x++) {
    const cur = out[y * SIZE * bpp + x];
    const left = x >= bpp ? out[y * SIZE * bpp + x - bpp] : 0;
    filt[ro + 1 + x] = (cur - left) & 255;
  }
}

const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)];
for (const [t, d] of chunks) if (t !== 'PLTE' && t !== 'tRNS') parts.push(chunk(t, d));
parts.push(chunk('IDAT', deflateSync(filt, { level: 9 })));
parts.push(chunk('IEND', Buffer.alloc(0)));
writeFileSync(dst, Buffer.concat(parts));

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`${src} ${w}x${h} ${kb(buf.length)}  ->  ${dst} ${SIZE}x${SIZE} ${kb(readFileSync(dst).length)}  (${BOX ? 'box' : 'nearest'})`);
