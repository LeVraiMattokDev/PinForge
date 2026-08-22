# Desktop builds

`pinforge export` gives you a web page. This gives you a program: one file
somebody double clicks, `.exe` on Windows, a plain executable on macOS and
Linux, about three megabytes.

```bash
node packages/cli/dist/main.js desktop my-game --out my-game-desktop
cd my-game-desktop/src-tauri
cargo build --release
```

The executable lands in `src-tauri/target/release/`.

## The two steps, and why there are two

`pinforge desktop` writes a folder. It does not produce the program, because
producing it needs a compiler, and it has to run on the kind of computer the
program is for.

So the first step is PinForge's, and it needs nothing you have not got. The
second step is Rust's, it needs [rustup](https://rustup.rs) once, and it is one
command that the folder's own README repeats so nobody has to come back here.

## What is in the folder

```
my-game-desktop/
  README.md              the one command, per platform
  dist/index.html        the whole game — byte for byte what "pinforge export" writes
  src-tauri/
    Cargo.toml           the crate, and a release profile tuned for size
    tauri.conf.json      window title, window size, icon
    build.rs
    src/main.rs          six lines: open a window, run
    icons/               a placeholder icon, drawn for you
```

Nothing in `src-tauri` is game code, and nothing in it is worth editing. The
game is `dist/index.html`. Change the game and run `pinforge desktop` again.

That file being the same file the browser export writes is the point: there is
one runtime, so a game cannot play differently on the desktop than on the web.
A test asserts the two are identical, byte for byte.

## Why Tauri and not Electron

Because of what it costs the person playing. Tauri asks the operating system for
the web view it already has. Electron brings a whole browser with it.

|                      | Tauri | Electron |
| -------------------- | ----- | -------- |
| A PinForge game      | ~3 MB | ~150 MB  |
| Needs a build step   | yes   | no       |
| Ships a browser      | no    | yes      |

A hundred and fifty megabytes to deliver a game measured in tens of kilobytes is
not a trade, it is a mistake. The cost is the build step, and the build step is
one command.

## Per platform

|         | You need                                                    |
| ------- | ----------------------------------------------------------- |
| Windows | Rust. The web view is already part of Windows 10 and 11.     |
| macOS   | Rust, and `xcode-select --install`.                          |
| Linux   | Rust, `libwebkit2gtk-4.1-dev` and `libgtk-3-dev` or similar. |

**A build happens on the system it is for.** A Windows `.exe` is built on
Windows. Cross compiling is possible and is more trouble than it saves; if you
want all three and have one computer, a CI runner per platform is the honest
answer.

## Installers

`cargo build --release` gives you something runnable, which is usually what you
wanted. For an `.msi`, a `.dmg` or a `.deb`, use Tauri's own tool:

```bash
cargo install tauri-cli --version "^2"
cargo tauri build
```

Same project, same configuration; it wraps what you already built.

## Making it yours

- **Window title and size** — `src-tauri/tauri.conf.json`. The size starts at
  three times the game's own resolution, the way play mode shows it, scaled down
  where three times would not fit a 1600 by 900 screen. A game already that big
  opens at its own size.
- **Icon** — `src-tauri/icons`. Four files, replace them with your own drawing at
  the same sizes. `icon.ico` is the one Windows shows.
- **`identifier`** — `org.pinforge.<your-game>` until you change it. Give it your
  own reverse domain name before handing the game to anyone; on macOS it is how
  the system tells one application from another.
- **Crate name** — taken from the game's name, lowercased and hyphenated, which
  is also the executable's name. Rename it in `Cargo.toml` if you would rather.

## What it does not do

- **No code signing.** An unsigned program makes Windows and macOS warn the
  person opening it. Signing needs a certificate you buy and a keychain PinForge
  has no business touching.
- **No auto updating.** Tauri can; a 2D game you send to friends does not need a
  background updater, and adding one would mean running a server.
- **No native menus, no file dialogs, no save files on disk.** The game is the
  same sandboxed page it is on the web, and its rules are the same rules.
