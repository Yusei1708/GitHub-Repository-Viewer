#!/usr/bin/env node
/**
 * scripts/generate_icons.js
 * 
 * Deterministic Zero-Dependency Icon Generator for Manifest V3 Extension
 * Generates valid 32-bit RGBA PNG icons (16x16, 48x48, 128x128)
 * using pure Node.js built-ins (zlib, Buffer, fs, path).
 * 
 * Features:
 * - 100% deterministic (byte-for-byte identical output across platforms)
 * - 32-bit RGBA (8 bits per channel, color type 6)
 * - 4x4 supersampling anti-aliasing
 * - GitHub-themed aesthetic (GitHub dark badge #0d1117, border ring, crisp Git branch diagram)
 * - Built-in strict PNG binary validation (magic bytes, IHDR, CRC32, IDAT inflate check, IEND)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Standard CRC-32 calculation
 * Uses native zlib.crc32 if available (Node 22+), with bitwise fallback for portability.
 */
function calcCrc32(buf) {
  if (typeof zlib.crc32 === 'function') {
    return zlib.crc32(buf);
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Create a PNG chunk buffer [4 bytes length][4 bytes type][data][4 bytes CRC32]
 */
function createChunk(type, data) {
  const len = data.length;
  const typeBuf = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  typeBuf.copy(chunk, 4);
  data.copy(chunk, 8);
  const crc = calcCrc32(Buffer.concat([typeBuf, data]));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

/**
 * Helper to compute distance from point (px, py) to line segment (x1, y1)-(x2, y2)
 */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Procedural pixel sampler for GitHub extension icon
 * Coordinate space (u, v) normalized to [0, 1]
 * Returns [R, G, B, A] tuple (0-255)
 */
function sampleGitIconPixel(u, v, width) {
  const dx = u - 0.5;
  const dy = v - 0.5;
  const dist = Math.hypot(dx, dy);

  // Outer transparent zone
  if (dist > 0.46) {
    return [0, 0, 0, 0];
  }

  // Outer border ring: #30363d (GitHub Primer border)
  if (dist > 0.43) {
    return [48, 54, 61, 255];
  }

  // Badge background: #0d1117 (GitHub Primer Dark canvas default)
  const bgR = 13, bgG = 17, bgB = 23;

  // Git Branch Geometry
  // Left trunk vertical line: (0.35, 0.28) to (0.35, 0.72)
  const trunkDist = distToSegment(u, v, 0.35, 0.28, 0.35, 0.72);
  // Branch line: (0.35, 0.54) to (0.65, 0.38)
  const branchDist = distToSegment(u, v, 0.35, 0.54, 0.65, 0.38);

  const lineW = width <= 16 ? 0.08 : 0.055;
  const onLine = trunkDist <= lineW || branchDist <= lineW;

  // Commit Nodes: bottom (0.35, 0.72), top-left (0.35, 0.28), branch-tip (0.65, 0.38)
  const n1 = Math.hypot(u - 0.35, v - 0.72);
  const n2 = Math.hypot(u - 0.35, v - 0.28);
  const n3 = Math.hypot(u - 0.65, v - 0.38);

  const nodeR = width <= 16 ? 0.12 : 0.105;
  // Hollow commit ring on larger sizes; solid commit circles on 16x16 for clarity
  const holeR = width <= 16 ? 0 : 0.05;

  const inNode = n1 <= nodeR || n2 <= nodeR || n3 <= nodeR;
  const inHole = holeR > 0 && (n1 <= holeR || n2 <= holeR || n3 <= holeR);

  if (inHole) {
    return [bgR, bgG, bgB, 255];
  }

  if (n3 <= nodeR) {
    // Branch commit node: GitHub vibrant emerald green #2ea043
    return [46, 160, 67, 255];
  }

  if (inNode || onLine) {
    // Crisp light foreground: #f0f6fc
    return [240, 246, 252, 255];
  }

  return [bgR, bgG, bgB, 255];
}

/**
 * Creates a raw PNG binary buffer using 4x4 supersampling anti-aliasing
 * and standard zlib DEFLATE compression.
 */
function createPngBuffer(width, height) {
  // 1. PNG Signature (8 bytes)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // 2. IHDR Chunk (13 bytes)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);       // Width
  ihdr.writeUInt32BE(height, 4);      // Height
  ihdr.writeUInt8(8, 8);              // Bit depth: 8 bits per channel
  ihdr.writeUInt8(6, 9);              // Color type: 6 (RGBA - 32-bit truecolor with alpha)
  ihdr.writeUInt8(0, 10);             // Compression method: 0 (deflate)
  ihdr.writeUInt8(0, 11);             // Filter method: 0 (adaptive)
  ihdr.writeUInt8(0, 12);             // Interlace method: 0 (no interlace)
  const ihdrChunk = createChunk('IHDR', ihdr);

  // 3. Scanline Raster Data (height rows, each with 1 filter byte + width*4 RGBA bytes)
  const rowStride = 1 + width * 4;
  const rawScanlines = Buffer.alloc(height * rowStride);

  const ss = 4; // 4x4 supersampling
  const ssCount = ss * ss;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    rawScanlines[rowOffset] = 0; // Filter type: None (0)

    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0, sumA = 0;

      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / width;
          const v = (y + (sy + 0.5) / ss) / height;
          const [r, g, b, a] = sampleGitIconPixel(u, v, width);
          sumR += r * (a / 255);
          sumG += g * (a / 255);
          sumB += b * (a / 255);
          sumA += a;
        }
      }

      const alpha = sumA / ssCount;
      const red = alpha > 0 ? (sumR / ssCount) / (alpha / 255) : 0;
      const green = alpha > 0 ? (sumG / ssCount) / (alpha / 255) : 0;
      const blue = alpha > 0 ? (sumB / ssCount) / (alpha / 255) : 0;

      const pxOffset = rowOffset + 1 + x * 4;
      rawScanlines[pxOffset] = Math.round(red);
      rawScanlines[pxOffset + 1] = Math.round(green);
      rawScanlines[pxOffset + 2] = Math.round(blue);
      rawScanlines[pxOffset + 3] = Math.round(alpha);
    }
  }

  // 4. IDAT Chunk (zlib deflate compressed scanlines at level 9 for maximum deterministic compression)
  const compressed = zlib.deflateSync(rawScanlines, { level: 9 });
  const idatChunk = createChunk('IDAT', compressed);

  // 5. IEND Chunk (empty data)
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Validates a PNG buffer against PNG specification and expected dimensions.
 */
