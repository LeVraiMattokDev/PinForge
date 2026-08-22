<!-- Generated from packages/script. Run `pnpm generate` after changing the templates. -->

# Writing rules as text

Every rule in PinForge reads as a sentence, and PinScript is that sentence
written down. It is not a second language: the dropdowns, the blocks and the
script are three faces of the same rules, and anything one of them can say,
the others can too.

The editor shows it under **Rules, then Script**: the rules as text, an Apply
button, and every problem listed with its line number. Nothing changes until
every line reads. From the command line, `pinforge rules <game>` writes every
rule in a game this way, ready to paste back into the editor or into a chat.

## A whole rule

```
# Comments start with a hash mark.
rule collect-coin "Collect a coin"
when player touches coin
then remove $other
then add 1 to score

rule win once
when score changes
if score is at least 3
then say "You win!" for 3 seconds
then go to the level level-2
```

A rule starts with `rule` and its id, then an optional name in quotes, then
optionally `once` (run at most once per level) and `off` (keep the rule but
never run it). After that come its lines, in any amount of whitespace:

- exactly one `when` line, the trigger;
- any number of `if` lines, which must all be true;
- one or more `then` lines, run in order, top to bottom.

Blank lines and comments go anywhere. The next `rule` line starts the next
rule.

## What goes in a slot

The sentences below write their slots as `<name>`, and parts in `[square
brackets]` can be left out. When PinForge writes script for you, it leaves a
part out whenever it still holds its everyday value.

- An entity slot takes `$self` (the entity the trigger fired on), `$other`
  (the other entity in a collision), `tag:enemy` (anything carrying that
  tag), or a plain name: an entity in the level, or one of the project's
  entity kinds.
- Names are ids: lowercase letters, numbers and dashes, like `sfx-coin`.
- A value is a number, `true`, `false`, or text in quotes.
- Text goes in double quotes. Inside them, write `\"` for a quote, `\\` for
  a backslash and `\n` for a line break.
- A comparison is written out: `is`, `is not`, `is at least`, `is at most`,
  `is more than` or `is less than`.
- `not` before a condition turns it around: `if not player is on the ground`.
- `1 second` and `1 pixel` read as well as their plurals.

## Triggers

The WHEN half. Something happens, and the rule wakes up.

### When the game starts

Fires once, the first time the game is launched.

```
when the game starts
```

### When the scene starts

Fires every time this scene is entered or restarted.

```
when the level starts
```

### Every frame

Fires on every step of the simulation, sixty times a second.

```
every frame
```

### Every few seconds

Fires on a repeating timer.

```
every <seconds> seconds
```

### When a control is pressed

Fires when the player presses one of the keys bound to an action.

```
when <action> is pressed
```

### When a control is released

Fires when the player lets go of an action.

```
when <action> is released
```

### When something touches a kind of tile

Fires while an entity overlaps a tile carrying the given tag.

```
when <subject> touches a <tag> tile
```

### When two things touch

Fires the moment two entities begin to overlap.

```
when <subject> touches <with>
```

### When two things stop touching

Fires the moment two entities stop overlapping.

```
when <subject> stops touching <with>
```

### When a variable changes

Fires whenever something writes to that variable.

```
when <variable> changes
```

### When something appears

Fires when a new entity of that kind is created.

```
when <subject> appears
```

### When something is removed

Fires when an entity of that kind is destroyed.

```
when <subject> is removed
```

### When something leaves the level

Fires once when an entity crosses an edge of the scene, and again only if it comes back and leaves again.

```
when <subject> leaves the level [at the <top / bottom / left / right>]
```

### When something lands

Fires when an entity touches the ground after being in the air.

```
when <subject> lands
```

### When something jumps

Fires when an entity leaves the ground by jumping.

```
when <subject> jumps
```

### When something is clicked

Fires when the pointer presses on an entity.

```
when <subject> is clicked
```

## Conditions

The IF half. Checked when the trigger fires, all of them must hold.

### A control is held down

True while the player holds an action.

```
if <action> is held
```

### Is standing on the ground

