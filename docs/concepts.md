# Concepts

Six ideas. Everything in PinForge is one of them, and none of them needs any
programming.

## Scene

A scene is one level: a screen the player is in. A game is a list of scenes, and
one of them is where the game starts.

A scene holds a grid of tiles, the things standing on it, where the camera looks,
and the rules that apply while the player is there.

## Tile

Tiles are the level itself: the ground, the walls, the spikes. You paint them
from a palette, like a stamp tool, onto a grid.

A tile does not know how to behave. It carries **tags**, and the tags decide:

- `solid` — you cannot walk through it. Only tiles stop things this way: two
  entities never push each other apart, so a wall or a closed door is a tile.
- `one-way` — you can jump up through it and stand on top. A wooden platform.
- `hazard` — touching it is dangerous. What "dangerous" means is up to your rules.

You can invent your own tags, like `ice` or `water`, and write a rule that reacts
to them. Nothing is built into the picture of a tile; two tiles that look
different can behave the same, and two that look the same can behave differently.

## Entity

An entity is a thing in the level that is not part of the grid: the player, a
coin, an enemy, a door, a score label.

Entities come in two layers, and the difference saves a lot of work:

- **A kind of entity** is the definition. "A coin is eight pixels across, looks
  like this, spins, and is picked up rather than walked into."
- **A copy** is one coin sitting at one place in one level.

Change the kind and every copy changes. Place thirty coins and you have defined
one coin. A copy can differ from its kind in small ways: this slime is slower
than the others.

Every entity has a box, and the box is what actually touches things. The drawing
can be bigger than the box and hang over the edges, which is normal: art usually
has empty space around it that should not count as the character.

## Component

A component is a thing an entity has. There are four, and an entity has at most
one of each.

- **Sprite** — what it looks like, and its animations. An animation is a list of
  frames and a speed. Nothing more.
- **Collider** — how it touches things. **Solid** is pushed out of walls, like the
  player. **Trigger** passes through everything and only reports that it was
  touched, like a coin. **None** never touches anything, like a decoration.
- **Movement** — how it moves. Two kinds, below.
- **Text** — a line of text instead of a picture, which is how a score gets on
  screen. Writing `Score: {score}` shows the value of the variable called
  `score` and keeps it up to date.

An entity with no components at all is legal, and is an invisible marker: a
spawn point, a place to teleport to.

### The two kinds of movement

**Walking and jumping**, for a platformer. Gravity pulls it down, it can stand on
things, and it can jump.

Three details are switched on for you, and they are the difference between a game
that feels broken and one that feels good:

- Falling is a little faster than rising. A jump that comes down at the same rate
  it went up feels like it happens underwater.
- If you press jump a fraction of a second after walking off a ledge, you still
  jump. Players press it late constantly and are certain they pressed it in time.
- If you press jump a fraction of a second before landing, you jump on landing
  instead of nothing happening.

You do not have to know any of that. It is on, and the numbers are already good.
If you want to change them, they are named in plain words in the inspector.

You set how high a jump goes in **pixels**, not in some unit of force. Sixteen
pixels is one tile.

**Free movement**, for a puzzle game, a top down game or a shoot-em-up: it moves
in any direction and gravity does not apply. Set how quickly it speeds up to 0
and it responds instantly, which is what a puzzle wants; set it high and it
drifts. You can also lock it to one axis.

## Event

An event is a rule, and a rule is a sentence:

> **WHEN** the player touches a coin **THEN** remove the coin, add 1 to the score

You build it from dropdowns, left to right. There are three parts:

- **WHEN** — what starts it. Two things touching, a key pressed, the level
  starting, a timer, something landing.
- **IF** — anything that also has to be true, and you can leave it empty. All of
  the conditions have to hold.
- **THEN** — what happens, in order, top to bottom.

Rules can point at things in several ways: this particular coin, any coin at all,
anything tagged as an enemy, whichever entity the rule is about, or the other
thing in a collision. The editor only offers what makes sense: it will not ask a
coin whether it is standing on the ground, because coins do not have gravity.

Rules live in a level. Rules that should apply everywhere, like pausing or
running out of lives, are kept in one place instead of copied into every level.

A rule can be built three ways, and they are one thing: dropdown sentences,
snap-together blocks, or [PinScript](script.md), the same sentences written as
text. Whatever one of them says, the other two show.

[The events reference](events-reference.md) lists every trigger, condition and
action.

## Variable

A variable is something the game remembers: a score, a number of lives, whether
a key has been found. A variable holds a number, a yes or no, or a line of text,
and starts at a value you choose.

Variables belong to the whole game, so a score survives moving between levels.
When something belongs to one entity rather than the whole game, give the entity
a **property** instead: how many hits this enemy has left, whether this door is
open. Properties work the same way, one per entity.

## Camera

The camera decides what part of the level you can see. Three ways to set it:

- **Follow something**, usually the player. It has a still zone in the middle of
  the screen: the player can move around inside it without the picture moving at
  all, which stops the view wobbling on every step.
- **Fixed** in one place, for a single screen level.
- **Scrolling by itself** at a steady speed, for a shoot-em-up.

In every case the camera can be kept inside the level, so the player never sees
past the edge.
