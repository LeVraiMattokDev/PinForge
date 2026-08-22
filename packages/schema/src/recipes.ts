import { EntityInstance, EntityPrototype } from './entities.js';
import { EventRule } from './events/rules.js';
import { VariableDefinition } from './variables.js';
import type { Project } from './project.js';
import type { Scene } from './scenes.js';

/**
 * Ready-made things. A recipe drops a whole working behaviour into a game in one
 * go: the kind of thing, the copy of it in the level, any variable it needs, and
 * the rules that make it do something.
 *
 * This exists because assembling the ordinary furniture of a game out of single
 * sentences is the slowest part of using PinForge, and it is slowest for exactly
 * the person the engine is for. A villager you can talk to is six rules and one
 * countdown to someone who already knows the vocabulary, and an afternoon to
 * someone who does not.
 *
 * A recipe only ever adds. It never edits or removes what is already there, so
 * applying one can always be undone in a single step, and applying the same one
 * twice gives you two of them rather than a broken game.
 */
export interface Recipe {
  readonly id: string;
  /** What the editor offers, in the words a person would use. */
  readonly label: string;
  /** One sentence saying what you get, written for someone who has never made a game. */
  readonly summary: string;
  /** What to expect once it is in, and what to change next. */
  readonly afterwards: string;
  add(project: Project, sceneId: string): Project;
}

// --- picking names and looks -------------------------------------------------

/** The first free name of this shape: "villager", then "villager-2", and so on. */
export function freeId(taken: readonly string[], stem: string): string {
  if (!taken.includes(stem)) return stem;
  for (let number = 2; number < 1000; number += 1) {
    if (!taken.includes(`${stem}-${number}`)) return `${stem}-${number}`;
  }
  throw new Error(`There are already a thousand things called ${stem}.`);
}

/**
 * The name for a copy of something: always the kind's name and a number, never
 * the bare name, because a copy that shadows a kind is refused — rules could
 * not tell the two apart.
 */
export function freeCopyId(taken: readonly string[], prototypeId: string): string {
  for (let number = 1; number < 1000; number += 1) {
    const id = `${prototypeId}-${number}`;
    if (!taken.includes(id)) return id;
  }
  throw new Error(`There are already a thousand copies of ${prototypeId}.`);
}

function everyEntityId(project: Project): string[] {
  return [
    ...project.entities.map((one) => one.id),
    ...project.scenes.flatMap((scene) => scene.entities.map((one) => one.id)),
  ];
}

function everyRuleId(project: Project): string[] {
  return [
    ...project.globalEvents.map((one) => one.id),
    ...project.scenes.flatMap((scene) => scene.events.map((one) => one.id)),
  ];
}

/** The entity the player drives, which is what most recipes have to be about. */
function playerOf(project: Project): EntityPrototype {
  const player = project.entities.find((one) => one.components.movement?.controlledBy === 'player');
  if (!player) {
    throw new Error(
      'This game has nothing the player drives yet, so there is nothing for a ready-made thing to be about. Make a kind of thing with movement first.',
    );
  }
  return player;
}

/**
 * How something new looks before it has any art of its own: its name, written
 * on it.
 *
 * Borrowing a picture from elsewhere in the game was the other option, and it
 * is worse: four ready-made things all wearing the same coin is four things
 * nobody can tell apart, and it reads as finished when it is not. A word reads
 * as a placeholder, says which thing is which at a glance, and needs no picture
 * to exist yet. Swap it for art with "give it a picture instead" in the
 * inspector.
 */
function lookOf(label: string) {
  return {
    size: { width: Math.max(16, label.length * 7), height: 12 },
    draw: { text: { content: label, size: 'small' } },
  };
}

/**
 * Somewhere sensible to put a new thing: partway into the level, and two tiles
 * further along than the last thing put there, so several ready-made things in
 * a row do not land on top of one another.
 */
function spotIn(scene: Scene) {
  const across = scene.size.columns * scene.tileSize;
  const down = scene.size.rows * scene.tileSize;
  const step = (scene.entities.length % 8) * scene.tileSize * 2;
  return {
    x: Math.round(Math.min(across - scene.tileSize * 3, scene.tileSize * 2 + step)),
    y: Math.round(down / 2),
  };
}

// --- putting the pieces in ---------------------------------------------------

interface Additions {
  readonly prototype: EntityPrototype;
  readonly instance: EntityInstance;
  readonly rules: readonly EventRule[];
  readonly variables?: readonly VariableDefinition[];
}

