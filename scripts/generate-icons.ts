import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

export function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i] ?? 0;
    const tableVal = CRC_TABLE[(crc ^ byte) & 0xff] ?? 0;
    crc = (crc >>> 8) ^ tableVal;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  chunk.set(data, 8);
  const crcVal = crc32(chunk.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crcVal, false);
  return chunk;
}

/**
 * Generates a valid RGBA PNG buffer of exact `size x size` pixel dimensions.
 * Renders an AO3-crimson rounded square (#990000) with a white checkmark emblem.
 */
export function renderIconPng(size: number): Uint8Array {
  // Each scanline has 1 filter byte (0) + size * 4 RGBA bytes
  const rawData = new Uint8Array(size * (1 + size * 4));
  const radius = size * 0.22;
  const margin = Math.max(1, Math.round(size * 0.06));

  // Checkmark segment endpoints in normalized [0, 1] coordinates
  const p1x = 0.28 * size;
  const p1y = 0.53 * size;
  const p2x = 0.44 * size;
  const p2y = 0.69 * size;
  const p3x = 0.74 * size;
  const p3y = 0.34 * size;
  const strokeHalfWidth = Math.max(1.1, size * 0.095);

  function distToSegment(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number
  ): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t =
      lenSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    rawData[rowStart] = 0; // Filter type 0 (None)

    for (let x = 0; x < size; x++) {
      const pixelOffset = rowStart + 1 + x * 4;
      const cx = x + 0.5;
      const cy = y + 0.5;

      // Check rounded rectangle bounds
      const minB = margin;
      const maxB = size - margin;
      const qx = Math.max(minB + radius - cx, 0, cx - (maxB - radius));
      const qy = Math.max(minB + radius - cy, 0, cy - (maxB - radius));
      const distRect = Math.hypot(qx, qy) - radius;

      if (distRect > 0.5) {
        // Transparent outside rounded square
        rawData[pixelOffset] = 0;
        rawData[pixelOffset + 1] = 0;
        rawData[pixelOffset + 2] = 0;
        rawData[pixelOffset + 3] = 0;
        continue;
      }

      // Check distance to checkmark
      const d1 = distToSegment(cx, cy, p1x, p1y, p2x, p2y);
      const d2 = distToSegment(cx, cy, p2x, p2y, p3x, p3y);
      const distCheck = Math.min(d1, d2);

      if (distCheck <= strokeHalfWidth) {
        // White foreground emblem (#ffffff)
        rawData[pixelOffset] = 255;
        rawData[pixelOffset + 1] = 255;
        rawData[pixelOffset + 2] = 255;
        rawData[pixelOffset + 3] = 255;
      } else {
        // AO3 Crimson background (#990000)
        rawData[pixelOffset] = 153;
        rawData[pixelOffset + 1] = 0;
        rawData[pixelOffset + 2] = 0;
        rawData[pixelOffset + 3] = 255;
      }
    }
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, size, false);
  ihdrView.setUint32(4, size, false);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: 6 (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const compressed = new Uint8Array(deflateSync(rawData));

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makePngChunk("IHDR", ihdr);
  const idatChunk = makePngChunk("IDAT", compressed);
  const iendChunk = makePngChunk("IEND", new Uint8Array(0));

  const totalLength =
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const png = new Uint8Array(totalLength);

  let offset = 0;
  png.set(signature, offset);
  offset += signature.length;
  png.set(ihdrChunk, offset);
  offset += ihdrChunk.length;
  png.set(idatChunk, offset);
  offset += idatChunk.length;
  png.set(iendChunk, offset);

  return png;
}

export function generateIcons(
  outputDir = join(process.cwd(), "src", "icons")
): void {
  mkdirSync(outputDir, { recursive: true });
  for (const size of [16, 48, 128]) {
    const pngBuffer = renderIconPng(size);
    const filePath = join(outputDir, `icon-${size}.png`);
    writeFileSync(filePath, pngBuffer);
  }
}

if (import.meta.main) {
  generateIcons();
  console.log("Generated icons/icon-16.png, icon-48.png, and icon-128.png");
}