function validatePngBuffer(buf, expectedWidth, expectedHeight) {
  const errors = [];
  if (!Buffer.isBuffer(buf) || buf.length < 45) {
    return { valid: false, errors: ['Buffer too short to be a valid PNG (< 45 bytes)'] };
  }

  // 1. Signature
  const expectedSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== expectedSig[i]) {
      errors.push(`Invalid signature byte at index ${i}: 0x${buf[i].toString(16)} (expected 0x${expectedSig[i].toString(16)})`);
    }
  }

  let offset = 8;
  const chunks = [];
  let foundIhdr = false;
  let foundIdat = false;
  let foundIend = false;
  let actualWidth = 0, actualHeight = 0, bitDepth = 0, colorType = 0;
  const idatChunks = [];

  while (offset < buf.length) {
    if (offset + 8 > buf.length) {
      errors.push(`Truncated chunk header at byte offset ${offset}`);
      break;
    }

    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    offset += 8;

    if (offset + length + 4 > buf.length) {
      errors.push(`Chunk ${type} data/crc truncated at byte offset ${offset}`);
      break;
    }

    const data = buf.subarray(offset, offset + length);
    offset += length;
    const crc = buf.readUInt32BE(offset);
    offset += 4;

    const crcPayload = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const computedCrc = calcCrc32(crcPayload);
    if (crc !== computedCrc) {
      errors.push(`CRC32 mismatch on chunk ${type}: read 0x${crc.toString(16)}, computed 0x${computedCrc.toString(16)}`);
    }

    chunks.push({ type, length, crc });

    if (type === 'IHDR') {
      if (chunks.length !== 1) errors.push('IHDR chunk must be the first chunk');
      foundIhdr = true;
      if (length !== 13) errors.push(`IHDR length must be 13, received ${length}`);
      actualWidth = data.readUInt32BE(0);
      actualHeight = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      const compression = data.readUInt8(10);
      const filter = data.readUInt8(11);
      const interlace = data.readUInt8(12);

      if (expectedWidth && actualWidth !== expectedWidth) {
        errors.push(`Width mismatch: expected ${expectedWidth}, received ${actualWidth}`);
      }
      if (expectedHeight && actualHeight !== expectedHeight) {
        errors.push(`Height mismatch: expected ${expectedHeight}, received ${actualHeight}`);
      }
      if (bitDepth !== 8) errors.push(`Bit depth mismatch: expected 8, received ${bitDepth}`);
      if (colorType !== 6) errors.push(`Color type mismatch: expected 6 (RGBA), received ${colorType}`);
      if (compression !== 0) errors.push(`Compression method mismatch: expected 0, received ${compression}`);
      if (filter !== 0) errors.push(`Filter method mismatch: expected 0, received ${filter}`);
      if (interlace !== 0) errors.push(`Interlace mismatch: expected 0, received ${interlace}`);
    } else if (type === 'IDAT') {
      if (!foundIhdr) errors.push('IDAT chunk occurred before IHDR');
      foundIdat = true;
      idatChunks.push(data);
    } else if (type === 'IEND') {
      if (!foundIdat) errors.push('IEND chunk occurred before IDAT');
      foundIend = true;
      if (length !== 0) errors.push(`IEND length must be 0, received ${length}`);
      if (offset !== buf.length) {
        errors.push(`Trailing bytes (${buf.length - offset}) found after IEND`);
      }
      break;
    }
  }

  if (!foundIhdr) errors.push('Missing IHDR chunk');
  if (!foundIdat) errors.push('Missing IDAT chunk');
  if (!foundIend) errors.push('Missing IEND chunk');

  // Verify IDAT scanlines decompressed size
  if (foundIdat && foundIhdr && errors.length === 0) {
    try {
      const fullIdat = Buffer.concat(idatChunks);
      const decompressed = zlib.inflateSync(fullIdat);
      const expectedSize = actualHeight * (1 + actualWidth * 4);
      if (decompressed.length !== expectedSize) {
        errors.push(`Decompressed scanlines size mismatch: expected ${expectedSize}, got ${decompressed.length}`);
      }
    } catch (e) {
      errors.push(`IDAT decompression failed: ${e.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    width: actualWidth,
    height: actualHeight,
    bitDepth,
    colorType,
    chunks: chunks.map(c => c.type),
    fileSize: buf.length
  };
}

/**
 * Main icon generation function
 * @param {string} targetDir - Directory where icons are written (e.g. /home/yusei1708/code/chrome/icons)
 */
function generateIcons(targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const sizes = [16, 48, 128];
  const results = [];

  for (const size of sizes) {
    const filename = `icon${size}.png`;
    const destPath = path.join(targetDir, filename);
    const buf = createPngBuffer(size, size);
    fs.writeFileSync(destPath, buf);

    // Immediate self-validation
    const validation = validatePngBuffer(buf, size, size);
    if (!validation.valid) {
      throw new Error(`Generated icon ${filename} failed validation: ${validation.errors.join('; ')}`);
    }

    results.push({
      file: filename,
      path: destPath,
      size: `${size}x${size}`,
      bytes: buf.length,
      chunks: validation.chunks
    });
  }

  return results;
}

/**
 * Validates existing icon files in target directory
 */
function validateAllIcons(targetDir) {
  const sizes = [16, 48, 128];
  const results = [];

  for (const size of sizes) {
    const filename = `icon${size}.png`;
    const targetFile = path.join(targetDir, filename);
    if (!fs.existsSync(targetFile)) {
      results.push({ file: filename, valid: false, errors: ['File does not exist'] });
      continue;
    }
    const buf = fs.readFileSync(targetFile);
    const validation = validatePngBuffer(buf, size, size);
    results.push({ file: filename, ...validation });
  }

  return results;
}

// CLI Execution Entry Point
if (require.main === module) {
  const defaultDir = path.resolve(__dirname, '..', 'icons');
  const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : defaultDir;

  console.log(`[generate_icons] Generating deterministic 32-bit RGBA PNG icons into: ${targetDir}`);
  const generated = generateIcons(targetDir);

  console.log('[generate_icons] Successfully generated and verified icons:');
  generated.forEach(item => {
    console.log(`  ✓ ${item.file.padEnd(12)} ${item.size.padEnd(9)} (${item.bytes} bytes, chunks: ${item.chunks.join(', ')})`);
  });
}

module.exports = {
  calcCrc32,
  createChunk,
  sampleGitIconPixel,
  createPngBuffer,
  validatePngBuffer,
  generateIcons,
  validateAllIcons
};