function put(project: Project, sceneId: string, additions: Additions): Project {
  const existing = new Set(project.variables.map((one) => one.id));
  return {
    ...project,
    variables: [
      ...project.variables,
      ...(additions.variables ?? []).filter((one) => !existing.has(one.id)),
    ],
    entities: [...project.entities, additions.prototype],
    scenes: project.scenes.map((scene) =>
      scene.id === sceneId
        ? {
            ...scene,
            entities: [...scene.entities, additions.instance],
            events: [...scene.events, ...additions.rules],
          }
        : scene,
    ),
  };
}

function sceneOf(project: Project, sceneId: string): Scene {
  const scene = project.scenes.find((one) => one.id === sceneId);
  if (!scene) throw new Error(`There is no level called "${sceneId}".`);
  return scene;
}

/** The level after this one, for anything that finishes a level. */
function nextSceneId(project: Project, sceneId: string): string | undefined {
  const at = project.scenes.findIndex((one) => one.id === sceneId);
  return at >= 0 ? project.scenes[at + 1]?.id : undefined;
}

function firstSoundId(project: Project): string | undefined {
  return project.assets.find((one) => one.kind === 'sound')?.id;
}

/** A control the player already has, preferring the one meant for doing things. */
function talkControl(project: Project): string {
  const named = Object.keys(project.settings.input);
  return named.includes('action') ? 'action' : (named[0] ?? 'action');
}

// --- the recipes -------------------------------------------------------------

const TALKING_NPC: Recipe = {
  id: 'talking-npc',
  label: 'Someone to talk to',
  summary:
    'A character standing in the level. Walk into them and the game holds still while they say two lines, one press at a time.',
  afterwards:
    'Change what they say in the rules, and give them their own picture under Pictures and sounds.',
  add(project, sceneId) {
    const player = playerOf(project);
    const scene = sceneOf(project, sceneId);
    const control = talkControl(project);
    const id = freeId(everyEntityId(project), 'villager');
    const look = lookOf('Villager');

    const prototype = EntityPrototype.parse({
      id,
      name: 'Villager',
      size: look.size,
      components: { ...look.draw, collider: { kind: 'trigger', collidesWithTiles: false } },
    });
    const instance = EntityInstance.parse({
      id: freeCopyId(everyEntityId(project), id),
      prototype: id,
      ...spotIn(scene),
    });
    const rule = EventRule.parse({
      id: freeId(everyRuleId(project), `talk-to-${id}`),
      name: `Talk to the ${prototype.name ?? id}`,
      when: { type: 'collides', subject: player.id, with: id },
      then: [
        // Holding the game still is what makes this readable: nothing moves, no
        // timer runs, and the only thing still heard is the player pressing on.
        { type: 'pause-game' },
        { type: 'show-message', text: `Hello there! Press ${control} to carry on.`, seconds: 4 },
        { type: 'wait-for-press', action: control },
        { type: 'show-message', text: 'Mind yourself out there.', seconds: 4 },
        { type: 'wait-for-press', action: control },
        { type: 'resume-game' },
      ],
    });
    return put(project, sceneId, { prototype, instance, rules: [rule] });
  },
};

const PATROLLING_ENEMY: Recipe = {
  id: 'patrolling-enemy',
  label: 'An enemy that walks about',
  summary:
    'Something that walks back and forth on its own, turning at walls, and costs you the level if it catches you. In a game with gravity you can also land on it to squash it.',
  afterwards: 'Change how fast it walks, and which way it sets off, in its movement settings.',
  add(project, sceneId) {
    const player = playerOf(project);
    const scene = sceneOf(project, sceneId);
    const mode = player.components.movement?.mode ?? 'platform';
    const id = freeId(everyEntityId(project), 'wanderer');
    const look = lookOf('Enemy');

    const prototype = EntityPrototype.parse({
      id,
      name: 'Wanderer',
      size: look.size,
      tags: ['enemy'],
      components: {
        ...look.draw,
        collider: { kind: 'solid', collidesWithTiles: true },
        movement: {
          mode,
          controlledBy: 'rules',
          maxSpeed: 40,
          acceleration: 0,
          patrol: { direction: 'left' },
          ...(mode === 'platform' ? { jumpHeight: 0 } : {}),
        },
      },
    });
    const instance = EntityInstance.parse({
      id: freeCopyId(everyEntityId(project), id),
      prototype: id,
      ...spotIn(scene),
    });

    const taken = everyRuleId(project);
    const rules = [
      ...(mode === 'platform'
        ? [
            EventRule.parse({
              id: freeId(taken, `squash-${id}`),
              name: `Land on a ${prototype.name ?? id} to squash it`,
              when: { type: 'collides', subject: player.id, with: id },
              if: [{ type: 'is-falling', target: '$self' }],
              then: [
                { type: 'destroy', target: '$other' },
                { type: 'jump', target: '$self' },
              ],
            }),
          ]
        : []),
      EventRule.parse({
        id: freeId([...taken, `squash-${id}`], `caught-by-${id}`),
        name: `Walking into a ${prototype.name ?? id} costs the level`,
        when: { type: 'collides', subject: player.id, with: id },
        ...(mode === 'platform'
          ? { if: [{ type: 'is-falling', target: '$self', negate: true }] }
          : {}),
        then: [
          { type: 'show-message', text: 'It got you!', seconds: 1 },
          { type: 'wait', seconds: 1 },
          { type: 'restart-scene' },
        ],
      }),
    ];
    return put(project, sceneId, { prototype, instance, rules });
  },
};

