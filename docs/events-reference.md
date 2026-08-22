<!-- Generated from packages/schema. Run `pnpm generate` after changing the catalog. -->

# Events reference

Every rule in PinForge reads as a sentence:

```
WHEN <trigger> IF <conditions> THEN <actions>
```

The conditions are joined by "and", and an empty list means always. The actions
run in order, top to bottom. Each entry below shows the words the editor uses,
the name the same thing has inside the project file, and a working example.

Entities are named with a single string: `$self` is the entity the trigger fired
on, `$other` is the other entity in a collision, `tag:enemy` is anything carrying
that tag, and a plain name is an entity in the level or one of the project's
entity kinds. See [the project format](project-format.md) for the whole file.

## Triggers

The WHEN half. Something happens, and the rule wakes up.

### When the game starts

`game-starts`

Fires once, the first time the game is launched.

```json
{"type":"game-starts"}
```

### When the scene starts

`scene-starts`

Fires every time this scene is entered or restarted.

```json
{"type":"scene-starts"}
```

### Every frame

`every-frame`

Fires on every step of the simulation, sixty times a second.

```json
{"type":"every-frame"}
```

### Every few seconds

`every-seconds`

Fires on a repeating timer.

```json
{"type":"every-seconds","seconds":2}
```

### When a control is pressed

`action-pressed`

Fires when the player presses one of the keys bound to an action.

```json
{"type":"action-pressed","action":"jump"}
```

### When a control is released

`action-released`

Fires when the player lets go of an action.

```json
{"type":"action-released","action":"jump"}
```

### When two things touch

`collides`

Fires the moment two entities begin to overlap.

```json
{"type":"collides","subject":"player","with":"coin"}
```

### When two things stop touching

`collision-ends`

Fires the moment two entities stop overlapping.

```json
{"type":"collision-ends","subject":"player","with":"tag:enemy"}
```

### When something touches a kind of tile

`touches-tile`

Fires while an entity overlaps a tile carrying the given tag.

```json
{"type":"touches-tile","subject":"player","tag":"hazard"}
```

### When a variable changes

`variable-changes`

Fires whenever something writes to that variable.

```json
{"type":"variable-changes","variable":"score"}
```

### When something appears

`entity-spawned`

Fires when a new entity of that kind is created.

```json
{"type":"entity-spawned","subject":"coin"}
```

### When something is removed

`entity-destroyed`

Fires when an entity of that kind is destroyed.

```json
{"type":"entity-destroyed","subject":"tag:enemy"}
```

### When something leaves the level

`leaves-scene`

Fires once when an entity crosses an edge of the scene, and again only if it comes back and leaves again.

```json
{"type":"leaves-scene","subject":"player","edge":"bottom"}
```

### When something lands

`lands`

Fires when an entity touches the ground after being in the air.

Only offered for entities using platform movement.

```json
{"type":"lands","subject":"player"}
```

### When something jumps

`jumps`

Fires when an entity leaves the ground by jumping.

Only offered for entities using platform movement.

```json
{"type":"jumps","subject":"player"}
```

### When something is clicked

`clicked`

Fires when the pointer presses on an entity.

```json
{"type":"clicked","subject":"start-button"}
```

## Conditions

The IF half. Checked when the trigger fires, all of them must hold.

### A variable is

`variable-is`

Compares a variable with a value.

```json
{"type":"variable-is","variable":"score","operator":"at-least","value":3}
```

### A property is

`property-is`

Compares a custom property on an entity with a value.

```json
{"type":"property-is","target":"$self","property":"hits-left","operator":"at-most","value":0}
```

### Has the tag

`has-tag`

True when the entity carries that tag.

```json
{"type":"has-tag","target":"$other","tag":"enemy"}
```

### Something still exists

`entity-exists`

True while at least one entity of that kind is alive.

```json
{"type":"entity-exists","entity":"coin","negate":true}
```

### A control is held down

`action-held`

True while the player holds an action.

```json
{"type":"action-held","action":"down"}
```

### The distance between two things is

`distance-is`

Compares the distance between two entities with a number of pixels.

