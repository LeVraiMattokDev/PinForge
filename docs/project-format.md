# The project format

A PinForge game is one JSON file, named `game.pinforge.json`, sitting next to a
folder of images and sounds. Everything the game is lives in that file: its
settings, its levels, the things in them and the rules that make them behave.
There is no second format and no hidden state. The editor writes this file, the
runtime reads it, the exporter inlines its assets into an HTML page, and the MCP
server edits it through the same validation the editor uses.

This page is the authoritative description of the format. The machine readable
version is generated from the same definitions and lives at
[`packages/schema/schema/pinforge-project.schema.json`](../packages/schema/schema/pinforge-project.schema.json).

## Conventions

These hold everywhere, so they are stated once.

- **Units.** Distances are pixels, time is seconds, speed is pixels per second,
  acceleration is pixels per second squared.
- **Axes.** The Y axis points down. `y: 0` is the top of the scene. This matches
  both the canvas and the tile grid, so nothing is ever flipped.
- **Position.** An entity's `x` and `y` are the top left corner of its collision
  box. Art is aligned to that box with the sprite's `offset`, so a drawing may
  overhang the box it collides with.
- **Ids and names.** An `id` is lowercase letters, numbers and dashes, and is
  what rules, the editor and the MCP server refer to. A `name` is a label for
  people to read and can be anything.
- **Defaults.** Anything with a default may be left out of the file. Opening a
  project fills them in, so a hand written file stays short and the runtime
  always sees a complete project.
- **Unknown keys are errors.** A misspelled `colour` is reported with its
  location rather than silently ignored.

## The top level

| Field | Required | What it is |
| --- | --- | --- |
| `formatVersion` | yes | The version of this format the file was written in. Currently `1`. |
| `meta` | yes | Name, author, description and timestamps. |
| `settings` | yes | Which scene the game starts on, the resolution, the controls. |
| `variables` | no | Global variables such as score and lives. |
| `assets` | no | Every image and sound the game uses. |
| `tilesets` | no | How tile images are sliced up, and what each tile means. |
| `entities` | no | Entity prototypes: the kinds of thing that can exist. |
| `globalEvents` | no | Rules that run in every scene. |
| `scenes` | yes, at least one | The levels. |

## settings

```json
{
  "startScene": "level-1",
  "viewport": { "width": 320, "height": 180, "scaleMode": "integer" },
  "pixelArt": true,
  "backgroundColor": "#10141c",
  "input": { "jump": ["Space", "ArrowUp"] }
}
```

The game renders at exactly `viewport` size and is then scaled up to the window.
`integer` scaling only ever multiplies by a whole number, which keeps pixel art
crisp; `fit` allows any scale and adds bars; `stretch` ignores the window shape.