const COLLECTIBLE: Recipe = {
  id: 'collectible',
  label: 'Something to collect',
  summary: 'A pickup that disappears when you touch it and adds one to your score.',
  afterwards: 'Place more copies of it around the level from Kinds of thing.',
  add(project, sceneId) {
    const player = playerOf(project);
    const scene = sceneOf(project, sceneId);
    const id = freeId(everyEntityId(project), 'treasure');
    const look = lookOf('Treasure');
    const sound = firstSoundId(project);
    const hasScore = project.variables.some((one) => one.id === 'score' && one.type === 'number');

    const prototype = EntityPrototype.parse({
      id,
      name: 'Treasure',
      size: look.size,
      tags: ['pickup'],
      components: { ...look.draw, collider: { kind: 'trigger', collidesWithTiles: false } },
    });
    const instance = EntityInstance.parse({
      id: freeCopyId(everyEntityId(project), id),
      prototype: id,
      ...spotIn(scene),
    });
    const rule = EventRule.parse({
      id: freeId(everyRuleId(project), `collect-${id}`),
      name: `Collect a ${prototype.name ?? id}`,
      when: { type: 'collides', subject: player.id, with: id },
      then: [
        ...(sound ? [{ type: 'play-sound', sound }] : []),
        { type: 'change-variable', variable: 'score', operator: 'add', value: 1 },
        { type: 'destroy', target: '$other' },
      ],
    });
    return put(project, sceneId, {
      prototype,
      instance,
      rules: [rule],
      variables: hasScore
        ? []
        : [VariableDefinition.parse({ id: 'score', name: 'Score', type: 'number', initial: 0 })],
    });
  },
};

const LEVEL_EXIT: Recipe = {
  id: 'level-exit',
  label: 'A way to finish the level',
  summary:
    'A doorway that ends the level when you reach it, and takes you to the next one if there is one.',
  afterwards: 'Put it wherever the level should end, and add a condition if it needs earning.',
  add(project, sceneId) {
    const player = playerOf(project);
    const scene = sceneOf(project, sceneId);
    const id = freeId(everyEntityId(project), 'way-out');
    const look = lookOf('Way out');
    const next = nextSceneId(project, sceneId);

    const prototype = EntityPrototype.parse({
      id,
      name: 'Way out',
      size: look.size,
      components: { ...look.draw, collider: { kind: 'trigger', collidesWithTiles: false } },
    });
    const instance = EntityInstance.parse({
      id: freeCopyId(everyEntityId(project), id),
      prototype: id,
      ...spotIn(scene),
    });
    const rule = EventRule.parse({
      id: freeId(everyRuleId(project), `finish-${sceneId}`),
      name: 'Finish the level',
      when: { type: 'collides', subject: player.id, with: id },
      once: true,
      then: [
        { type: 'show-message', text: 'You made it!', seconds: 2 },
        { type: 'wait', seconds: 2 },
        next === undefined ? { type: 'restart-scene' } : { type: 'go-to-scene', scene: next },
      ],
    });
    return put(project, sceneId, { prototype, instance, rules: [rule] });
  },
};

export const RECIPES: readonly Recipe[] = [TALKING_NPC, PATROLLING_ENEMY, COLLECTIBLE, LEVEL_EXIT];

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((one) => one.id === id);
}
