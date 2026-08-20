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
- **Movement that feels right by default.** Coyote time, jump buffering and
  asymmetric gravity are on, tuned, and invisible unless you go looking.
- **Export to one HTML file** you can put anywhere.
- **An MCP server**, so an assistant can build and edit a game with you through
  the same file format and the same validation the editor uses.

It deliberately does not include a sprite editor, an audio editor, 3D, a physics
library, node graph scripting, or accounts. It imports PNG and audio files and
gets on with being a game engine.

## Status

Phases 0, 1, 2 and most of 4 of six are complete: the project format, the
runtime that plays it, a playable example game written by hand, the command
line, and export to a single HTML file. The format came first because it is the
contract every other package agrees on.

| Phase | What                                                                 | State |
| ----- | -------------------------------------------------------------------- | ----- |
| 0     | `packages/schema`: the format, validation, migrations, JSON Schema   | done  |
| 1     | `packages/core`: fixed timestep runtime, collision, movement, events | next  |
| 2     | `examples/first-game` written by hand, plus the CLI to run it        |       |
| 3     | `packages/editor`: the visual editor                                 |       |
| 4     | Export to standalone HTML, then free movement and auto scroll        |       |
| 5     | `packages/mcp`: authoring over the Model Context Protocol            |       |

There is no editor yet, so a game is made by editing one JSON file. That part
works end to end today:

```bash
pnpm install && pnpm build

# Play the example in a browser
node packages/cli/dist/main.js run examples/first-game

# Or start your own, from a playable starting point
node packages/cli/dist/main.js new my-game --name "My game"
node packages/cli/dist/main.js run my-game

# Ship it as one HTML file with nothing else to upload
node packages/cli/dist/main.js export my-game --out my-game.html
```

See [getting started](docs/getting-started.md) for the full walkthrough.

A screenshot belongs here once there is an editor to screenshot.

## Documentation

- [Getting started](docs/getting-started.md) — make a small platformer from
  nothing, written for someone who has never made a game.
- [Concepts](docs/concepts.md) — scenes, entities, components, tiles and events
  in plain language.
- [The project format](docs/project-format.md) — the authoritative description of
  the file, with a complete annotated example.
- [Events reference](docs/events-reference.md) — every trigger, condition and
  action, with an example each.
- [Architecture](docs/architecture.md) — package boundaries and the decisions
  behind them, for contributors.
- [Contributing](CONTRIBUTING.md).

A getting started guide arrives with phase 2, when there is something to run.

## About PinStudio

PinStudio is a Swiss non profit association working on game creation, peer
learning and free software. PinForge is one of its projects and is developed in
the open.

## Licence

MIT. See [LICENSE](LICENSE).