True while the entity has something solid under its feet.

```
if <target> is on the ground
```

### Is falling

True while the entity is moving downwards through the air.

```
if <target> is falling
```

### Something still exists

True while at least one entity of that kind is alive.

```
if <entity> exists
```

### Has the tag

True when the entity carries that tag.

```
if <target> has the tag <tag>
```

### The distance between two things is

Compares the distance between two entities with a number of pixels.

```
if <from> is within <pixels> pixels of <to>
if <from> is at least <pixels> pixels from <to>
```

### By chance

True a percentage of the time.

```
if chance of <percent> in 100
```

### The current level is

True while that scene is the one running. Useful for global rules.

```
if the level is <scene>
```

### A property is

Compares a custom property on an entity with a value.

```
if <property> of <target> <is / is not / is at least / ...> <value>
```

### A variable is

Compares a variable with a value.

```
if <variable> <is / is not / is at least / ...> <value>
```

## Actions

The THEN half. What the rule does.

### Remove

Takes an entity out of the level.

```
then remove <target>
```

### Create

Adds a new copy of an entity at a position.

```
then create <entity> [at <x> <y>] [near <relativeTo>]
```

### Move instantly to

Puts an entity at a position, with no movement in between.

```
then teleport <target> to <x> <y> [near <relativeTo>]
```

### Set the speed of

Sets or adds to how fast an entity is moving. Leave an axis out to keep it as it is.

```
then set the speed of <target> [across to <x>] [down to <y>]
then change the speed of <target> [across by <x>] [down by <y>]
```

### Jump

Makes an entity jump, optionally to a different height than usual.

```
then make <target> jump [<height> pixels high]
```

### Set a variable to

Writes a value into a variable.

```
then set <variable> to <value>
```

### Change a variable by

Adds to, subtracts from, multiplies or divides a number variable.

```
then add <value> to <variable>
then subtract <value> from <variable>
then multiply <variable> by <value>
then divide <variable> by <value>
then change <variable> to <value>
```

### Set a property to

Writes a value into a custom property on an entity.

```
then set <property> of <target> to <value>
```

### Change a property by

Adds to, subtracts from, multiplies or divides a number property.

```
then add <value> to <property> of <target>
then subtract <value> from <property> of <target>
then multiply <property> of <target> by <value>
then divide <property> of <target> by <value>
then change <property> of <target> to <value>
```

### Play the animation

Switches an entity to one of its animations.

```
then play the <animation> animation on <target>
```

### Show or hide

Shows or hides an entity without removing it.

```
then show <target>
then hide <target>
```

### Play the sound

Plays a sound once.

```
then play the sound <sound> [at volume <volume>]
```

### Stop the sound

Stops one sound, or every sound if none is named.

```
then stop the sound <sound>
then stop every sound
```

### Show the message

Puts a short line of text on screen for a few seconds.

```
then say <text> [for <seconds> seconds]
```

### Go to the level

Loads another scene.

```
then go to the level <scene>
```

### Restart the level

Starts the current scene again from the beginning.

```
then restart the level
```

### Pause the game

Freezes everything: nothing moves, no timers run, and only the player pressing a control is still heard, so a rule can start the game again.

```
then pause the game
```

### Start the game again

Unfreezes a paused game and carries on exactly where it stopped.

```
then start the game again
```

### Follow with the camera

Points the camera at a different entity.

```
then make the camera follow <target>
```

### Shake the camera

Shakes the view, for an explosion or a heavy landing.

```
then shake the camera [for <seconds> seconds] [with strength <strength>]
```

### Change a tile

Paints or clears one tile while the game runs, for a door or a bridge.

```
then paint tile <tile> at column <column> row <row> on <layer>
then clear the tile at column <column> row <row> on <layer>
```

### Turn on the rule

Switches another rule on.

```
then turn on the rule <rule>
```

### Turn off the rule

Switches another rule off.

```
then turn off the rule <rule>
```

### Wait

Pauses the rest of this rule for a moment. The game keeps running.

```
then wait <seconds> seconds
```

