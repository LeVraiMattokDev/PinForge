# Getting started

By the end of this you will have made a small platformer and turned it into a
single web page you can send to anyone. No programming, and no prior experience
with games. Expect half an hour.

There is no visual editor yet. Until there is, a game is one text file that you
edit and a command that plays it. That sounds worse than it is: the file is meant
to be read and written by people, and everything in it is a word rather than a
number you have to guess.

## What you need

[Node](https://nodejs.org) version 22 or newer, and a text editor. To check:

```bash
node --version
```

Then, once, in the PinForge folder:

```bash
pnpm install
pnpm build
```

Every command below starts with `node packages/cli/dist/main.js`. That is the
PinForge command line before it has been installed properly; it will just be
`pinforge` later.

## 1. Make a game

```bash
node packages/cli/dist/main.js new my-game --name "My game"
node packages/cli/dist/main.js run my-game
```

Open the address it prints. You have a player standing on grass, three coins, two
platforms and a score. Arrow keys or WASD to move, space to jump.

That is a working game. Everything from here is changing it.

## 2. Look at the file

Open `my-game/game.pinforge.json`. It is long, but it is only five things:

- **settings** — the size of the picture, and which keys do what.
- **assets** — the pictures and sounds, by file name.
- **tilesets** — how a picture of tiles is cut up, and what each tile means.
- **entities** — the *kinds* of thing that can exist: a player, a coin.
- **scenes** — the levels: the tiles, the things placed in them, and the rules.

Leave the top alone for now and find `"scenes"`.

## 3. Draw the level

Inside the scene, find `rows`:

```json
"rows": [
  "....................",
  "....................",
  "....................",
  "......====..........",
  "....................",
  "....................",
  ".............====...",
  "....................",
  "....................",
  "####################"
]
```

That is the level, drawn. `legend` just above it says what each character means:
`.` is empty, `#` is solid ground, `=` is a wooden platform you can jump up
through, `^` is spikes.

Add a platform by replacing dots with `=`, and put spikes on the ground with `^`:

```json
"rows": [
  "....................",
  "....................",
  "..===...............",
  "......====..........",
  "....................",
  "...........===......",
  ".............====...",
  "....................",
  "..........^^........",
  "####################"
]
```

Two rules: every row must be exactly as long as the others, and there must be as
many rows as before. If you miscount, PinForge tells you which row and by how
much.

Save the file, stop the command with control and C, and run it again. Your
platforms are there.

Stuck on where a platform can go? A jump reaches about 46 pixels, and a tile is
16, so climb no more than two tiles at a time and leave gaps of no more than
three.

## 4. Move the coins

Further down, `entities` inside the scene is the list of things placed in the
level:

```json
{ "id": "coin-1", "prototype": "coin", "x": 104, "y": 40 }
```

`x` and `y` are in pixels from the top left corner, and down is positive. A tile
is 16 pixels, so the top of the third row down is `y: 32`.

Put a coin on the platform you just drew. If a coin ends up floating somewhere a
jump cannot reach, nothing complains, so give yourself a reachable ladder of
platforms.

Add as many as you like by copying the line and giving each one a different `id`.

## 5. Make it feel the way you want

Find the player, then `movement`:

```json
"movement": { "mode": "platform" }
```

Everything about how it moves has a sensible value already, and you change one
by naming it:

```json
"movement": { "mode": "platform", "maxSpeed": 130, "jumpHeight": 60 }
```

`jumpHeight` is in pixels, so 60 is almost four tiles. Try 20, then 90, and run
it each time. This is the part worth spending time on.

You are not missing anything by leaving the rest alone. The three settings that
make a platformer feel good rather than broken — falling faster than rising, a
moment of grace after walking off a ledge, and remembering a jump pressed just
before landing — are already on and already tuned.

## 6. Write a rule

Find `events` in the scene. Each entry is a sentence:

```json
{
  "id": "collect-coin",
  "name": "Collect a coin",
  "when": { "type": "collides", "subject": "player", "with": "coin" },
  "then": [
    { "type": "play-sound", "sound": "sfx-coin" },
    { "type": "change-variable", "variable": "score", "operator": "add", "value": 1 },
    { "type": "destroy", "target": "$other" }
  ]
}
```

Read it out loud: when the player touches a coin, play a sound, add one to the
score, and remove the coin. `$other` means "the other thing in the collision",
which here is the coin that was actually touched rather than every coin at once.

Add a rule of your own: losing the game on spikes.

```json
{
  "id": "spikes-hurt",
  "name": "Spikes send you back to the start",
  "when": { "type": "touches-tile", "subject": "player", "tag": "hazard" },
  "then": [
    { "type": "show-message", "text": "Ouch", "seconds": 1 },
    { "type": "restart-scene" }
  ]
}
```

Put it in the `events` list, run the game, and walk into the spikes.

[The events reference](events-reference.md) lists everything you can put after
`when`, `if` and `then`. There are sixteen triggers, ten conditions and
twenty-two actions, and that is the whole language.

## 7. Check it when something is wrong

If the game refuses to start, ask what is wrong:

```bash
node packages/cli/dist/main.js validate my-game
```

It answers in sentences, with the place in the file:

```
/scenes/0/layers/0/rows/2: Row 2 of the layer "ground" is 19 characters long,
but this level is 20 tiles wide.
```

It also catches the quieter mistakes: a rule that mentions a variable you never
made, a coin that is a copy of an entity you renamed, a sound that is not in the
asset list.

## 8. Share it

```bash
node packages/cli/dist/main.js export my-game --out my-game.html
```

One file. The pictures and the sounds are inside it, so there is nothing else to
upload and nothing to configure. Send it, put it on a web page, open it from a
memory stick.

## Where to go next

- Add a second level: copy the whole scene, give it a new `id`, and end the first
  one with `{ "type": "go-to-scene", "scene": "level-2" }`.
- Add an enemy. The example game has a slime that walks back and forth on its
  own, turning at walls and at ledges, in `examples/first-game`.
- Replace the art. The pictures in `assets/` are placeholders; PinForge only
  cares about the file names and the size of one frame.
- Read [the concepts](concepts.md) if you want the ideas rather than the file.
