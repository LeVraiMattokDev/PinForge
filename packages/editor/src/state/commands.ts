import type {
  Asset,
  EntityInstance,
  EntityPrototype,
  EventRule,
  Project,
  Scene,
  TileLayer,
  Tileset,
  VariableDefinition,
} from '@pinforge/schema';

/**
 * Every change to a project goes through a command, from the very first one.
 *
 * A command is a pure function from one project to the next. Undo is then the
 * previous project, and because the updates share everything they do not
 * change, keeping a hundred of them costs almost nothing. Retrofitting this
 * later would be a rewrite, which is why it exists before any user interface
 * does.
 */
export interface Command {
  /** What the user did, in their words. Shown next to undo. */
  readonly label: string;
  /**
   * Consecutive commands with the same key collapse into one step, so dragging
   * a brush across twenty tiles is one undo rather than twenty.
   */
  readonly mergeKey?: string;
  run(project: Project): Project;
}

function command(label: string, run: (project: Project) => Project, mergeKey?: string): Command {
  return mergeKey === undefined ? { label, run } : { label, mergeKey, run };
}

// --- helpers ---------------------------------------------------------------

function withScene(project: Project, id: string, change: (scene: Scene) => Scene): Project {
  return {
    ...project,
    scenes: project.scenes.map((scene) => (scene.id === id ? change(scene) : scene)),
  };
}

function withLayer(scene: Scene, id: string, change: (layer: TileLayer) => TileLayer): Scene {
  return {
    ...scene,
    layers: scene.layers.map((layer) => (layer.id === id ? change(layer) : layer)),
  };
}

function replaceIn<T extends { id: string }>(list: readonly T[], value: T): T[] {
  return list.map((one) => (one.id === value.id ? value : one));
}

// --- the project as a whole -------------------------------------------------

export function setProjectName(name: string): Command {
  return command(
    'Rename the game',
    (project) => ({ ...project, meta: { ...project.meta, name } }),
    'project-name',
  );
}

export function setProjectMeta(meta: Partial<Project['meta']>): Command {
  return command(
    'Change the game details',
    (project) => ({ ...project, meta: { ...project.meta, ...meta } }),
    'project-meta',
  );
}

export function setSettings(settings: Partial<Project['settings']>): Command {
  return command(
    'Change the settings',
    (project) => ({ ...project, settings: { ...project.settings, ...settings } }),
    'settings',
  );
}

export function setInputAction(action: string, keys: string[]): Command {
  return command(`Change the ${action} control`, (project) => ({
    ...project,
    settings: { ...project.settings, input: { ...project.settings.input, [action]: keys } },
  }));
}

// --- variables --------------------------------------------------------------

export function addVariable(variable: VariableDefinition): Command {
  return command(`Add the variable ${variable.id}`, (project) => ({
    ...project,
    variables: [...project.variables, variable],
  }));
}

export function updateVariable(variable: VariableDefinition): Command {
  return command(
    `Change the variable ${variable.id}`,
    (project) => ({
      ...project,
      variables: replaceIn(project.variables, variable),
    }),
    `variable-${variable.id}`,
  );
}

export function removeVariable(id: string): Command {
  return command(`Remove the variable ${id}`, (project) => ({
    ...project,
    variables: project.variables.filter((one) => one.id !== id),
  }));
}

// --- assets and tilesets ----------------------------------------------------

export function addAsset(asset: Asset): Command {
  return command(`Add ${asset.name ?? asset.id}`, (project) => ({
    ...project,
    assets: [...project.assets, asset],
  }));
}

export function removeAsset(id: string): Command {
  return command(`Remove ${id}`, (project) => ({
    ...project,
    assets: project.assets.filter((one) => one.id !== id),
  }));
}

export function addTileset(tileset: Tileset): Command {
  return command(`Add the tileset ${tileset.id}`, (project) => ({
    ...project,
    tilesets: [...project.tilesets, tileset],
  }));
}

export function updateTileset(tileset: Tileset): Command {
  return command(
    `Change the tileset ${tileset.id}`,
    (project) => ({
      ...project,
      tilesets: replaceIn(project.tilesets, tileset),
    }),
    `tileset-${tileset.id}`,
  );
}

// --- kinds of thing ---------------------------------------------------------

