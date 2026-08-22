import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import {
  Asset,
  EntityInstance,
  EntityPrototype,
  EventRule,
  Id,
  VariableDefinition,
} from '@pinforge/schema';
import { Workspace } from './tools.js';

/**
 * The Model Context Protocol surface.
 *
 * Two things make this trustworthy rather than a back door. The tool inputs are
 * the project schema itself, not a parallel description of it, so a rule an
 * assistant writes here is checked exactly as the editor would check it. And a
 * mutation validates the whole project before anything is written: if a change
 * would leave the game broken it fails with the reasons and the file is
 * untouched.
 */
export function createServer(workspace = new Workspace()): McpServer {
  const server = new McpServer(
    { name: 'pinforge', version: '0.0.0' },
    {
      instructions:
        'Authoring for PinForge, a no-code 2D game engine. A game is one game.pinforge.json file. ' +
        'Open a project first, then read a level before changing it. Rules read as a sentence: ' +
        'WHEN a trigger IF conditions THEN actions; call list_rule_types for the whole vocabulary. ' +
        'Positions are in pixels with y pointing down, and an entity position is the top left of its box.',
    },
  );

  const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
  const report = (changes: ReturnType<Workspace['createScene']>) => text(workspace.report(changes));

  server.registerTool(
    'open_project',
    {
      title: 'Open a project',
      description: 'Opens a game.pinforge.json file, or a folder holding one, and describes it.',
      inputSchema: { path: z.string() },
    },
    ({ path }) => text(workspace.open(path)),
  );

  server.registerTool(
    'create_project',
    {
      title: 'Create a project',
      description:
        'Makes a new game in a folder from the starter project, art included, and opens it.',
      inputSchema: { path: z.string(), name: z.string().optional() },
    },
    ({ path, name }) => text(workspace.createProject(path, name)),
  );

  server.registerTool(
    'describe_project',
    {
      title: 'Describe the open project',
      description: 'Summarises the settings, variables, assets, kinds of thing and levels.',
      inputSchema: {},
    },
    () => text(workspace.describe()),
  );

  server.registerTool(
    'read_scene',
    {
      title: 'Read a level',
      description: 'Returns one level exactly as the file holds it, tile rows included.',
      inputSchema: { scene: Id },
    },
    ({ scene }) => text(workspace.readScene(scene)),
  );

  server.registerTool(
    'list_rule_types',
    {
      title: 'List every trigger, condition and action',
      description:
        'The whole rule vocabulary, with a plain description and a working example for each.',
      inputSchema: { kind: z.enum(['triggers', 'conditions', 'actions']).optional() },
    },
    ({ kind }) => text(workspace.ruleVocabulary(kind)),
  );

  server.registerTool(
    'validate_project',
    {
      title: 'Check the project',
      description: 'Re-reads the file from disk and reports anything wrong with it.',
      inputSchema: {},
    },
    () => text(workspace.validate()),
  );

  server.registerTool(
    'create_scene',
    {
      title: 'Add a level',
      description: 'Adds an empty level. Give it a tileset to get a ground layer to paint on.',
      inputSchema: {
        id: Id,
        name: z.string().optional(),
        columns: z.number().int().positive(),
        rows: z.number().int().positive(),
        tileSize: z.number().int().positive().optional(),
        tileset: Id.optional(),
      },
    },
    (request) => report(workspace.createScene(request)),
  );

  server.registerTool(
    'create_entity',
    {
      title: 'Add a kind of thing',
      description:
        'Adds an entity prototype: a size, tags, custom properties and up to one each of sprite, collider, movement and text.',
      inputSchema: { entity: EntityPrototype },
    },
    ({ entity }) => report(workspace.createEntity(entity as Record<string, unknown>)),
  );

  server.registerTool(
    'modify_entity',
    {
      title: 'Change a kind of thing',
      description:
        'Merges a patch into an entity prototype. Objects merge, lists are replaced, and the whole project is checked afterwards.',
      inputSchema: { id: Id, patch: z.record(z.string(), z.unknown()) },
    },
    ({ id, patch }) => report(workspace.modifyEntity(id, patch)),
  );

  server.registerTool(
    'place_entity',
    {
      title: 'Put something in a level',
      description: 'Places a copy of an entity prototype at a position in a level.',
      inputSchema: { scene: Id, entity: EntityInstance },
    },
    ({ scene, entity }) => report(workspace.placeEntity(scene, entity as Record<string, unknown>)),
  );

  server.registerTool(
    'move_entity',
    {
      title: 'Move something',
      description: 'Moves one copy to a new position, in pixels from the top left of the level.',
      inputSchema: { scene: Id, id: Id, x: z.number(), y: z.number() },
    },
    ({ scene, id, x, y }) => report(workspace.moveEntity(scene, id, x, y)),
  );

  server.registerTool(
    'remove_entity',
    {
      title: 'Remove something',
      description: 'Takes one copy out of a level.',
      inputSchema: { scene: Id, id: Id },
    },
    ({ scene, id }) => report(workspace.removeEntity(scene, id)),
  );

  server.registerTool(
    'paint_tiles',
    {
      title: 'Paint tiles',
      description:
        'Fills a rectangle of a tile layer with one tile, or with nothing when the tile is null. Tile numbers count from 0 across the tileset image.',
      inputSchema: {
        scene: Id,
        layer: Id,
        column: z.number().int().min(0),
        row: z.number().int().min(0),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        tile: z.number().int().min(0).nullable(),
      },
    },
    (request) => report(workspace.paintTiles(request)),
  );

  server.registerTool(
    'add_rule',
    {
      title: 'Add a rule',
      description:
        'Adds a rule to a level, or to the whole game when no level is named. Rules read WHEN, IF, THEN.',
      inputSchema: { rule: EventRule, scene: Id.optional() },
    },
    ({ rule, scene }) => report(workspace.addRule(rule as Record<string, unknown>, scene)),
  );

  server.registerTool(
    'remove_rule',
    {
      title: 'Remove a rule',
      description: 'Removes a rule from a level, or from the whole game when no level is named.',
      inputSchema: { id: Id, scene: Id.optional() },
    },
    ({ id, scene }) => report(workspace.removeRule(id, scene)),
  );

  server.registerTool(
    'add_variable',
    {
      title: 'Add a variable',
      description: 'Adds something the whole game remembers, such as a score or a number of lives.',
      inputSchema: { variable: VariableDefinition },
    },
    ({ variable }) => report(workspace.addVariable(variable as Record<string, unknown>)),
  );

  server.registerTool(
    'add_asset',
    {
      title: 'Add a picture or a sound',
      description:
        'Names a file the game can use. The source is a path next to the project file, or a data URI.',
      inputSchema: { asset: Asset },
    },
    ({ asset }) => report(workspace.addAsset(asset as Record<string, unknown>)),
  );

  server.registerTool(
    'export_project',
    {
      title: 'Export the game',
      description: 'Writes one HTML file with every asset inlined and nothing left to fetch.',
      inputSchema: { out: z.string() },
    },
    ({ out }) => text(workspace.exportGame(out)),
  );

  server.registerTool(
    'desktop_project',
    {
      title: 'Lay out a desktop build',
      description:
        'Writes a folder that builds the game into one executable people double click, .exe on Windows. Turning it into the executable is one Rust command, run by hand on the system it is for.',
      inputSchema: { out: z.string().optional() },
    },
    ({ out }) => text(workspace.desktopBuild(out)),
  );

  return server;
}
