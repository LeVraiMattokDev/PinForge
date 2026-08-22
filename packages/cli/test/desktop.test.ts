import { inflateSync } from 'node:zlib';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { encodeIco, encodePng, gameIcon, iconIco, iconPng } from '../src/icon.js';
import { crateName, exportGame, scaffoldDesktop, windowSize } from '../src/index.js';

const EXAMPLE = new URL('../../../examples/first-game', import.meta.url).pathname;
const workspace = mkdtempSync(join(tmpdir(), 'pinforge-desktop-'));

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

/**
 * Reads a PNG back out the hard way, chunk by chunk, so a wrong CRC table or a
 * miscounted row stride fails here rather than as a picture nobody can open.
 */
function decodePng(png: Buffer): { width: number; height: number; pixels: Buffer } {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const chunks = new Map<string, Buffer>();
  let at = 8;
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.subarray(at + 4, at + 8).toString('ascii');
    const body = png.subarray(at + 8, at + 8 + length);
    const declared = png.readUInt32BE(at + 8 + length);
    expect(crc32(png.subarray(at + 4, at + 8 + length)), `${type} checksum`).toBe(declared);
    chunks.set(type, Buffer.from(body));
    at += 12 + length;
  }
  expect([...chunks.keys()]).toEqual(['IHDR', 'IDAT', 'IEND']);

  const header = chunks.get('IHDR') as Buffer;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  expect(header[8], 'bits per channel').toBe(8);
  expect(header[9], 'colour type RGBA').toBe(6);

  const rows = inflateSync(chunks.get('IDAT') as Buffer);
  expect(rows.length).toBe((width * 4 + 1) * height);
  const pixels = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    expect(rows[row * (width * 4 + 1)], `row ${row} filter`).toBe(0);
    rows.copy(pixels, row * width * 4, row * (width * 4 + 1) + 1, (row + 1) * (width * 4 + 1));
  }
  return { width, height, pixels };
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pixelAt(image: { width: number; pixels: Buffer }, x: number, y: number): number[] {
  const at = (y * image.width + x) * 4;
  return [...image.pixels.subarray(at, at + 4)];
}

describe('naming the crate', () => {
  it('turns a game name into something Cargo accepts', () => {
    expect(crateName('Coin Run')).toBe('coin-run');
    expect(crateName("Mattok's  Big Adventure!")).toBe('mattok-s-big-adventure');
    expect(crateName('  Spaced  ')).toBe('spaced');
  });

  it('never starts with a digit, and never ends up empty', () => {
    // Cargo refuses both, and a game called "2048" or "🎮" is not an error.
    expect(crateName('2048')).toBe('game-2048');
    expect(crateName('🎮')).toBe('pinforge-game');
    expect(crateName('')).toBe('pinforge-game');
    expect(crateName('---')).toBe('pinforge-game');
  });
});

