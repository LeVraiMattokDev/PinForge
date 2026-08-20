# Architecture

Written for someone about to change PinForge rather than use it. It covers where
the code lives, and the decisions everything else follows from. Where a decision
concerns a package that does not exist yet, it is marked as a commitment: the
format was designed around it, so changing it later is expensive.

## Packages

```
schema  <-  core  <-  cli
   ^         ^
   |         |
   +--  editor, mcp
```

| Package  | What it is                                                               | Depends on       |
| -------- | ------------------------------------------------------------------------ | ---------------- |
| `schema` | The project format: Zod definitions, validation, migrations, JSON Schema | nothing internal |
| `core`   | The engine runtime. No React, no DOM beyond the `Renderer` interface     | `schema`         |
| `editor` | The React editor application                                             | `schema`, `core` |
| `cli`    | `pinforge new / run / export / validate`                                 | `schema`, `core` |
| `mcp`    | Project authoring over the Model Context Protocol                        | `schema`, `core` |

`core` never imports from `editor`. That is not tidiness: the editor's play mode
runs `core` directly, and the exported HTML runs the same `core` with a different
host. The moment runtime behaviour can reach into editor code, the game in the
editor and the game you shipped stop being the same game, and every bug report
becomes "does it also happen in the export".

There is one runtime. There will never be a second implementation of anything the
player can see.

## Schema first

The format is the contract between every package, so it was built first and its
shape settled before any code depended on it.

Everything that describes the format comes out of one set of Zod definitions:
the TypeScript types, the structural validation, the JSON Schema in
`packages/schema/schema/`, and the plain language labels in the rule catalog. A
second description of the same thing is a second thing to keep in sync, and it
always loses.

### Two validation passes

`parseProject` checks structure: types, required fields, ranges, unknown keys.
`validateProject` checks meaning: whether the scene the game starts on exists,
whether a tile character is in the legend, whether a rule asks a coin if it is
standing on the ground. Zod cannot see any of the second kind, because each of
those checks needs the rest of the document.

The second pass returns a list instead of throwing. The editor shows ten problems
at once, and the MCP server refuses a mutation with all of the reasons rather
than the first one. Every problem carries a path into the document, a stable code
for tools, and a sentence written for a person.

### Unknown keys are rejected

A hand written file with `colour` instead of `color` gets an error naming the
field. The alternative, ignoring what it does not recognise, turns a typo into a
setting that silently does nothing.

### Defaults are applied on load

Anything with a default may be left out of the file. This is what keeps a hand
written project short and an LLM authored one plausible, while the runtime always
receives a complete project and never has to ask whether a field is missing.

The cost is that the type of a file on disk and the type of a loaded project are
not the same. Both are exported: `ProjectInput` and `Project`. The JSON Schema is
generated from the input side, because that is what a validator should accept.

### Migrations exist before there is anything to migrate

The chain is empty: version 1 is the first format. The runner, its error messages
and its tests are written anyway, because the day a migration is needed is the
worst possible day to discover the runner does not work. The runner, not the
migration, writes the new `formatVersion`, so a migration cannot forget to.

## Decisions about the format

**One file per game.** Scenes live inside `game.pinforge.json` rather than in
separate files. The browser editor saves one file, migrations run over one
document, and an MCP mutation diffs one document. The cost is a large file for a
large project, and two people cannot edit different levels without conflicting.
With no collaboration in scope, that cost is worth the simplicity.

**Tile layers are pictures.** A legend from characters to tile numbers, then one
string per row. A grid of numbers stores the same thing and cannot be read by a
person or reasoned about by an assistant. The cost is a cap of 94 distinct tiles
per layer, since a legend key is one printable character; extra layers are free.

**Ids are slugs and references are strings.** `$self`, `$other`, `tag:enemy`, an
instance id, or a prototype id, resolved in that order. One string in the file,
one dropdown in the editor. Validation refuses a project where an instance id
shadows a prototype id, so the order never has to be explained.

**Tile behaviour comes from tags.** `solid`, `one-way` and `hazard` are understood
by the runtime; any other tag is free form and only rules react to it. No
behaviour is ever attached to a tile number.

**Rules are data.** Nothing is compiled into code. It is what lets the editor,
the runtime and the MCP server agree on what a game does, and it is why the
event system is dropdowns rather than a node graph: a sentence you assemble is
readable by someone who has never programmed, and a graph is not.

**The catalog lives next to the schema.** Labels, summaries, examples and the
movement modes each rule applies to are one list. The editor builds dropdowns
from it, `docs/events-reference.md` is generated from it, validation uses its
`modes` to refuse a rule about the ground for an entity that has no gravity, and
the tests check that it matches the schema in both directions. Four consumers,
one list, no drift.

## Two front ends, one set of operations

`cli` owns the file facing operations: open and validate a project, scaffold a
new one, inline its assets, build the exported page. `mcp` calls into those
rather than repeating them, which is why the MCP server has no private side
channel: it exports through the same exporter and validates through the same
validator, so the two cannot drift apart.

That makes every command function in `cli` a library function that returns what
happened rather than printing it. The MCP server runs with the protocol on
stdout, where one friendly line of output ends the conversation, and a test in
`cli` asserts that the commands stay quiet.

The MCP tool inputs are the project's own Zod definitions rather than a parallel
description of them, so the JSON Schema a client sees is generated from the same
place the editor validates against. A mutation edits the file's own text, checks
the whole project, and only then writes: an assistant cannot leave a project half
changed, and a game it touches keeps the shape a person wrote instead of
acquiring every default.

