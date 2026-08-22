import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildHtml, create, inlineAssets, readRuntimeBundle, scaffoldDesktop } from '@pinforge/cli';
import { ACTIONS, CONDITIONS, TRIGGERS, type CatalogEntry } from '@pinforge/schema';
import { describeChanges, type Change } from './diff.js';
import { ProjectSession, isObject, listIn, sceneIn, type JsonObject } from './session.js';

export interface SceneRequest {
  id: string;
  name?: string;
  columns: number;
  rows: number;
  tileSize?: number;
  tileset?: string;
}

export interface PaintRequest {
  scene: string;
  layer: string;
  column: number;
  row: number;
  width?: number;
  height?: number;
  tile: number | null;
}

/**
 * Every operation the server offers, as plain functions. Nothing here knows
 * about the Model Context Protocol, which is what makes it testable and what
 * keeps the protocol layer thin.
 */
export class Workspace {
  private session: ProjectSession | undefined;

  open(path: string): string {
    this.session = ProjectSession.open(path);
    return this.describe();
  }

  createProject(path: string, name?: string): string {
    const file = create(path, name);
    this.session = ProjectSession.open(file);
    return this.describe();
  }

  describe(): string {
    const session = this.need();
    const project = session.project;
    const lines = [
      `${project.meta.name} (${session.file})`,
      project.meta.description || '(no description)',
      `Starts on: ${project.settings.startScene}`,
      `Picture: ${project.settings.viewport.width} by ${project.settings.viewport.height}, ${project.settings.viewport.scaleMode} scaling`,
      `Controls: ${Object.keys(project.settings.input).join(', ')}`,
      `Variables: ${project.variables.map((one) => `${one.id} (${one.type}, starts at ${JSON.stringify(one.initial)})`).join(', ') || 'none'}`,
      `Assets: ${project.assets.map((one) => `${one.id} (${one.kind})`).join(', ') || 'none'}`,
      `Tilesets: ${project.tilesets.map((one) => `${one.id} (${one.tileWidth}x${one.tileHeight}, ${one.tiles.length} named tiles)`).join(', ') || 'none'}`,
      `Kinds of thing: ${
        project.entities
          .map(
            (one) =>
              `${one.id} [${Object.keys(one.components)
                .filter(
                  (key) =>
                    key in one.components && one.components[key as keyof typeof one.components],
                )
                .join(' ')}]`,
          )
          .join(', ') || 'none'
      }`,
      `Rules that run everywhere: ${project.globalEvents.length}`,
      'Levels:',
      ...project.scenes.map(
        (scene) =>
          `  ${scene.id}: ${scene.size.columns} by ${scene.size.rows} tiles of ${scene.tileSize}px, ` +
          `${scene.layers.length} layers, ${scene.entities.length} things, ${scene.events.length} rules, ${scene.camera.mode} camera`,
      ),
    ];
    return lines.join('\n');
  }

  readScene(id: string): string {
    const scene = sceneIn(this.need().raw, id);
    return JSON.stringify(scene, null, 2);
  }

  /** Re-reads the file, in case a person edited it in the meantime. */
  validate(): string {
    const session = this.need();
    ProjectSession.open(session.file);
    return `${session.file} is a valid PinForge project.`;
  }

  ruleVocabulary(kind?: 'triggers' | 'conditions' | 'actions'): string {
    const sections: [string, Record<string, CatalogEntry>][] = [
      ['triggers', TRIGGERS],
      ['conditions', CONDITIONS],
      ['actions', ACTIONS],
    ];
    return sections
      .filter(([name]) => !kind || name === kind)
      .map(([name, entries]) =>
        [
          `## ${name}`,
          ...Object.entries(entries).map(
            ([type, entry]) =>
              `${type} — ${entry.label}. ${entry.summary}` +
              (entry.modes.length < 2 ? ` Only for ${entry.modes.join(' or ')} movement.` : '') +
              `\n    ${JSON.stringify(entry.example)}`,
          ),
        ].join('\n'),
      )
      .join('\n\n');
  }

