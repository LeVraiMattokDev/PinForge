import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildHtml, readRuntimeBundle } from '../html.js';
import { iconIco, iconPng } from '../icon.js';
import { inlineAssets } from '../inline.js';
import { openProject } from '../project-file.js';

export interface DesktopScaffold {
  readonly directory: string;
  readonly name: string;
  readonly crate: string;
  readonly files: readonly string[];
}

/**
 * Lays out a desktop build of a game, as a Tauri project around the very same
 * single HTML file `pinforge export` writes.
 *
 * Tauri and not Electron because of what it costs the person playing: Tauri asks
 * the operating system for the web view it already has, so the whole game is a
 * five megabyte executable, where bundling a browser would be a hundred and
 * fifty for a game measured in tens of kilobytes.
 *
 * This writes the project and stops. Turning it into an executable needs Rust,
 * and has to happen on the system being built for, so the README it leaves says
 * exactly which one command to run where.
 */
export function scaffoldDesktop(target: string, out: string | undefined): DesktopScaffold {
  const { project, directory: source } = openProject(target);
  const html = buildHtml(inlineAssets(project, source), readRuntimeBundle());

  const crate = crateName(project.meta.name);
  const directory = resolve(process.cwd(), out ?? `${crate}-desktop`);
  const window = windowSize(project.settings.viewport);
  const files: string[] = [];

  const put = (relative: string, contents: string | Buffer): void => {
    const file = join(directory, relative);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, contents);
    files.push(relative);
  };

  // The game itself, byte for byte what the browser export is.
  put(join('dist', 'index.html'), html);

  put(join('src-tauri', 'Cargo.toml'), cargoToml(crate));
  put(join('src-tauri', 'build.rs'), 'fn main() {\n    tauri_build::build()\n}\n');
  put(
    join('src-tauri', 'tauri.conf.json'),
    `${JSON.stringify(tauriConfig(project.meta.name, crate, window), null, 2)}\n`,
  );
  put(join('src-tauri', 'src', 'main.rs'), mainRs(project.meta.name));
  put(join('src-tauri', '.gitignore'), 'target\n');

  // Tauri needs an icon before anyone has drawn one.
  put(join('src-tauri', 'icons', '32x32.png'), iconPng(32));
  put(join('src-tauri', 'icons', '128x128.png'), iconPng(128));
  put(join('src-tauri', 'icons', 'icon.png'), iconPng(512));
  put(join('src-tauri', 'icons', 'icon.ico'), iconIco(256));

  put('README.md', readme(project.meta.name, crate));

  return { directory, name: project.meta.name, crate, files };
}

/** A crate name Cargo will accept, from whatever the game is called. */
export function crateName(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (cleaned === '') return 'pinforge-game';
  return /^[0-9]/.test(cleaned) ? `game-${cleaned}` : cleaned;
}

/**
 * A window three times the game's own size, which is what play mode uses, kept
 * inside something a laptop can show.
 */
export function windowSize(viewport: { width: number; height: number }): {
  width: number;
  height: number;
} {
  const scale = Math.max(
    1,
    Math.min(3, Math.floor(Math.min(1600 / viewport.width, 900 / viewport.height))),
  );
  return { width: viewport.width * scale, height: viewport.height * scale };
}

function cargoToml(crate: string): string {
  return `[package]
name = "${crate}"
version = "0.1.0"
edition = "2021"
rust-version = "1.77"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }

# A game is not a server: none of this needs to be fast to compile, and every
# kilobyte is one the player downloads.
[profile.release]
opt-level = "s"
lto = true
codegen-units = 1
panic = "abort"
strip = true
`;
}

function tauriConfig(
  title: string,
  crate: string,
  window: { width: number; height: number },
): unknown {
  return {
    $schema: 'https://schema.tauri.app/config/2',
    productName: title,
    version: '0.1.0',
    identifier: `org.pinforge.${crate}`,
    build: {
      // No dev server and no bundler: the whole game is one file already.
      frontendDist: '../dist',
    },
    app: {
      windows: [
        {
          title,
          width: window.width,
          height: window.height,
          resizable: true,
          fullscreen: false,
        },
      ],
      // The page fetches nothing, so there is nothing to allow or forbid.
      security: { csp: null },
    },
    bundle: {
      active: true,
      targets: 'all',
      icon: ['icons/32x32.png', 'icons/128x128.png', 'icons/icon.ico', 'icons/icon.png'],
    },
  };
}

function mainRs(title: string): string {
  return `// ${title}, as a desktop window.
//
// Nothing in here is game code. The game is dist/index.html, the same single
// file the browser export produces, and this only opens a window around it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("could not open the game window");
}
`;
}

function readme(title: string, crate: string): string {
  return `# ${title}, for the desktop

This folder builds ${title} into one executable: \`${crate}.exe\` on Windows, and
a plain runnable file on macOS and Linux.

\`dist/index.html\` is the whole game, exactly what \`pinforge export\` writes.
Everything in \`src-tauri\` is only there to open a window around it, so any
change you make to the game means running \`pinforge desktop\` again, not editing
anything here.

## What you need, once

- [Rust](https://rustup.rs). That is the only thing this needs that PinForge
  itself does not.
- On **Windows**: nothing else. The web view is already part of Windows 10 and 11.
- On **macOS**: Xcode command line tools, \`xcode-select --install\`.
- On **Linux**: your distribution's WebKitGTK development package, for example
  \`libwebkit2gtk-4.1-dev\` and \`libgtk-3-dev\` on Debian and Ubuntu.

## Build it

\`\`\`bash
cd src-tauri
cargo build --release
\`\`\`

The executable lands in \`src-tauri/target/release/\`. That one file is the whole
game: it asks the operating system for the web view it already has rather than
carrying a browser along, which is why it is a handful of megabytes instead of a
hundred and fifty.

**A build has to happen on the system it is for.** A Windows \`.exe\` is built on
Windows, a macOS app on macOS. Cross building is possible and is more trouble
than it saves.

## Installers, if you want them

\`cargo build\` gives you something runnable. For an installer — an \`.msi\`, a
\`.dmg\`, a \`.deb\` — install Tauri's own tool and use it instead:

\`\`\`bash
cargo install tauri-cli --version "^2"
cargo tauri build
\`\`\`

## Making it yours

- The window's title and size are in \`src-tauri/tauri.conf.json\`.
- The icon is in \`src-tauri/icons\`. Replace all four with your own drawing at
  the same sizes; \`icon.ico\` is the one Windows shows.
- \`identifier\` in \`tauri.conf.json\` should become your own reverse domain name
  before you give the game to anyone.
`;
}
