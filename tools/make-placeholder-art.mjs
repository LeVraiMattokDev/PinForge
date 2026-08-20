/**
 * Writes the placeholder art used by examples/first-game and by the project
 * `pinforge new` creates.
 *
 * PinForge imports art, it does not author it. This script exists so the
 * repository is self contained and so a new user has something on screen in the
 * first minute rather than going looking for PNG files. The art is deliberately
 * plain: readable shapes, no attempt at style.
 *
 * Run with: node tools/make-placeholder-art.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUTPUTS = ['examples/first-game/assets', 'packages/cli/templates/starter/assets'];

// --- a very small PNG writer ------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(image) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(image.pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- drawing ---------------------------------------------------------------

function canvas(width, height) {
  const pixels = new Uint8Array(width * height * 4);
  const put = (x, y, colour) => {
    if (x < 0 || y < 0 || x >= width || y >= height || !colour) return;
    const at = (y * width + x) * 4;
    pixels[at] = parseInt(colour.slice(1, 3), 16);
    pixels[at + 1] = parseInt(colour.slice(3, 5), 16);
    pixels[at + 2] = parseInt(colour.slice(5, 7), 16);
    pixels[at + 3] = 255;
  };
  return {
    width,
    height,
    pixels,
    put,
    rect(x, y, w, h, colour) {
      for (let dy = 0; dy < h; dy += 1)
        for (let dx = 0; dx < w; dx += 1) put(x + dx, y + dy, colour);
    },
    disc(cx, cy, radius, colour) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy <= radius * radius) put(cx + dx, cy + dy, colour);
        }
      }
    },
  };
}

const GRASS = '#57a84b';
const GRASS_DARK = '#3d7a35';
const DIRT = '#7a5230';
const DIRT_DARK = '#5e3e24';
const PLANK = '#b07c42';
const PLANK_DARK = '#8a5f31';
const SPIKE = '#c3ccd6';
const CLOUD = '#e8f2ff';

function tileset() {
  const image = canvas(16 * 5, 16);
  // 0: grass on top of dirt
  image.rect(0, 0, 16, 4, GRASS);
  image.rect(0, 4, 16, 12, DIRT);
  for (let x = 0; x < 16; x += 4) image.put(x, 3, GRASS_DARK);
  // 1: solid dirt
  image.rect(16, 0, 16, 16, DIRT);
  for (let x = 0; x < 16; x += 5) image.put(16 + x, 6, DIRT_DARK);
  // 2: wooden platform, drawn only along the top
  image.rect(32, 0, 16, 4, PLANK);
  image.rect(32, 4, 16, 2, PLANK_DARK);
  // 3: spikes. Each spike is kept strictly inside its own four pixel column, or
  // it bleeds into the neighbouring tile and appears under whatever is drawn
  // there. That is exactly what happened the first time.
  for (let i = 0; i < 4; i += 1) {
    for (let row = 0; row < 8; row += 1) {
      const width = Math.max(1, Math.round(((row + 1) / 8) * 4));
      const left = 48 + i * 4 + Math.floor((4 - width) / 2);
      for (let dx = 0; dx < width; dx += 1) image.put(left + dx, 8 + row, SPIKE);
    }
  }
  // 4: cloud
  image.disc(64 + 5, 9, 4, CLOUD);
  image.disc(64 + 10, 8, 5, CLOUD);
  return image;
}

function player() {
  const frames = 7;
  const image = canvas(16 * frames, 16);
  const skin = '#f3d2a7';
  const shirt = '#3f7ad9';
  const trousers = '#2b3a55';
  const hair = '#4a2f20';
  for (let frame = 0; frame < frames; frame += 1) {
    const x = frame * 16;
    const bob = frame === 1 ? 1 : 0;
    const airborne = frame === 6;
    image.rect(x + 5, 2 + bob, 6, 2, hair);
    image.rect(x + 5, 4 + bob, 6, 4, skin);
    image.put(x + 6, 5 + bob, '#2b2b2b');
    image.put(x + 9, 5 + bob, '#2b2b2b');
    image.rect(x + 4, 8 + bob, 8, 4, shirt);
    if (frame >= 2 && frame <= 5) {
      const stride = frame % 2 === 0 ? 1 : -1;
      image.rect(x + 4 + stride, 12 + bob, 3, 4, trousers);
      image.rect(x + 9 - stride, 12 + bob, 3, 4, trousers);
    } else if (airborne) {
      image.rect(x + 4, 12, 3, 3, trousers);
      image.rect(x + 9, 11, 3, 4, trousers);
    } else {
      image.rect(x + 4, 12 + bob, 3, 4, trousers);
      image.rect(x + 9, 12 + bob, 3, 4, trousers);
    }
  }
  return image;
}

function coin() {
  const image = canvas(8 * 4, 8);
  const widths = [3, 2, 1, 2];
  widths.forEach((half, frame) => {
    const centre = frame * 8 + 4;
    for (let y = 1; y < 7; y += 1) {
      for (let dx = -half; dx < half; dx += 1) {
        image.put(centre + dx, y, dx === -half ? '#c99a1e' : '#f5c542');
      }
    }
  });
  return image;
}

function slime() {
  const image = canvas(16 * 2, 16);
  for (let frame = 0; frame < 2; frame += 1) {
    const x = frame * 16;
    const squash = frame;
    image.rect(x + 2, 6 + squash, 12, 10 - squash, '#57c85a');
    image.rect(x + 2, 14, 12, 2, '#2f7a33');
    image.put(x + 5, 9 + squash, '#12300f');
    image.put(x + 10, 9 + squash, '#12300f');
  }
  return image;
}

function flag() {
  const image = canvas(16 * 2, 24);
  for (let frame = 0; frame < 2; frame += 1) {
    const x = frame * 16;
    image.rect(x + 3, 2, 2, 22, '#cfd6dd');
    const wave = frame === 0 ? 0 : 1;
    for (let row = 0; row < 8; row += 1) {
      const width = 9 - Math.abs(row - 4) + wave;
      image.rect(x + 5, 3 + row, width, 1, '#e05252');
    }
  }
  return image;
}

/**
 * Two very short sounds, written straight out as 8 bit mono WAV. Same reason as
 * the pictures: the example should make a noise without anybody hunting for
 * audio files first.
 */
function wav(seconds, sampleAt) {
  const rate = 11025;
  const count = Math.floor(rate * seconds);
  const data = Buffer.alloc(count);
  for (let index = 0; index < count; index += 1) {
    const time = index / rate;
    const fade = 1 - index / count;
    data[index] = Math.max(0, Math.min(255, Math.round(128 + 100 * fade * sampleAt(time))));
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const sounds = {
  'coin.wav': wav(0.18, (time) => Math.sin(2 * Math.PI * (880 + time * 1400) * time)),
  'jump.wav': wav(0.14, (time) => Math.sin(2 * Math.PI * (320 + time * 900) * time)),
};

const files = {
  'tiles.png': tileset(),
  'player.png': player(),
  'coin.png': coin(),
  'slime.png': slime(),
  'flag.png': flag(),
};

for (const directory of OUTPUTS) {
  mkdirSync(directory, { recursive: true });
  for (const [name, image] of Object.entries(files)) {
    writeFileSync(`${directory}/${name}`, encodePng(image));
    process.stdout.write(`${directory}/${name} ${image.width}x${image.height}\n`);
  }
  for (const [name, bytes] of Object.entries(sounds)) {
    writeFileSync(`${directory}/${name}`, bytes);
    process.stdout.write(`${directory}/${name} ${bytes.length} bytes\n`);
  }
}