export function addPrototype(prototype: EntityPrototype): Command {
  return command(`Add ${prototype.name ?? prototype.id}`, (project) => ({
    ...project,
    entities: [...project.entities, prototype],
  }));
}

export function updatePrototype(prototype: EntityPrototype): Command {
  return command(
    `Change ${prototype.name ?? prototype.id}`,
    (project) => ({
      ...project,
      entities: replaceIn(project.entities, prototype),
    }),
    `prototype-${prototype.id}`,
  );
}

export function removePrototype(id: string): Command {
  return command(`Remove ${id}`, (project) => ({
    ...project,
    entities: project.entities.filter((one) => one.id !== id),
    // Copies of something that no longer exists would stop the game running.
    scenes: project.scenes.map((scene) => ({
      ...scene,
      entities: scene.entities.filter((instance) => instance.prototype !== id),
    })),
  }));
}

// --- levels -----------------------------------------------------------------

export function addScene(scene: Scene): Command {
  return command(`Add the level ${scene.name ?? scene.id}`, (project) => ({
    ...project,
    scenes: [...project.scenes, scene],
  }));
}

export function updateScene(scene: Scene): Command {
  return command(
    `Change the level ${scene.name ?? scene.id}`,
    (project) => ({
      ...project,
      scenes: replaceIn(project.scenes, scene),
    }),
    `scene-${scene.id}`,
  );
}

export function removeScene(id: string): Command {
  return command(`Remove the level ${id}`, (project) => {
    if (project.scenes.length <= 1) throw new Error('A game needs at least one level.');
    const scenes = project.scenes.filter((one) => one.id !== id);
    const startScene =
      project.settings.startScene === id ? scenes[0]!.id : project.settings.startScene;
    return { ...project, scenes, settings: { ...project.settings, startScene } };
  });
}

/**
 * Growing or shrinking a level has to keep every layer the right shape, because
 * a row of the wrong length is not a valid project.
 */
export function resizeScene(id: string, columns: number, rows: number): Command {
  return command(
    'Change the size of the level',
    (project) =>
      withScene(project, id, (scene) => ({
        ...scene,
        size: { columns, rows },
        layers: scene.layers.map((layer) => ({
          ...layer,
          rows: Array.from({ length: rows }, (_, row) => {
            const existing = layer.rows[row] ?? '';
            const empty = emptyCharacter(layer);
            return existing.length >= columns
              ? existing.slice(0, columns)
              : existing + empty.repeat(columns - existing.length);
          }),
        })),
      })),
    `resize-${id}`,
  );
}

export function addLayer(sceneId: string, layer: TileLayer): Command {
  return command(`Add the layer ${layer.name ?? layer.id}`, (project) =>
    withScene(project, sceneId, (scene) => ({ ...scene, layers: [...scene.layers, layer] })),
  );
}

export function updateLayer(sceneId: string, layer: TileLayer): Command {
  return command(
    `Change the layer ${layer.name ?? layer.id}`,
    (project) =>
      withScene(project, sceneId, (scene) => ({
        ...scene,
        layers: replaceIn(scene.layers, layer),
      })),
    `layer-${sceneId}-${layer.id}`,
  );
}

export function removeLayer(sceneId: string, layerId: string): Command {
  return command(`Remove the layer ${layerId}`, (project) =>
    withScene(project, sceneId, (scene) => ({
      ...scene,
      layers: scene.layers.filter((one) => one.id !== layerId),
    })),
  );
}

/**
 * Paints a rectangle of one tile. The layer stores characters and a legend, so a
 * tile with no character yet is given one rather than refused.
 */
export function paintTiles(
  sceneId: string,
  layerId: string,
  column: number,
  row: number,
  tile: number | null,
  size = 1,
): Command {
  return command(
    tile === null ? 'Rub out tiles' : 'Paint tiles',
    (project) =>
      withScene(project, sceneId, (scene) =>
        withLayer(scene, layerId, (layer) => {
          const legend = { ...layer.legend };
          const character = characterFor(legend, tile);
          const rows = [...layer.rows];
          for (let down = 0; down < size; down += 1) {
            const rowIndex = row + down;
            const line = rows[rowIndex];
            if (line === undefined) continue;
            const characters = [...line];
            for (let across = 0; across < size; across += 1) {
              const columnIndex = column + across;
              if (columnIndex < 0 || columnIndex >= characters.length) continue;
              characters[columnIndex] = character;
            }
            rows[rowIndex] = characters.join('');
          }
          return { ...layer, legend, rows };
        }),
      ),
    `paint-${sceneId}-${layerId}`,
  );
}