  createScene(request: SceneRequest): Change[] {
    return this.need().mutate((document) => {
      const scenes = listIn(document, 'scenes');
      if (scenes.some((one) => isObject(one) && one.id === request.id)) {
        throw new Error(`There is already a level called "${request.id}".`);
      }
      const tileSize = request.tileSize ?? 16;
      const layers = request.tileset
        ? [
            {
              id: 'ground',
              name: 'Ground',
              tileset: request.tileset,
              collides: true,
              drawEntitiesAfter: true,
              legend: { '.': null },
              rows: Array.from({ length: request.rows }, () => '.'.repeat(request.columns)),
            },
          ]
        : [];
      scenes.push(
        without({
          id: request.id,
          name: request.name,
          tileSize,
          size: { columns: request.columns, rows: request.rows },
          layers,
          entities: [],
          events: [],
        }),
      );
    });
  }

  createEntity(entity: JsonObject): Change[] {
    return this.need().mutate((document) => {
      const entities = listIn(document, 'entities');
      if (entities.some((one) => isObject(one) && one.id === entity.id)) {
        throw new Error(`There is already a kind of thing called "${String(entity.id)}".`);
      }
      entities.push(entity);
    });
  }

  modifyEntity(id: string, patch: JsonObject): Change[] {
    return this.need().mutate((document) => {
      const entity = listIn(document, 'entities').find(
        (one): one is JsonObject => isObject(one) && one.id === id,
      );
      if (!entity) throw new Error(`There is no kind of thing called "${id}".`);
      merge(entity, patch);
    });
  }

  placeEntity(scene: string, instance: JsonObject): Change[] {
    return this.need().mutate((document) => {
      const entities = listIn(sceneIn(document, scene), 'entities');
      if (entities.some((one) => isObject(one) && one.id === instance.id)) {
        throw new Error(`"${scene}" already holds something called "${String(instance.id)}".`);
      }
      entities.push(instance);
    });
  }

  moveEntity(scene: string, id: string, x: number, y: number): Change[] {
    return this.need().mutate((document) => {
      const instance = listIn(sceneIn(document, scene), 'entities').find(
        (one): one is JsonObject => isObject(one) && one.id === id,
      );
      if (!instance) throw new Error(`"${scene}" holds nothing called "${id}".`);
      instance.x = x;
      instance.y = y;
    });
  }

  removeEntity(scene: string, id: string): Change[] {
    return this.need().mutate((document) => {
      const sceneObject = sceneIn(document, scene);
      const entities = listIn(sceneObject, 'entities');
      const index = entities.findIndex((one) => isObject(one) && one.id === id);
      if (index < 0) throw new Error(`"${scene}" holds nothing called "${id}".`);
      entities.splice(index, 1);
    });
  }

  /**
   * Paints a rectangle of tiles. The file stores a layer as characters and a
   * legend, so a tile number that has no character yet is given one rather than
   * being refused.
   */
  paintTiles(request: PaintRequest): Change[] {
    return this.need().mutate((document) => {
      const scene = sceneIn(document, request.scene);
      const layer = listIn(scene, 'layers').find(
        (one): one is JsonObject => isObject(one) && one.id === request.layer,
      );
      if (!layer) throw new Error(`"${request.scene}" has no layer called "${request.layer}".`);

      const legend = isObject(layer.legend) ? layer.legend : {};
      const rows = Array.isArray(layer.rows) ? [...(layer.rows as string[])] : [];
      const character = characterFor(legend, request.tile);
      const width = request.width ?? 1;
      const height = request.height ?? 1;

      for (let downwards = 0; downwards < height; downwards += 1) {
        const rowIndex = request.row + downwards;
        const line = rows[rowIndex];
        if (typeof line !== 'string') {
          throw new Error(`Row ${rowIndex} is outside "${request.layer}".`);
        }
        const characters = [...line];
        for (let across = 0; across < width; across += 1) {
          const columnIndex = request.column + across;
          if (columnIndex < 0 || columnIndex >= characters.length) {
            throw new Error(`Column ${columnIndex} is outside "${request.layer}".`);
          }
          characters[columnIndex] = character;
        }
        rows[rowIndex] = characters.join('');
      }

      layer.legend = legend;
      layer.rows = rows;
    });
  }