describe('the window', () => {
  it('opens at three times the game, the way play mode shows it', () => {
    expect(windowSize({ width: 320, height: 180 })).toEqual({ width: 960, height: 540 });
  });

  it('stops growing before it outgrows a laptop screen', () => {
    expect(windowSize({ width: 640, height: 360 })).toEqual({ width: 1280, height: 720 });
    expect(windowSize({ width: 1280, height: 720 })).toEqual({ width: 1280, height: 720 });
    // Bigger than any scale fits: shown at its own size rather than at zero.
    expect(windowSize({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
  });
});

describe('laying out a desktop build', () => {
  const directory = join(workspace, 'coin-run-desktop');
  const laid = scaffoldDesktop(EXAMPLE, directory);
  const read = (relative: string): string => readFileSync(join(directory, relative), 'utf8');

  it('writes every file the Rust build needs and nothing else', () => {
    expect(laid.name).toBe('Coin Run');
    expect(laid.crate).toBe('coin-run');
    expect([...laid.files].sort()).toEqual([
      'README.md',
      'dist/index.html',
      'src-tauri/.gitignore',
      'src-tauri/Cargo.toml',
      'src-tauri/build.rs',
      'src-tauri/icons/128x128.png',
      'src-tauri/icons/32x32.png',
      'src-tauri/icons/icon.ico',
      'src-tauri/icons/icon.png',
      'src-tauri/src/main.rs',
      'src-tauri/tauri.conf.json',
    ]);
    for (const file of laid.files) expect(existsSync(join(directory, file)), file).toBe(true);
  });

  it('ships the very same game the browser export ships', () => {
    // One runtime, one export, two windows to look at it through. If these ever
    // drift, a game plays differently on the desktop than in a browser.
    const browser = exportGame(EXAMPLE, join(workspace, 'coin-run.html'));
    expect(read('dist/index.html')).toBe(readFileSync(browser.file, 'utf8'));
  });

  it('names the crate in Cargo.toml and asks for a small release build', () => {
    const cargo = read('src-tauri/Cargo.toml');
    expect(cargo).toContain('name = "coin-run"');
    expect(cargo).toContain('tauri = { version = "2"');
    expect(cargo).toContain('tauri-build = { version = "2"');
    expect(cargo).toContain('strip = true');
  });

  it('configures Tauri to open the exported file, and nothing over the network', () => {
    const config = JSON.parse(read('src-tauri/tauri.conf.json'));
    expect(config.productName).toBe('Coin Run');
    expect(config.identifier).toBe('org.pinforge.coin-run');
    expect(config.build.frontendDist).toBe('../dist');
    expect(config.build.devUrl).toBeUndefined();
    expect(config.app.windows[0]).toMatchObject({ title: 'Coin Run', width: 960, height: 540 });
    expect(config.app.security.csp).toBeNull();
    expect(config.bundle.icon).toContain('icons/icon.ico');
  });

  it('leaves no game code in the Rust side', () => {
    // Everything a game does lives in the project file. If behaviour started
    // leaking into main.rs, the desktop build would stop being an export.
    const main = read('src-tauri/src/main.rs');
    expect(main).toContain('tauri::generate_context!()');
    expect(main).toContain('windows_subsystem = "windows"');
    expect(
      main.split('\n').filter((line) => line.trim() && !line.startsWith('//')).length,
    ).toBeLessThan(10);
  });

  it('tells the person what to run, and that a build is per platform', () => {
    const readme = read('README.md');
    expect(readme).toContain('cargo build --release');
    expect(readme).toContain('rustup.rs');
    expect(readme).toContain('libwebkit2gtk-4.1-dev');
    expect(readme).toMatch(/built on\s+Windows/);
  });

  it('names the folder after the game when nobody says where', () => {
    const chosen = scaffoldDesktop(EXAMPLE, join(workspace, 'somewhere-else'));
    expect(chosen.directory).toBe(join(workspace, 'somewhere-else'));

    const before = process.cwd();
    process.chdir(workspace);
    try {
      expect(scaffoldDesktop(EXAMPLE, undefined).directory).toBe(
        join(realpathSync(workspace), 'coin-run-desktop'),
      );
    } finally {
      process.chdir(before);
    }
  });
});

describe('the icon it draws when nobody has drawn one', () => {
  it('writes a PNG a decoder can read, at the size asked for', () => {
    for (const size of [32, 128, 512]) {
      const image = decodePng(iconPng(size));
      expect(image.width).toBe(size);
      expect(image.height).toBe(size);
      expect(image.pixels.length).toBe(size * size * 4);
    }
  });

  it('draws a dark square with four lighter ones in it', () => {
    const image = decodePng(iconPng(64));
    expect(pixelAt(image, 0, 0)).toEqual([0x10, 0x14, 0x1c, 255]);
    expect(pixelAt(image, 63, 63)).toEqual([0x10, 0x14, 0x1c, 255]);
    expect(pixelAt(image, 20, 20)).toEqual([0x4f, 0xa3, 0xc4, 255]);
    expect(pixelAt(image, 43, 43)).toEqual([0x1d, 0x4d, 0x61, 255]);
    // Nothing see-through: a half transparent taskbar icon looks like a bug.
    for (let at = 3; at < image.pixels.length; at += 4) expect(image.pixels[at]).toBe(255);
  });

  it('stays four squares at sixteen pixels, where the gaps nearly vanish', () => {
    const image = decodePng(iconPng(16));
    const accents = new Set<string>();
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const [red, green, blue] = pixelAt(image, x, y);
        if (blue !== 0x1c) accents.add(`${red},${green},${blue}`);
      }
    }
    expect(accents.size).toBe(3); // two of the four squares share a colour
  });

  it('wraps the PNG in an .ico header that points at it exactly', () => {
    const png = iconPng(256);
    const ico = iconIco(256);

    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1); // an icon
    expect(ico.readUInt16LE(4)).toBe(1); // holding one image
    expect(ico[6]).toBe(0); // 256 is written as zero, which is the format's way
    expect(ico[7]).toBe(0);
    expect(ico.readUInt16LE(12)).toBe(32); // bits per pixel
    expect(ico.readUInt32LE(14)).toBe(png.length);
    expect(ico.readUInt32LE(18)).toBe(22);
    expect(ico.subarray(22)).toEqual(png);
  });

  it('writes a smaller size straight into the header', () => {
    expect(encodeIco(iconPng(32), 32)[6]).toBe(32);
  });

  it('encodes pixels handed to it, not only its own drawing', () => {
    const pixels = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const image = decodePng(encodePng(2, 2, pixels));
    expect(image.pixels).toEqual(pixels);
    expect(gameIcon(8).length).toBe(8 * 8 * 4);
  });
});