// --- things in a level ------------------------------------------------------

export function placeInstance(sceneId: string, instance: EntityInstance): Command {
  return command(`Place ${instance.prototype}`, (project) =>
    withScene(project, sceneId, (scene) => ({ ...scene, entities: [...scene.entities, instance] })),
  );
}

export function updateInstance(sceneId: string, instance: EntityInstance): Command {
  return command(
    `Change ${instance.id}`,
    (project) =>
      withScene(project, sceneId, (scene) => ({
        ...scene,
        entities: replaceIn(scene.entities, instance),
      })),
    `instance-${sceneId}-${instance.id}`,
  );
}

export function moveInstance(sceneId: string, id: string, x: number, y: number): Command {
  return command(
    `Move ${id}`,
    (project) =>
      withScene(project, sceneId, (scene) => ({
        ...scene,
        entities: scene.entities.map((one) => (one.id === id ? { ...one, x, y } : one)),
      })),
    `move-${sceneId}-${id}`,
  );
}

export function removeInstance(sceneId: string, id: string): Command {
  return command(`Remove ${id}`, (project) =>
    withScene(project, sceneId, (scene) => ({
      ...scene,
      entities: scene.entities.filter((one) => one.id !== id),
    })),
  );
}

// --- rules -----------------------------------------------------------------

export function addRule(rule: EventRule, sceneId: string | undefined): Command {
  return command(`Add the rule ${rule.name ?? rule.id}`, (project) =>
    sceneId === undefined
      ? { ...project, globalEvents: [...project.globalEvents, rule] }
      : withScene(project, sceneId, (scene) => ({ ...scene, events: [...scene.events, rule] })),
  );
}

export function updateRule(rule: EventRule, sceneId: string | undefined): Command {
  return command(
    `Change the rule ${rule.name ?? rule.id}`,
    (project) =>
      sceneId === undefined
        ? { ...project, globalEvents: replaceIn(project.globalEvents, rule) }
        : withScene(project, sceneId, (scene) => ({
            ...scene,
            events: replaceIn(scene.events, rule),
          })),
    `rule-${sceneId ?? 'global'}-${rule.id}`,
  );
}

export function removeRule(id: string, sceneId: string | undefined): Command {
  return command(`Remove the rule ${id}`, (project) =>
    sceneId === undefined
      ? { ...project, globalEvents: project.globalEvents.filter((one) => one.id !== id) }
      : withScene(project, sceneId, (scene) => ({
          ...scene,
          events: scene.events.filter((one) => one.id !== id),
        })),
  );
}

export function moveRule(id: string, sceneId: string | undefined, by: number): Command {
  return command('Reorder the rules', (project) => {
    const reorder = (rules: readonly EventRule[]): EventRule[] => {
      const from = rules.findIndex((one) => one.id === id);
      const to = from + by;
      if (from < 0 || to < 0 || to >= rules.length) return [...rules];
      const next = [...rules];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      return next;
    };
    return sceneId === undefined
      ? { ...project, globalEvents: reorder(project.globalEvents) }
      : withScene(project, sceneId, (scene) => ({ ...scene, events: reorder(scene.events) }));
  });
}

// --- legend characters ------------------------------------------------------

const PREFERRED = '#=^+*ox~';
const FALLBACK = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function emptyCharacter(layer: TileLayer): string {
  for (const [key, value] of Object.entries(layer.legend)) {
    if (value === null) return key;
  }
  return '.';
}

export function characterFor(legend: Record<string, number | null>, tile: number | null): string {
  for (const [key, value] of Object.entries(legend)) {
    if (value === tile) return key;
  }
  const used = new Set(Object.keys(legend));
  const candidates = tile === null ? ['.', ...FALLBACK] : [...PREFERRED, ...FALLBACK];
  const free = candidates.find((character) => !used.has(character));
  if (!free) {
    throw new Error('This layer already uses every character it can. Add another layer.');
  }
  legend[free] = tile;
  return free;
}
