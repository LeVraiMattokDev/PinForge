# Changelog

Notable changes to PinForge. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html) once it has a release.

The **project file format** has its own version, `formatVersion`, which is
independent of the version of PinForge. It changes only when the shape of a
project file changes, and every change comes with a migration.

## [Unreleased]

### Added

- `@pinforge/schema`, the project format and the contract every other package
  agrees on. Project file format version 1.
  - Zod definitions for the whole format: metadata, settings, named input
    controls, global variables, assets, tilesets, entity prototypes with sprite,
    collider, movement and text components, scenes with tile layers, entity
    instances with component overrides, three camera modes, and event rules.
  - A rule vocabulary of 16 triggers, 10 conditions and 22 actions, each tagged
    with the movement modes it applies to.
  - Referential validation: a second pass over a structurally valid project that
    reports, with a path and a plain sentence, everything that points at
    something missing or impossible.
  - A migration runner with its tests, so the first breaking change to the
    format has somewhere to go.
  - JSON Schema generated from the same definitions and committed, for tools
    that cannot import TypeScript.
- `@pinforge/core`, the engine runtime: a fixed 60 Hz timestep driven by an
  accumulator, collision resolved as separate X then Y passes, platform movement
  with coyote time, jump buffering and heavier falling than rising on by
  default, one-way tiles, patrolling without event rules, three camera modes,
  the rule engine, and rendering behind a `Renderer` interface with a Canvas2D
  implementation. Twenty-nine deterministic tests.
- Free movement: both axes, no gravity, optionally locked to one axis, with an
  acceleration of 0 meaning instant. Together with the auto scrolling camera it
  is what a puzzle game or a shoot-em-up needs, and adding it changed no project
  files, which was the point of settling the format first.
- `@pinforge/cli`: `pinforge new`, `run`, `export` and `validate`, plus a
  starter project with placeholder art so a new game is playable immediately.
- Export to a single HTML file with every asset inlined as a data URI and
  nothing to fetch, running the same runtime as the editor will.
- `examples/first-game`: Coin Run, two levels written by hand in JSON, with a
  test that plays it headlessly and a test that no coin is placed out of reach.
- `@pinforge/editor`, the visual editor: a level list, the things in a level and
  the kinds of thing that exist, a tile painter with a palette, a contextual
  inspector, an event rule editor built from cascading dropdowns, an asset
  browser, project settings, and play mode running the same runtime as the
  export.
  - Undo and redo across every mutation, through a command layer written before
    the interface. A brush drag is one undo step, and a change that would break
    the game is refused with the reason rather than applied.
  - Autosave to the browser, plus explicit save and load of the game file.
  - A rule's form is generated from the Zod schema, so the vocabulary can grow
    without the editor changing.
- `@pinforge/mcp`, a Model Context Protocol server with eighteen tools covering
  opening and creating projects, reading levels, creating and changing entities,
  painting tile regions, adding and removing rules, validating and exporting.
  Tool inputs are the project's own Zod definitions, every mutation validates
  the whole project before writing anything, and every mutation answers with a
  structured diff of the paths it touched.
- Documentation: the concepts, the authoritative format reference with a complete
  annotated example, and a generated events reference.
- A pnpm workspace with TypeScript in strict mode, Vitest and continuous
  integration that fails if generated files have drifted.
- `tools/make-placeholder-art.mjs`, which writes the example's pictures and
  sounds so the repository is self contained.
- `@pinforge/script`: PinScript, every rule as a sentence you can type. One
  table of sentence templates drives parsing and printing both, so the two can
  never disagree; parsing returns line-numbered issues written for a person,
  and printing leaves defaults unsaid. The reference, docs/script.md, is
  generated from the same table.
- The Rules tab has three faces of the same rules: the dropdown sentences,
  snap-together blocks in the Scratch tradition, and PinScript text. A block is
  a PinScript sentence with a control in every slot. Dragging a block from the
  palette adds it, between blocks reorders, back to the palette removes it, and
  onto the empty space starts a new rule.
- `pinforge rules <game>`: writes every rule in a game as PinScript, grouped
  the way the editor groups them and ready to paste back in.
