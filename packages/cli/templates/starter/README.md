# My game

A PinForge game. Everything about it is in `game.pinforge.json`, and the
pictures and sounds are in `assets/`.

Play it:

```bash
pinforge run .
```

Arrow keys or WASD to move, space to jump.

Share it as one HTML file:

```bash
pinforge export . --out my-game.html
```

Things to try first: move the coins, change `jumpHeight` on the player, or add a
row of spikes with the `^` character in the ground layer.