## The runtime

`packages/core` implements all of this. The format was designed around it.

### Fixed timestep, 60 Hz

The simulation advances in fixed steps of exactly 1/60 of a second, driven by an
accumulator that is separate from render frames. Rendering may interpolate
between the last two simulation states.

Variable frame time must never reach physics. If it does, the same input produces
a different result on a different machine, a slow frame teleports the player
through a wall, and none of it can be tested: a deterministic simulation test is
only possible because the step size is a constant. This is also what makes "every
movement bug becomes a test before it is fixed" a workable rule rather than an
aspiration.

### Collision resolves X first, then Y

Collision is axis aligned boxes only, and resolution is two separate passes: move
on X and push out of anything hit, then move on Y and push out of anything hit.

Resolving both axes at once, or picking an axis by which overlap is smaller,
produces the classic bugs: catching on the seam between two floor tiles while
running, or being pushed sideways off a ledge when landing on its corner. The two
pass order is not an optimisation to be tidied away later. It is load bearing,
and it is documented in the code as well as here.

Boxes never rotate. No polygons, no external physics library. A box that cannot
rotate is a box whose collision a beginner can predict, which matters more here
than expressiveness.

### One movement component, two modes

The movement component is the only real difference between 2D genres, which is
why there is one runtime and not one per genre.

`platform` has gravity, ground detection and jumping. It ships with coyote time,
jump buffering and asymmetric gravity on by default and tuned, because those
three details are the difference between a game that feels broken and one that
feels good, and the target user must get them without knowing they exist. A jump
is authored as a height in pixels; the runtime derives the impulse.

`free` moves on both axes with no gravity: a puzzle game with no acceleration, a
shoot-em-up with an auto scrolling camera. It was defined in the format from
version 1 and implemented later, and adding it changed no project files, which
is the whole argument for settling the format first.

A third genre should be a third mode of this component, or a new field on it.
A second runtime is the wrong answer.

### Rendering behind an interface

Canvas2D first, behind a `Renderer` interface, so a WebGL backend can replace it
without game logic changing. Game logic never touches a canvas, an image or an
audio element directly: everything that knows about the DOM is in `canvas2d.ts`
and `browser.ts`, and nothing in the simulation imports either.

Rendering may interpolate between the last two simulation states, which is why
an entity remembers where it was. Nothing in the render pass writes back.

### Rules run in the order they are written

A step gathers what happened first (collisions started and ended, landings,
jumps, tile overlaps, entities leaving the scene, clicks), then walks the
scene's rules followed by the project's global rules, in file order. That makes
the outcome of two rules that touch the same variable predictable from reading
the file, top to bottom.

Three signals are deliberately one step old: entities spawned, entities
destroyed, and variables changed. A rule that reacts to a variable changing
would otherwise be able to trigger itself, and the loop has no natural end.

`wait` parks the rest of a rule's action list without pausing the game, which is
what makes "show a message, wait, load the next level" a sentence rather than a
state machine.

A firing is skipped when one of the entities it is about has already been
removed by an earlier rule in the same step. This is not a special case; it is
what makes the most common pair of rules in any platformer work. One rule
squashes an enemy when the player lands on it, the next takes a life when the
player walks into one, and both watch the same collision. Without the skip, the
first rule's bounce would change what "is falling" answers for the second, so
squashing an enemy would also hurt you. There is a test named after exactly
that.

## The editor

Every change to a project goes through a command: a pure function from one
project to the next, with a label in the user's own words. Undo is then simply
the previous project. Because the updates share everything they do not change,
keeping two hundred of them costs almost nothing, and there is no separate apply
and revert pair to get out of step.

Commands existed before any interface did, deliberately. Retrofitting undo is a
rewrite, and the first mutation written without it is the moment that becomes
inevitable.

Two details carry more weight than they look:

- A command carries a merge key. Consecutive commands with the same key collapse
  into one step, so dragging a brush across twenty tiles is one undo, not twenty.
- Every command's result is validated before it is accepted. A change that would
  leave the project broken is refused with the reason, and nothing moves. The
  editor therefore cannot produce a project the runtime would refuse, which is
  the same guarantee the MCP server gives.

Play mode runs `@pinforge/core` on the project in memory, so what is played is
what ships. It starts on the level being edited rather than the one the game
starts on, because that is the level being worked on.

The design time view of a level is not the runtime. It draws the level as it is
written rather than as it is played: no parallax offset, a grid, and a labelled
box wherever a picture is missing so everything stays visible and selectable.
That is a drawing of the data, not a second simulation, and it is the only place
in the project where anything a player would recognise is drawn outside core.

A rule's form is worked out from the Zod schema. The editor holds the words a
person reads and which list a field's options come from; the fields themselves,
their types and their allowed values come from the schema. An action added to the
format gets a working form with no editor change, and a test compares the two in
both directions.

## Testing

Runtime simulation tests are deterministic: a starting state, a scripted input
sequence, and an assertion about the exact state after N fixed steps. They are
the regression net for everything about movement and collision.

The format has golden files. A project file goes in, the fully loaded result is
committed. Change a default value and the diff appears in a place where somebody
has to look at it and agree.

Documentation is tested where it can be. The complete example in
`docs/project-format.md` is extracted, stripped of comments and loaded by the
test suite on every run, so it cannot drift from what the code accepts.
