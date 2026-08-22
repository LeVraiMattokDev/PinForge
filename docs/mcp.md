# The MCP server

PinForge ships a [Model Context Protocol](https://modelcontextprotocol.io)
server, so an assistant can build and change a game with you by talking about
it. "Add a level twice as wide, put spikes along the bottom and a flag at the
end" is a reasonable thing to say to it.

It is not a second way to build a game. It reads and writes the same
`game.pinforge.json` the editor and the command line use, through the same
validation, and it exports through the same exporter. There is no private side
channel, and nothing it writes is anything you could not have typed yourself.

## Connecting a client

The server speaks over standard input and output. Point any MCP client at it:

```json
{
  "mcpServers": {
    "pinforge": {
      "command": "node",
      "args": ["/path/to/PinForge/packages/mcp/dist/main.js"]
    }
  }
}
```

Build first, with `pnpm build`. The server takes no arguments: which project it
works on is decided by the `open_project` or `create_project` tool, so one
server can move between games in a conversation.

## What it can do

| Tool | What it does |
| --- | --- |
| `open_project` | Opens a game file, or a folder holding one, and describes it. |
| `create_project` | Makes a new game from the starter, art included, and opens it. |
| `describe_project` | Settings, controls, variables, assets, kinds of thing, levels. |
| `read_scene` | One level exactly as the file holds it, tile rows included. |
| `list_rule_types` | The whole rule vocabulary, with an example for each. |
| `validate_project` | Re-reads the file from disk and reports anything wrong. |
| `create_scene` | Adds a level, with a layer ready to paint. |
| `create_entity` | Adds a kind of thing: size, tags, properties, components. |
| `modify_entity` | Merges a patch into a kind of thing. |
| `place_entity` | Puts a copy of one in a level. |
| `move_entity` | Moves a copy. |
| `remove_entity` | Takes a copy out. |
| `paint_tiles` | Fills a rectangle of a tile layer with one tile, or clears it. |
| `add_rule` | Adds a rule to a level, or to the whole game. |
| `remove_rule` | Removes one. |
| `add_variable` | Adds something the game remembers. |
| `add_asset` | Names a picture or a sound the game can use. |
| `export_project` | Writes one HTML file with everything inlined. |
| `desktop_project` | Lays out a desktop build: one executable, after one Rust command. |

## The two guarantees

**Tool inputs are the project schema itself.** `add_rule` does not accept a
description of a rule that then gets translated; it accepts an `EventRule`, the
same Zod definition the editor validates against, and the JSON Schema the client
sees is generated from it. A rule with a trigger that does not exist is rejected
before it reaches the file.

**A mutation validates the whole project before writing anything.** Structure
first, then meaning: a rule that mentions a variable nobody made, a copy of an
entity that was renamed, a row of tiles the wrong length. If any of it fails, the
tool answers with the reasons and the file on disk is untouched. There is no
half-written state to recover from.

Because of the second guarantee, order matters in a conversation: add the
variable before the rule that changes it, add the tileset before the layer that
uses it. The error messages say exactly which is missing.

## Every mutation answers with a diff

The caller cannot see the file, so "done" would be useless. Each mutation reports
the paths it touched:

```
~ /entities/0/components/movement/jumpHeight: 44 -> 70
+ /scenes/0/entities/6 = {"id":"crate-1","prototype":"crate","x":64,"y":128}
- /scenes/0/events/2 (was {"id":"old-rule","when":{"type":"every-frame"}})
```

Values too large to read back, such as an inlined image, are summarised rather
than repeated.

## Things worth telling an assistant once

- Positions are pixels, `y` points down, and an entity's position is the top left
  of its collision box.
- A tile layer is a legend of single characters plus one string per row.
  `paint_tiles` takes tile numbers and handles the legend itself, adding a
  character for a tile the layer has not used before.
- A jump reaches about `jumpHeight` pixels, so with sixteen pixel tiles a step up
  of two tiles is comfortable and three is not.
- Rules that should apply in every level belong in `globalEvents` rather than
  copied into each one.
- `list_rule_types` is the fastest way to find out what is possible; it is
  generated from the same list the editor builds its dropdowns from.