```json
{"type":"distance-is","from":"$self","to":"player","operator":"at-most","pixels":64}
```

### By chance

`chance`

True a percentage of the time.

```json
{"type":"chance","percent":25}
```

### The current level is

`current-scene-is`

True while that scene is the one running. Useful for global rules.

```json
{"type":"current-scene-is","scene":"level-1"}
```

### Is standing on the ground

`is-on-ground`

True while the entity has something solid under its feet.

Only offered for entities using platform movement.

```json
{"type":"is-on-ground","target":"$self"}
```

### Is falling

`is-falling`

True while the entity is moving downwards through the air.

Only offered for entities using platform movement.

```json
{"type":"is-falling","target":"$self"}
```

## Actions

The THEN half. What the rule does.

### Remove

`destroy`

Takes an entity out of the level.

```json
{"type":"destroy","target":"$other"}
```

### Create

`spawn`

Adds a new copy of an entity at a position.

```json
{"type":"spawn","entity":"coin","x":0,"y":-12,"relativeTo":"$self"}
```

### Set the speed of

`move`

Sets or adds to how fast an entity is moving. Leave an axis out to keep it as it is.

```json
{"type":"move","target":"$self","mode":"set","x":-24}
```

### Move instantly to

`teleport`

Puts an entity at a position, with no movement in between.

```json
{"type":"teleport","target":"player","x":24,"y":112}
```

### Jump

`jump`

Makes an entity jump, optionally to a different height than usual.

Only offered for entities using platform movement.

```json
{"type":"jump","target":"$self","height":28}
```

### Set a variable to

`set-variable`

Writes a value into a variable.

```json
{"type":"set-variable","variable":"lives","value":3}
```

### Change a variable by

`change-variable`

Adds to, subtracts from, multiplies or divides a number variable.

```json
{"type":"change-variable","variable":"score","operator":"add","value":1}
```

### Set a property to

`set-property`

Writes a value into a custom property on an entity.

```json
{"type":"set-property","target":"$self","property":"hits-left","value":2}
```

### Change a property by

`change-property`

Adds to, subtracts from, multiplies or divides a number property.

```json
{"type":"change-property","target":"$self","property":"hits-left","operator":"subtract","value":1}
```

### Play the animation

`play-animation`

Switches an entity to one of its animations.

```json
{"type":"play-animation","target":"$self","animation":"hurt"}
```

### Show or hide

`set-visible`

Shows or hides an entity without removing it.

```json
{"type":"set-visible","target":"door","visible":false}
```

### Play the sound

`play-sound`

Plays a sound once.

```json
{"type":"play-sound","sound":"sfx-coin","volume":0.8}
```

### Stop the sound

`stop-sound`

Stops one sound, or every sound if none is named.

```json
{"type":"stop-sound","sound":"music"}
```

### Show the message

`show-message`

Puts a short line of text on screen for a few seconds.

```json
{"type":"show-message","text":"You made it","seconds":2}
```

### Go to the level

`go-to-scene`

Loads another scene.

```json
{"type":"go-to-scene","scene":"level-2"}
```

### Restart the level

`restart-scene`

Starts the current scene again from the beginning.

```json
{"type":"restart-scene"}
```

### Follow with the camera

`set-camera-target`

Points the camera at a different entity.

```json
{"type":"set-camera-target","target":"boss"}
```

### Shake the camera

`shake-camera`

Shakes the view, for an explosion or a heavy landing.

```json
{"type":"shake-camera","strength":4,"seconds":0.3}
```

### Change a tile

`set-tile`

Paints or clears one tile while the game runs, for a door or a bridge.

```json
{"type":"set-tile","layer":"ground","column":12,"row":5,"tile":null}
```

### Turn on the rule

`enable-rule`

Switches another rule on.

```json
{"type":"enable-rule","rule":"spawn-enemies"}
```

### Turn off the rule

`disable-rule`

Switches another rule off.

```json
{"type":"disable-rule","rule":"spawn-enemies"}
```

### Wait

`wait`

Pauses the rest of this rule for a moment. The game keeps running.

```json
{"type":"wait","seconds":1.5}
```
