# PinForge

An open source, browser based, no-code 2D game engine.

PinForge is for someone who has never written a line of code and wants to make a
game. Not a smaller Godot, and not a toy: a narrow, opinionated engine that does
2D platformers properly and gets out of the way. The whole design answers one
test.

> A non programmer sits in front of PinForge with no explanation and ships a
> playable, exportable 2D game within 30 minutes.

When a feature would make the engine more powerful and that test harder to pass,
the feature loses.

Built by [PinStudio](#about-pinstudio), a Swiss non profit association for game
creation, peer learning and free software.

## What it does

- **2D only.** Sprites, tilemaps and axis aligned boxes.
- **A visual editor.** Scene tree, inspector, tilemap painter, event editor, and
  play mode running the exact same runtime as the export.
- **Rules instead of code.** Every behaviour is a sentence you assemble from
  dropdowns: `WHEN Player collides with Coin THEN destroy Coin, add 1 to Score`.
- **The same rules three ways.** Dropdown sentences, snap-together blocks in
  the Scratch tradition, and [PinScript](docs/script.md), the sentences as
  text you can type, copy and share. Three faces, one meaning.
- **Whole things, ready made.** Someone to talk to, an enemy that walks about,
  something to collect, a way to finish the level: one click puts in the kind of
  thing, a copy of it, and the rules that make it work. Then read those rules to
  learn how it was done.
- **Movement that feels right by default.** Coyote time, jump buffering and
  asymmetric gravity are on, tuned, and invisible unless you go looking.
- **Export to one HTML file** you can put anywhere.
- **Or to a program people double click** — one executable of about three
  megabytes, `.exe` on Windows, built with one Rust command from the folder
  PinForge lays out. Same file inside, same runtime.
- **An MCP server**, so an assistant can build and edit a game with you through
  the same file format and the same validation the editor uses.

It deliberately does not include a sprite editor, an audio editor, 3D, a physics
library, node graph scripting, or accounts. It imports PNG and audio files and
gets on with being a game engine.

## Status

All six phases are done: the project format, the runtime, a playable example
game written by hand, the visual editor, the command line, export to a single
HTML file or to a desktop executable, both movement modes, and authoring over
the Model Context Protocol.
The format came first because it is the contract every other package agrees on.

| Phase | What                                                                 | State |
| ----- | -------------------------------------------------------------------- | ----- |
| 0     | `packages/schema`: the format, validation, migrations, JSON Schema   | done  |
| 1     | `packages/core`: fixed timestep runtime, collision, movement, events | done  |
| 2     | `examples/first-game` written by hand, plus the CLI to run it        | done  |
| 3     | `packages/editor`: the visual editor                                 | done  |
| 4     | Export to standalone HTML and to the desktop, free movement, camera  | done  |
| 5     | `packages/mcp`: authoring over the Model Context Protocol            | done  |

```bash
pnpm install && pnpm build

# The editor. It opens on a game you can already play.
pnpm --filter @pinforge/editor dev
```

![The PinForge editor](docs/images/editor.png)

Or from the command line, without the editor:

```bash
# Play the example in a browser
node packages/cli/dist/main.js run examples/first-game

# Start your own, from a playable starting point
node packages/cli/dist/main.js new my-game --name "My game"

# Ship it as one HTML file with nothing else to upload
node packages/cli/dist/main.js export my-game --out my-game.html

# Or as a program people double click, built with one Rust command
node packages/cli/dist/main.js desktop my-game
```

See [getting started](docs/getting-started.md) for the walkthrough.

## Documentation

- [Getting started](docs/getting-started.md) — make a small platformer from
  nothing, written for someone who has never made a game.
- [Concepts](docs/concepts.md) — scenes, entities, components, tiles and events
  in plain language.
- [The project format](docs/project-format.md) — the authoritative description of
  the file, with a complete annotated example.
- [Events reference](docs/events-reference.md) — every trigger, condition and
  action, with an example each.
- [Writing rules as text](docs/script.md) — PinScript, every rule as a sentence
  you can type, with every phrase listed.
- [Desktop builds](docs/desktop.md) — turning a game into one executable, and
  what that costs.
- [Architecture](docs/architecture.md) — package boundaries and the decisions
  behind them, for contributors.
- [The MCP server](docs/mcp.md) — building a game with an assistant.
- [Contributing](CONTRIBUTING.md).

## About PinStudio

PinStudio is a Swiss non profit association working on game creation, peer
learning and free software. PinForge is one of its projects and is developed in
the open.

## Licence

MIT. See [LICENSE](LICENSE).