  addRule(rule: JsonObject, scene?: string): Change[] {
    return this.need().mutate((document) => {
      const owner = scene ? sceneIn(document, scene) : document;
      const rules = listIn(owner, scene ? 'events' : 'globalEvents');
      if (rules.some((one) => isObject(one) && one.id === rule.id)) {
        throw new Error(`There is already a rule called "${String(rule.id)}" here.`);
      }
      rules.push(rule);
    });
  }

  removeRule(id: string, scene?: string): Change[] {
    return this.need().mutate((document) => {
      const owner = scene ? sceneIn(document, scene) : document;
      const rules = listIn(owner, scene ? 'events' : 'globalEvents');
      const index = rules.findIndex((one) => isObject(one) && one.id === id);
      if (index < 0) throw new Error(`There is no rule called "${id}" here.`);
      rules.splice(index, 1);
    });
  }

  addVariable(variable: JsonObject): Change[] {
    return this.need().mutate((document) => {
      const variables = listIn(document, 'variables');
      if (variables.some((one) => isObject(one) && one.id === variable.id)) {
        throw new Error(`There is already a variable called "${String(variable.id)}".`);
      }
      variables.push(variable);
    });
  }

  addAsset(asset: JsonObject): Change[] {
    return this.need().mutate((document) => {
      const assets = listIn(document, 'assets');
      if (assets.some((one) => isObject(one) && one.id === asset.id)) {
        throw new Error(`There is already an asset called "${String(asset.id)}".`);
      }
      assets.push(asset);
    });
  }

  exportGame(out: string): string {
    const session = this.need();
    const html = buildHtml(inlineAssets(session.project, session.directory), readRuntimeBundle());
    const file = resolve(process.cwd(), out);
    writeFileSync(file, html);
    return `Exported to ${file} (${(html.length / 1024).toFixed(0)} kB), one file with nothing else to upload.`;
  }

  desktopBuild(out: string | undefined): string {
    // Every change is written to the file as it is made, so the layout is of
    // the game as it stands, with nothing to save first.
    const laid = scaffoldDesktop(this.need().file, out);
    return [
      `Laid out ${laid.name} for the desktop in ${laid.directory} (${laid.files.length} files).`,
      `Building it needs Rust: cd ${laid.directory}/src-tauri && cargo build --release`,
      'That step has to run on the kind of computer the program is for, so a',
      'Windows .exe is built on Windows. See the README it wrote.',
    ].join('\n');
  }

  report(changes: readonly Change[]): string {
    const described = describeChanges(changes);
    const warnings = this.session?.warnings ?? [];
    if (warnings.length === 0) return described;
    // A warning is not a refusal, so the change went through. Saying so is the
    // whole point of having warned.
    return [described, '', 'Worth a look:', ...warnings.map((one) => `- ${one.message}`)].join(
      '\n',
    );
  }

  private need(): ProjectSession {
    if (!this.session) {
      throw new Error('No project is open. Use open_project or create_project first.');
    }
    return this.session;
  }
}

const PREFERRED_CHARACTERS = '#=^+*ox';
const FALLBACK_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function characterFor(legend: JsonObject, tile: number | null): string {
  for (const [key, value] of Object.entries(legend)) {
    if ((value ?? null) === tile) return key;
  }
  const used = new Set(Object.keys(legend));
  const candidates =
    tile === null
      ? ['.', ...FALLBACK_CHARACTERS]
      : [...PREFERRED_CHARACTERS, ...FALLBACK_CHARACTERS];
  const free = candidates.find((character) => !used.has(character));
  if (!free) {
    throw new Error(
      'This layer already uses every character it can. Split it into two layers to hold more kinds of tile.',
    );
  }
  legend[free] = tile;
  return free;
}

function merge(target: JsonObject, patch: JsonObject): void {
  for (const [key, value] of Object.entries(patch)) {
    const existing = target[key];
    if (isObject(value) && isObject(existing)) merge(existing, value);
    else target[key] = value;
  }
}

/** Drops keys whose value is undefined, so they do not reach the file. */
function without(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, one]) => one !== undefined));
}