`input` names the controls. Rules and movement components talk about `"jump"`,
never about `"Space"`, so rebinding a key is a settings change and the editor can
say "when Jump is pressed". The values are
[`KeyboardEvent.code`](https://developer.mozilla.org/docs/Web/API/UI_Events/Keyboard_event_code_values)
strings.

## variables

A global variable is a number, a true or false value, or a line of text, with a
starting value.

```json
{ "id": "score", "name": "Score", "type": "number", "initial": 0 }
```

The type and the starting value are checked together, so `"type": "number"` with
`"initial": "hello"` is an error rather than a surprise later. Per entity state
lives in an entity's `properties`, which use exactly the same shape.

## assets

One flat list, each entry an image or a sound.

```json
[
  { "id": "hero", "kind": "image", "source": "assets/hero.png" },
  { "id": "sfx-coin", "kind": "sound", "source": "assets/coin.wav", "volume": 0.8 }
]
```

`source` takes three forms, and every tool understands all of them:

- `assets/hero.png` — a path relative to the project file.
- `data:image/png;base64,...` — the bytes inlined. The browser editor writes this
  because it has no filesystem, and the HTML export inlines every asset this way.
  Export is therefore a transformation of this format, not a second format.
- `builtin:grass` — an asset from the starter pack shipped with PinForge.

## tilesets

A tileset slices one image into a numbered grid, counting from 0, left to right
then top to bottom.

```json
{
  "id": "grass",
  "image": "tiles-grass",
  "tileWidth": 16,
  "tileHeight": 16,
  "tiles": [
    { "index": 0, "name": "Ground", "tags": ["solid"] },
    { "index": 8, "name": "Spikes", "tags": ["hazard"] }
  ]
}
```

Only tiles that need a name or a tag are listed; everything else in the image is
plain decoration.

**Tile behaviour comes from tags, never from a tile number.** The runtime knows
three: `solid` stops things, `one-way` can be jumped through from below, `hazard`
is reported to rules. Any other tag is free form and exists so a project can
invent `ice` or `water` and react to it with a rule, without the engine changing.

## entities

An entity prototype is the definition of a kind of thing. A scene places copies
of it, and editing the prototype changes every copy.

```json
{
  "id": "player",
  "name": "Player",
  "size": { "width": 12, "height": 16 },
  "tags": ["player"],
  "properties": [{ "id": "hits-left", "type": "number", "initial": 3 }],
  "components": {}
}
```

`size` is the collision box. Boxes are always axis aligned and never rotate,
which is what keeps collision predictable and fast.

### Components

An entity carries at most one of each. There are four, and the set is small on
purpose.

**`sprite`** draws it: an `image`, the size of one frame in that image, an
`offset` from the collision box, and a list of `animations` naming frame numbers
and a speed. `flipToFaceMovement` mirrors the art when moving left so only one
direction has to be drawn.

**`collider`** decides how it touches things. `solid` is pushed back out of solid
tiles, `trigger` passes through tiles and only reports overlaps to rules, `none`
never collides at all. `collidesWithTiles` turns tile collision on or off
separately.

Entities never push each other apart, whatever their collider says. Two of them
are always free to overlap, and that overlap is exactly what a rule about two
things touching is for. Anything that has to physically block the player — a
wall, a closed door, a crate you cannot walk through — belongs in a tile layer,
where `set-tile` can open it again later.

**`movement`** is the only real difference between 2D genres, and the reason
there is one runtime rather than one per genre. It has two modes.

`platform` has gravity, ground detection and jumping:

```json
{
  "mode": "platform",
  "controlledBy": "player",
  "maxSpeed": 90,
  "acceleration": 600,
  "deceleration": 900,
  "airControl": 0.7,
  "gravity": 900,
  "fallGravityMultiplier": 1.7,
  "maxFallSpeed": 320,
  "jumpHeight": 44,
  "jumpCount": 1,
  "variableJumpHeight": true,
  "coyoteTime": 0.1,
  "jumpBufferTime": 0.12
}
```

Three of those fields are why a jump feels solid rather than broken, and they are
on by default with working values so that nobody has to know they exist:
`fallGravityMultiplier` makes falling faster than rising, `coyoteTime` still
allows a jump just after walking off a ledge, and `jumpBufferTime` remembers a
jump pressed just before landing.

A jump is authored as a height in pixels, not as an impulse. "Clear three tiles"
is a thought a beginner can have; "start at minus 280 pixels per second" is not.
The runtime works out the impulse from the height and the gravity.

`controlledBy` is `player`, meaning the entity reads the named controls itself, or
`rules`, meaning only event rules move it. There is no third option and no
scripting. An optional `patrol` block makes an entity walk back and forth on its
own, turning at walls and at ledges, which is what most simple enemies need.

`free` moves on both axes with no gravity, and is what a puzzle game, a top down
game or a shoot-em-up uses. It has `maxSpeed`, `acceleration`, `deceleration`,
`controlledBy` and `axes`, which locks it to `horizontal` or `vertical` movement.
An acceleration of 0 means instant, which is what a grid puzzle wants.

**`text`** draws a line of text instead of a sprite, in a built in font.
`{score}` inside `content` is replaced by the value of that variable, which is
how a score gets on screen. An entity has a sprite or text, not both.

## scenes

A scene is one level.

```json
{
  "id": "level-1",
  "tileSize": 16,
  "size": { "columns": 32, "rows": 10 },
  "background": { "color": "#10141c" },
  "layers": [],
  "entities": [],
  "camera": { "mode": "fixed" },
  "events": []
}
```

`tileSize` applies to the whole scene, so there is one number to think about
rather than one per layer, and a tileset built on a different grid cannot be used
here. `size` is in tiles.

### Tile layers

A tile layer is a picture you can read. `legend` says what each character means,
and `rows` is the level itself, one string per row.

```json
{
  "id": "ground",
  "tileset": "grass",
  "collides": true,
  "legend": { ".": null, "#": 0, "^": 8 },
  "rows": ["........", "..^^....", "########"]
}
```

`null` in the legend means an empty cell. Every row must be exactly as long as
the scene is wide, and there must be exactly as many rows as the scene is tall.

A grid of numbers would store the same thing, and nobody could read it. That
matters because levels are written by hand in the examples and by an assistant
over MCP. The cost is that a legend key is a single printable character, so one
layer holds at most 94 distinct tiles; extra layers are free.

Layers are drawn in the order they are listed. `drawEntitiesAfter` marks the
layer that entities are drawn on top of, so anything listed after it appears in
front of them. `parallax` scrolls a layer slower than the world for a cheap sense
of depth, and `collides` decides whether its solid tiles stop anything.

### Entity instances

```json
{
  "id": "slime-1",
  "prototype": "slime",
  "x": 200,
  "y": 132,
  "overrides": { "movement": { "maxSpeed": 16 } }
}
```

`overrides` is a patch over the prototype's components, so one slower slime does
not need a second prototype. Only the fields written are changed. An override
cannot change a movement `mode`, and a field belonging to the other mode is an
error.

`properties` sets this copy's starting values for the properties its prototype
declares. `fixedToCamera` keeps it still on screen instead of scrolling with the
level, which is what a score label needs. `tags` adds tags to this copy only.

### Camera

Three modes, all with optional `clampToScene` so the view never leaves the level.

- `follow` tracks an entity. `deadZone` is a box in the middle of the screen the
  target can move inside without the camera moving at all, which is what stops
  the picture wobbling on every step. `smoothing` is how gently it catches up.
- `fixed` sits at one position.
- `auto-scroll` moves at a constant speed, for a shoot-em-up.

### Events

Rules are data in the scene, not generated code, which is what lets the editor,
the runtime and the MCP server all agree on what a game does. Each one reads as a
sentence:

```json
{
  "id": "collect-coin",
  "name": "Collect a coin",
  "when": { "type": "collides", "subject": "player", "with": "coin" },
  "if": [],
  "then": [
    { "type": "change-variable", "variable": "score", "operator": "add", "value": 1 },
    { "type": "destroy", "target": "$other" }
  ]
}
```

`if` is joined by "and"; an empty list means always. `then` runs in order.
`enabled` turns a rule off without deleting it, and `once` runs it at most once
per scene.

Entities are pointed at with one string:

| Written | Means |
| --- | --- |
| `$self` | The entity the trigger fired on. |
| `$other` | The other entity in a collision. |
| `tag:enemy` | Anything carrying that tag. |
| `player-1` | That copy, in this scene. |
| `coin` | Any entity of that kind. |

A copy is looked up before a kind, and a project where a copy's id is also the
name of a kind is refused, so the order can never surprise anyone. Using `$other`
in a rule that is not about two things touching is an error, as is `$self` in a
rule that is not about one entity.

Rules that put in `globalEvents` at the top level run in every scene, which is
where pause and game over belong rather than copied into each level.

Every trigger, condition and action is listed in
[the events reference](events-reference.md).

## Format versions and migrations

Every file carries `formatVersion`. `packages/schema` owns a chain of migrations
keyed on it, so a project written today still opens in a much later version. The
chain is empty right now, because version 1 is the first format, but the runner
and its tests exist already: the day a migration is needed is the worst day to
find out the runner does not work.

Opening a file runs migrations first, then structure, then meaning. A file from a
newer PinForge is refused with a message saying so rather than half read.

## How a file is checked

Two passes, kept apart on purpose.

**Structure** is types, required fields, ranges and unknown keys. It is generated
from the same definitions as the JSON Schema, and it fails on the first
impossible document with a list of what is wrong and where.

**Meaning** is everything that needs the rest of the file: does the scene the
game starts on exist, is that character in the legend, does that rule ask a coin
whether it is standing on the ground. This pass returns a list rather than
throwing, so the editor can show ten problems at once and the MCP server can
refuse a change with all of the reasons instead of the first one. Each problem
has a path into the document, a stable code and a sentence written for a person:

```
/scenes/0/layers/0/rows/1: Row 1 of the layer "ground" is 3 characters long, but this level is 4 tiles wide.
```

## A complete game

This is a real project file: a player, three coins, a patrolling slime, spikes, a
flag, a score and a win condition. Comments are for this page only; the format is
plain JSON. The same file without comments is
[`packages/schema/test/golden/coin-run.json`](../packages/schema/test/golden/coin-run.json),
and the test suite loads the example below on every run so it cannot drift from
what the code accepts.

```jsonc
{
  // Bumped only when the format changes shape. packages/schema owns a migration
  // chain keyed on this number, so a file written today opens in two years.
  "formatVersion": 1,

  "meta": {
    "name": "Coin Run",
    "author": "PinStudio",
    "description": "A tiny platformer used to validate the project format.",
    "created": "2026-08-20T10:00:00Z",
    "modified": "2026-08-20T10:00:00Z"
  },

  "settings": {
    "startScene": "level-1",

    // The game renders at exactly this resolution, then scales up to fit the
    // window. "integer" only ever scales by 1x, 2x, 3x... which keeps pixel art
    // crisp. "fit" allows fractional scaling with letterboxing. "stretch" ignores
    // the aspect ratio.
    "viewport": { "width": 320, "height": 180, "scaleMode": "integer" },

    // Nearest neighbour sampling. Turn off for smooth, hand drawn art.
    "pixelArt": true,

    "backgroundColor": "#10141c",

    // Named actions, not raw keys. Every rule and every movement component talks
    // about "jump", never about "Space". Rebinding is then a settings change and
    // the editor can show "when Jump is pressed" instead of a key code.
    // Values are KeyboardEvent.code strings.
    "input": {
      "left": ["ArrowLeft", "KeyA"],
      "right": ["ArrowRight", "KeyD"],
      "up": ["ArrowUp", "KeyW"],
      "down": ["ArrowDown", "KeyS"],
      "jump": ["Space", "ArrowUp", "KeyW"],
      "action": ["KeyE", "Enter"],
      "pause": ["Escape"]
    }
  },

  // Global variables. Anything the whole game needs to remember: score, lives,
  // whether a key was found. Per entity state lives in entity `properties` instead.
  "variables": [
    { "id": "score", "name": "Score", "type": "number", "initial": 0 },
    { "id": "lives", "name": "Lives", "type": "number", "initial": 3 }
  ],

  // Flat list, discriminated by `kind`. `source` is either a path relative to this
  // file, or a data: URI. The browser editor has no filesystem, so anything the
  // user drops onto it is stored inline as a data URI; the CLI and hand authored
  // projects use paths. The HTML export inlines everything as data URIs, which
  // means export is a transformation of this same field and not a separate format.
  "assets": [
    { "id": "tiles-grass", "kind": "image", "source": "assets/tiles-grass.png" },
    { "id": "player-sheet", "kind": "image", "source": "assets/player.png" },
    { "id": "coin-sheet", "kind": "image", "source": "assets/coin.png" },
    { "id": "slime-sheet", "kind": "image", "source": "assets/slime.png" },
    { "id": "flag-sheet", "kind": "image", "source": "assets/flag.png" },
    { "id": "sfx-jump", "kind": "sound", "source": "assets/jump.wav" },
    { "id": "sfx-coin", "kind": "sound", "source": "assets/coin.wav" }
  ],

  // A tileset slices one image into a grid of numbered tiles, left to right then
  // top to bottom starting at 0. Tags are what the runtime and the rules react to:
  // no tile behaviour is hardcoded to a tile number.
  // Engine understood tags: "solid", "one-way", "hazard". Any other tag is free
  // form and can be used by rules, e.g. "ice" or "water".
  "tilesets": [
    {
      "id": "grass",
      "name": "Grass",
      "image": "tiles-grass",
      "tileWidth": 16,
      "tileHeight": 16,
      "margin": 0,
      "spacing": 0,
      // Only tiles that need a name or a tag are listed. Everything else in the
      // image is a plain decorative tile.
      "tiles": [
        { "index": 0, "name": "Ground", "tags": ["solid"] },
        { "index": 3, "name": "Wooden platform", "tags": ["one-way"] },
        { "index": 8, "name": "Spikes", "tags": ["hazard"] },
        { "index": 12, "name": "Cloud", "tags": [] }
      ]
    }
  ],

  // Entity prototypes. A prototype is the definition of a kind of thing; a scene
  // places instances of it. Editing the prototype changes every coin in the game.
  "entities": [
    {
      "id": "player",
      "name": "Player",
      // The collision box. AABB only, never rotated. Also the box the sprite is
      // positioned against.
      "size": { "width": 12, "height": 16 },
      "tags": ["player"],
      // Custom per entity state, editable in the inspector, readable by rules.
      "properties": [
        // countsDown makes the engine run it down to zero by itself, so setting
        // it to 1 means "for the next second". This is how being hurt gives a
        // moment of grace before it can happen again.
        {
          "id": "invulnerable-for",
          "name": "Invulnerable for",
          "type": "number",
          "initial": 0,
          "countsDown": true
        }
      ],
      // A small, fixed set of components. Each may appear at most once.
      // Available: sprite, collider, movement, text.
      "components": {
        "sprite": {
          "image": "player-sheet",
          "frameWidth": 16,
          "frameHeight": 16,
          // Where the sprite sits relative to the top left of the collision box.
          "offset": { "x": -2, "y": 0 },
          // Mirror the art when moving left. Saves authoring a second animation.
          "flipToFaceMovement": true,
          "defaultAnimation": "idle",
          "animations": [
            { "id": "idle", "name": "Idle", "frames": [0, 1], "fps": 4, "loop": true },
            { "id": "run", "name": "Run", "frames": [2, 3, 4, 5], "fps": 12, "loop": true },
            { "id": "jump", "name": "Jump", "frames": [6], "fps": 1, "loop": false }
          ]
        },
        "collider": {
          // "solid"   - collides with tiles and pushes out of them
          // "trigger" - passes through everything, only reports overlaps to rules
          // "none"    - no collision at all, decoration
          "kind": "solid",
          "collidesWithTiles": true
        },
        "movement": {
          // The one component that differs between genres. Two modes only.
          // "platform" is implemented first; "free" is reserved for phase 4 and is
          // in the schema now so the format does not change when it lands.
          "mode": "platform",

          // "player" means this entity reads the input actions above directly.
          // "rules" means only event rules move it. There is no third option and
          // no scripting.
          "controlledBy": "player",

          "maxSpeed": 90,
          "acceleration": 600,
          "deceleration": 900,
          // How much of the acceleration applies while airborne, 0 to 1.
          "airControl": 0.7,

          "gravity": 900,
          // Falling is faster than rising. This is the single biggest reason a
          // platformer feels good rather than floaty, so it is on by default.
          "fallGravityMultiplier": 1.7,
          "maxFallSpeed": 320,

          // Jump is authored as a HEIGHT IN PIXELS, not an impulse. "I want to
          // clear three tiles" is a thought a beginner can have; "I want an
          // initial velocity of -280 px/s" is not. The runtime derives the
          // impulse from jumpHeight and gravity.
          "jumpHeight": 44,
          "jumpCount": 1,
          // Releasing the button early cuts the jump short.
          "variableJumpHeight": true,
          // Jump still works for this long after walking off a ledge.
          "coyoteTime": 0.1,
          // A jump pressed this long before landing still fires on landing.
          "jumpBufferTime": 0.12
        }
      }
    },

    {
      "id": "coin",
      "name": "Coin",
      "size": { "width": 8, "height": 8 },
      "tags": ["pickup"],
      "properties": [],
      "components": {
        "sprite": {
          "image": "coin-sheet",
          "frameWidth": 8,
          "frameHeight": 8,
          "offset": { "x": 0, "y": 0 },
          "flipToFaceMovement": false,
          "defaultAnimation": "spin",
          "animations": [
            { "id": "spin", "name": "Spin", "frames": [0, 1, 2, 3], "fps": 8, "loop": true }
          ]
        },
        "collider": { "kind": "trigger", "collidesWithTiles": false }
      }
    },

    {
      "id": "slime",
      "name": "Slime",
      "size": { "width": 14, "height": 12 },
      "tags": ["enemy"],
      "properties": [],
      "components": {
        "sprite": {
          "image": "slime-sheet",
          "frameWidth": 16,
          "frameHeight": 16,
          "offset": { "x": -1, "y": -4 },
          "flipToFaceMovement": true,
          "defaultAnimation": "walk",
          "animations": [
            { "id": "walk", "name": "Walk", "frames": [0, 1], "fps": 6, "loop": true }
          ]
        },
        "collider": { "kind": "solid", "collidesWithTiles": true },
        "movement": {
          "mode": "platform",
          "controlledBy": "rules",
          "maxSpeed": 24,
          "acceleration": 400,
          "deceleration": 400,
          "airControl": 1,
          "gravity": 900,
          "fallGravityMultiplier": 1.7,
          "maxFallSpeed": 320,
          "jumpHeight": 0,
          "jumpCount": 0,
          "variableJumpHeight": false,
          "coyoteTime": 0,
          "jumpBufferTime": 0,
          // Walks by itself. Without this, every patrolling enemy would need two
          // event rules and a wall detection trigger.
          "patrol": { "direction": "left", "turnAtWalls": true, "turnAtLedges": true }
        }
      }
    },

    {
      "id": "flag",
      "name": "Flag",
      "size": { "width": 12, "height": 24 },
      "tags": ["goal"],
      "properties": [],
      "components": {
        "sprite": {
          "image": "flag-sheet",
          "frameWidth": 16,
          "frameHeight": 24,
          "offset": { "x": -2, "y": 0 },
          "flipToFaceMovement": false,
          "defaultAnimation": "wave",
          "animations": [
            { "id": "wave", "name": "Wave", "frames": [0, 1], "fps": 4, "loop": true }
          ]
        },
        "collider": { "kind": "trigger", "collidesWithTiles": false }
      }
    },

    {
      "id": "score-label",
      "name": "Score label",
      "size": { "width": 80, "height": 10 },
      "tags": ["hud"],
      "properties": [],
      "components": {
        // Minimal text component: a built in bitmap font, one line, no styling
        // beyond colour and alignment. {score} is replaced by the variable value.
        // Without this there is no way to show a score, and a game whose score is
        // invisible fails the 30 minute test.
        "text": {
          "content": "Score: {score}",
          "color": "#ffffff",
          "align": "left",
          "size": "normal"
        }
      }
    }
  ],

  // Rules that run in every scene. Handy for things like pause and restart, which
  // would otherwise be copy pasted into each level.
  "globalEvents": [
    {
      "id": "restart-when-out-of-lives",
      "name": "Game over when out of lives",
      "when": { "type": "variable-changes", "variable": "lives" },
      "if": [{ "type": "variable-is", "variable": "lives", "operator": "at-most", "value": 0 }],
      "then": [
        { "type": "show-message", "text": "Game over", "seconds": 2 },
        { "type": "set-variable", "variable": "lives", "value": 3 },
        { "type": "set-variable", "variable": "score", "value": 0 },
        { "type": "go-to-scene", "scene": "level-1" }
      ]
    }
  ],

  "scenes": [
    {
      "id": "level-1",
      "name": "Level 1",

      // One tile size per scene. Every layer in the scene uses it, and a tileset
      // whose tiles are a different size cannot be used here. One number to think
      // about instead of one per layer.
      "tileSize": 16,
      "size": { "columns": 32, "rows": 10 },

      "background": { "color": "#10141c" },

      // Tile layers are drawn in order, first to last. Entities are drawn between
      // the layers whose `drawEntitiesAfter` is true and the ones after it.
      "layers": [
        {
          "id": "sky",
          "name": "Sky",
          "tileset": "grass",
          // No collision: purely decorative.
          "collides": false,
          // Scrolls at half the camera speed for a cheap depth effect.
          // 1 means "moves with the world".
          "parallax": { "x": 0.5, "y": 1 },
          "drawEntitiesAfter": false,

          // A tile layer is a picture you can read. `legend` maps one character to
          // one tile index in the layer's tileset; `null` means empty. Every row
          // string must be exactly `columns` characters long, and there must be
          // exactly `rows` of them.
          //
          // A legend key is one printable character, so a single layer holds at
          // most 94 distinct tiles. Extra layers are free.
          "legend": { ".": null, "c": 12 },
          "rows": [
            "................................",
            "..c...................c.........",
            "................................",
            "................................",
            "................................",
            "................................",
            "................................",
            "................................",
            "................................",
            "................................"
          ]
        },
        {
          "id": "ground",
          "name": "Ground",
          "tileset": "grass",
          "collides": true,
          "parallax": { "x": 1, "y": 1 },
          "drawEntitiesAfter": true,
          "legend": { ".": null, "#": 0, "=": 3, "^": 8 },
          "rows": [
            "................................",
            "................................",
            "........===.....................",
            "................................",
            "....................====........",
            "................................",
            "...........................====.",
            "................................",
            "...........^^...................",
            "################################"
          ]
        }
      ],

      // Instances. `prototype` says what it is, x and y say where. `overrides` is a
      // partial patch over the prototype's components, so one slow slime does not
      // need a second prototype.
      "entities": [
        { "id": "player-1", "prototype": "player", "x": 24, "y": 112 },
        { "id": "coin-1", "prototype": "coin", "x": 132, "y": 20 },
        { "id": "coin-2", "prototype": "coin", "x": 324, "y": 52 },
        { "id": "coin-3", "prototype": "coin", "x": 436, "y": 84 },
        {
          "id": "slime-1",
          "prototype": "slime",
          "x": 200,
          "y": 132,
          "overrides": { "movement": { "maxSpeed": 16 } }
        },
        { "id": "flag-1", "prototype": "flag", "x": 470, "y": 120 },
        {
          "id": "hud-score",
          "prototype": "score-label",
          "x": 8,
          "y": 8,
          // Stays put on screen instead of scrolling with the level.
          "fixedToCamera": true
        }
      ],

      "camera": {
        // "follow" | "fixed" | "auto-scroll"
        "mode": "follow",
        "target": "player-1",
        // The camera does not move while the target stays inside this box in the
        // middle of the screen. Stops the picture wobbling on every small step.
        "deadZone": { "width": 64, "height": 40 },
        // 0 is instant, 1 never arrives. 0.15 is a gentle catch up.
        "smoothing": 0.15,
        "offset": { "x": 0, "y": 0 },
        // Never show anything outside the scene bounds.
        "clampToScene": true
      },

      // WHEN trigger [ON subject] IF conditions THEN actions.
      // `if` is a list joined by AND; an empty list means "always".
      // `then` is a list run in order.
      // References inside a rule are plain strings resolved in this order:
      //   "$self"  the entity the trigger fired on
      //   "$other" the other entity in a collision
      //   an instance id in this scene, e.g. "player-1"
      //   a prototype id, meaning any entity of that kind, e.g. "coin"
      //   "tag:enemy", meaning any entity carrying that tag
      // The validator refuses a project where an instance id shadows a prototype id.
      "events": [
        {
          "id": "collect-coin",
          "name": "Collect a coin",
          "enabled": true,
          "when": { "type": "collides", "subject": "player", "with": "coin" },
          "if": [],
          "then": [
            { "type": "play-sound", "sound": "sfx-coin", "volume": 0.8 },
            { "type": "change-variable", "variable": "score", "operator": "add", "value": 1 },
            { "type": "destroy", "target": "$other" }
          ]
        },
        {
          "id": "jump-sound",
          "name": "Play a sound when the player jumps",
          "enabled": true,
          "when": { "type": "jumps", "subject": "player" },
          "if": [],
          "then": [{ "type": "play-sound", "sound": "sfx-jump", "volume": 0.6 }]
        },
        {
          "id": "stomp-slime",
          "name": "Stomp a slime by landing on it",
          "enabled": true,
          "when": { "type": "collides", "subject": "player", "with": "tag:enemy" },
          // "is-falling" and "is-on-ground" are only offered for entities whose
          // movement mode is "platform". Each rule definition declares which modes
          // it applies to, and the editor filters the dropdown rather than showing
          // greyed out options.
          "if": [{ "type": "is-falling", "target": "$self" }],
          "then": [
            { "type": "destroy", "target": "$other" },
            { "type": "jump", "target": "$self", "height": 28 },
            { "type": "change-variable", "variable": "score", "operator": "add", "value": 5 }
          ]
        },
        {
          "id": "hurt-by-slime",
          "name": "Lose a life when a slime touches the player",
          "enabled": true,
          "when": { "type": "collides", "subject": "player", "with": "tag:enemy" },
          "if": [{ "type": "is-falling", "target": "$self", "negate": true }],
          "then": [
            { "type": "change-variable", "variable": "lives", "operator": "subtract", "value": 1 },
            { "type": "restart-scene" }
          ]
        },
        {
          "id": "hurt-by-spikes",
          "name": "Lose a life on spikes",
          "enabled": true,
          "when": { "type": "touches-tile", "subject": "player", "tag": "hazard" },
          // Touching a tile is reported on every step of the contact, so without
          // the grace below, standing on a spike would spend every life in well
          // under a second. Slimes restart the level instead; spikes chip away.
          "if": [
            {
              "type": "property-is",
              "target": "$self",
              "property": "invulnerable-for",
              "operator": "at-most",
              "value": 0
            }
          ],
          "then": [
            { "type": "change-variable", "variable": "lives", "operator": "subtract", "value": 1 },
            { "type": "set-property", "target": "$self", "property": "invulnerable-for", "value": 1 }
          ]
        },
        {
          "id": "fall-out-of-level",
          "name": "Lose a life when falling off the level",
          "enabled": true,
          "when": { "type": "leaves-scene", "subject": "player", "edge": "bottom" },
          "if": [],
          "then": [
            { "type": "change-variable", "variable": "lives", "operator": "subtract", "value": 1 },
            { "type": "restart-scene" }
          ]
        },
        {
          "id": "reach-flag",
          "name": "Win by reaching the flag with every coin",
          "enabled": true,
          "when": { "type": "collides", "subject": "player", "with": "flag" },
          "if": [{ "type": "variable-is", "variable": "score", "operator": "at-least", "value": 3 }],
          "then": [
            { "type": "show-message", "text": "You made it", "seconds": 2 },
            { "type": "wait", "seconds": 2 },
            { "type": "go-to-scene", "scene": "level-2" }
          ]
        }
      ]
    },

    {
      "id": "level-2",
      "name": "Level 2",
      "tileSize": 16,
      "size": { "columns": 32, "rows": 10 },
      "background": { "color": "#10141c" },
      "layers": [
        {
          "id": "ground",
          "name": "Ground",
          "tileset": "grass",
          "collides": true,
          "parallax": { "x": 1, "y": 1 },
          "drawEntitiesAfter": true,
          "legend": { ".": null, "#": 0 },
          "rows": [
            "................................",
            "................................",
            "................................",
            "................................",
            "................................",
            "................................",
            "................................",
            "................................",
            "................................",
            "################################"
          ]
        }
      ],
      "entities": [{ "id": "player-1", "prototype": "player", "x": 24, "y": 112 }],
      "camera": {
        "mode": "follow",
        "target": "player-1",
        "deadZone": { "width": 64, "height": 40 },
        "smoothing": 0.15,
        "offset": { "x": 0, "y": 0 },
        "clampToScene": true
      },
      "events": []
    }
  ]
}
```
