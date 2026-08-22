import { deflateSync } from 'node:zlib';

/**
 * A window and taskbar icon, drawn here rather than shipped as a file, because
 * a desktop build needs one before the person making the game has thought about
 * one. Windows wants an .ico, everything else wants a .png, and both are small
 * enough to write by hand.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes straight RGBA pixels as a PNG, with no filtering to get wrong. */
export function encodePng(width: number, height: number, pixels: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // colour type: RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const at = row * (width * 4 + 1);
    rows[at] = 0; // no filter
    pixels.copy(rows, at + 1, row * width * 4, (row + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Wraps a PNG as a one image .ico, which Windows has accepted since Vista. */
export function encodeIco(png: Buffer, size: number): Buffer {
  const directory = Buffer.alloc(6 + 16);
  directory.writeUInt16LE(0, 0); // reserved
  directory.writeUInt16LE(1, 2); // an icon, not a cursor
  directory.writeUInt16LE(1, 4); // one image
  directory[6] = size >= 256 ? 0 : size;
  directory[7] = size >= 256 ? 0 : size;
  directory[8] = 0; // colours in the palette: none, it is true colour
  directory[9] = 0; // reserved
  directory.writeUInt16LE(1, 10); // colour planes
  directory.writeUInt16LE(32, 12); // bits per pixel
  directory.writeUInt32LE(png.length, 14);
  directory.writeUInt32LE(directory.length, 18); // the image starts right after
  return Buffer.concat([directory, png]);
}

/**
 * The mark: a dark square with four lighter ones inside it, which is a tile
 * grid, which is what this engine is about. It stays legible at sixteen pixels,
 * which the fancier ideas did not.
 */
export function gameIcon(size: number): Buffer {
  const pixels = Buffer.alloc(size * size * 4);
  const paper = [0x10, 0x14, 0x1c];
  const tiles: [number, number, number][] = [
    [0x4f, 0xa3, 0xc4],
    [0x2c, 0x6e, 0x8a],
    [0x2c, 0x6e, 0x8a],
    [0x1d, 0x4d, 0x61],
  ];
  const inset = Math.max(1, Math.round(size * 0.18));
  const gap = Math.max(1, Math.round(size * 0.06));
  const cell = Math.floor((size - inset * 2 - gap) / 2);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let colour = paper;
      for (let quadrant = 0; quadrant < 4; quadrant += 1) {
        const left = inset + (quadrant % 2) * (cell + gap);
        const top = inset + Math.floor(quadrant / 2) * (cell + gap);
        if (x >= left && x < left + cell && y >= top && y < top + cell) {
          colour = tiles[quadrant] as number[];
        }
      }
      const at = (y * size + x) * 4;
      pixels[at] = colour[0] as number;
      pixels[at + 1] = colour[1] as number;
      pixels[at + 2] = colour[2] as number;
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}

export function iconPng(size: number): Buffer {
  return encodePng(size, size, gameIcon(size));
}

export function iconIco(size = 256): Buffer {
  return encodeIco(iconPng(size), size);
}