- Pausing, which the editor, the getting started guide and the format reference
  had all been naming as the canonical rule for the whole game while the engine
  shipped no way to do it — and while the format shipped a pause control bound
  to escape by default. `pause the game` freezes the step: nothing moves, no
  animation plays, the camera holds still, no timer runs, the clock stops, and a
  player leaning on a direction key goes nowhere. While paused the only
  triggers still heard are the player's own, which is what lets one rule start
  the game again and why no other rule needs an "if the game is not paused"
  bolted on. A rule part way through a wait carries on, so "pause, say
  something, wait, start the game again" is a cutscene anyone can write.
- Comparing one variable with another, and copying one into another:
  `if score is more than high-score` / `then copy score into high-score`.
  Deliberately two entries rather than an expression language. Before this,
  every value anywhere in the vocabulary was a fixed number, so a best score
  that survives a replay had no path at all.
- A validation issue now carries a severity. An error is refused as before; a
  warning is carried through and reported, so "legal, and almost certainly a
  mistake" has somewhere to live. The editor applies the change and says what
  is worth a look, the command line prints it under the summary, and an
  assistant working over the Model Context Protocol gets it alongside the diff.
- The first such warning: a rule that checks something about a group and then
  acts on the whole group. `IF hits-left of tag:enemy is at most 0 THEN remove
tag:enemy` reads as one enemy dying and removes every one of them, because
  the check passes when any one matches and the action runs on all of them.
- Every trigger, condition and action the engine advertises is now exercised by
  a test, so a vocabulary entry cannot ship dead again.

### Changed

- Every command function in `@pinforge/cli` returns what happened instead of
  printing it, and only the command line prints. The MCP server runs with its
  protocol on stdout, where a stray line of output breaks the connection.

### Fixed

- The placeholder spike tile bled two pixels into the neighbouring tile, so a
  sliver of a spike appeared under every wooden platform in both the editor and
  the exported game.
- A rule is skipped when an entity it is about was already removed by an earlier
  rule in the same step. Squashing an enemy no longer also costs a life, because
  the squash rule's bounce can no longer change what the "walked into an enemy"
  rule sees.
- A one-way platform no longer reports a landing while the player rises up
  through it, which was resetting coyote time and the double jump in mid air.
- A jump buffer of zero seconds no longer makes jumping impossible, and a jump
  count of zero now really means no jumps, including from the ground.
- Feeding a negative frame time into the runtime no longer stalls the
  simulation until the lost time is paid back.
- Clicking maps back through the camera shake, so what is under the pointer on
  a shaking screen is what is hit.
- A repeating timer far below one step fires once per step instead of freezing
  the game counting millions of owed firings.
- Picking "A property is" (or any dropdown choice whose starting point could
  not be filled in) threw inside the editor instead of doing anything; starting
  points are now checked and the refusal is explained in words.
- "When something is removed" never fired. Not once, ever, though it was
  documented, offered in the editor's dropdowns and in the blocks palette, and
  had a PinScript sentence: the guard that skips a rule about a removed entity
  was skipping every one of its firings.
- A removed entity silently stopped being a place. "Remove the enemy, then drop
  a coin where it was" dropped the coin at the top left corner of the level,
  and writing the same two actions the other way round worked, so the order of
  two lines quietly decided whether the game was right.
- An anchor that pointed at nothing also fell back to the top left of the
  level, so a rule meant to drop treasure beside the boss dropped it in the
  corner. Naming nothing still means the corner; naming something absent now
  does nothing.
- "When two things stop touching" never fired if one of them had been removed,
  so the ordinary pair of rules that tracks "am I standing in the fire" stayed
  stuck on yes for the rest of the game.
- "Turn off the rule" was forgotten whenever the level restarted or changed. A
  rule's off switch now lives where the rule lives: one for the whole game
  stays off across levels, while a level's own comes back with the level.
- Leaving the level fired on every step spent outside it, so "when the player
  falls out of the level, lose a life" spent three lives in the first fiftieth
  of a second and kept going. It is an event now, not a place you are.
- A wait was thrown away, without a word, by any change of level from any rule,
  so the shape the documentation itself teaches for losing a game silently did
  nothing whenever something else changed the level inside that pause.
