import * as z from 'zod';
import { KNOWN_TILE_TAGS } from './tilesets.js';
import { MOVEMENT_FIELDS_BY_MODE, MOVEMENT_MODES } from './components.js';
import {
  ProjectFormatError,
  ProjectValidationError,
  errorsAmong,
  type ValidationIssue,
} from './errors.js';
import { Project } from './project.js';
import { ACTIONS, CONDITIONS, TRIGGERS, type CatalogEntry } from './events/catalog.js';
import { parseEntityRef } from './events/refs.js';
import { migrateToCurrent } from './migrate.js';
import type { Action } from './events/actions.js';
import type { Condition } from './events/conditions.js';
import type { EntityInstance, EntityPrototype } from './entities.js';
import type { EventRule } from './events/rules.js';
import type { Scene } from './scenes.js';
import type { Trigger } from './events/triggers.js';
import type { Value } from './common.js';
import type { VariableDefinition } from './variables.js';

/**
 * Validation happens in two passes, and they are kept apart on purpose.
 *
 *   parseProject     is the shape of the document: types, required fields,
 *                    unknown keys, ranges. Zod does it.
 *   validateProject  is whether the document makes sense: does the scene the
 *                    game starts on exist, is that tile character in the
 *                    legend, does that rule ask a coin whether it is on the
 *                    ground. Zod cannot see any of this, because every check
 *                    needs the rest of the document.
 *
 * The second pass never throws on its own. It returns a list, so the editor can
 * show ten problems at once and the MCP server can refuse a mutation with all
 * of the reasons rather than the first one.
 */

/** Reads a document that is already at the current format version. */
export function parseProject(input: unknown): Project {
  const result = Project.safeParse(input);
  if (!result.success) {
    throw new ProjectFormatError(
      'This file is not a valid PinForge project.',
      describeZodIssues(result.error),
    );
  }
  return result.data;
}

export function describeZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map((segment) => String(segment)).join('/');
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });
}

/** Migrates, parses and validates. This is how every tool should open a file. */
export function loadProject(input: unknown): { project: Project; applied: readonly string[] } {
  const { document, applied } = migrateToCurrent(input);
  const project = parseProject(document);
  assertValidProject(project);
  return { project, applied };
}

export function assertValidProject(project: Project): void {
  const errors = errorsAmong(validateProject(project));
  if (errors.length > 0) {
    throw new ProjectValidationError(
      'This project has problems that would stop it running.',
      errors,
    );
  }
}

class Issues {
  private readonly collected: ValidationIssue[] = [];

  add(path: string, code: string, message: string): void {
    this.collected.push({ path, code, message, severity: 'error' });
  }

  /** Legal, and almost always a mistake. Never a refusal. */
  warn(path: string, code: string, message: string): void {
    this.collected.push({ path, code, message, severity: 'warning' });
  }

  get list(): ValidationIssue[] {
    return this.collected;
  }
}

interface ProjectIndex {
  readonly images: Set<string>;
  readonly sounds: Set<string>;
  readonly tilesets: Map<string, { tileWidth: number; tileHeight: number }>;
  readonly prototypes: Map<string, EntityPrototype>;
  readonly scenes: Map<string, Scene>;
  readonly variables: Map<string, VariableDefinition>;
  readonly inputActions: Set<string>;
  readonly entityTags: Set<string>;
  readonly tileTags: Set<string>;
  readonly instancesAnywhere: Map<string, EntityInstance>;
  /** The most copies of a kind that can be in one level at once. */
  readonly mostCopiesOf: Map<string, number>;
  /** Kinds some rule creates while the game runs, so there can be more of them. */
  readonly spawnedKinds: Set<string>;
  readonly layersAnywhere: Set<string>;
  readonly ruleIdsAnywhere: Set<string>;
}

/** Where the names in a rule are looked up. */
interface RuleScope {
  readonly instances: Map<string, EntityInstance>;
  readonly layers: Set<string>;
  readonly ruleIds: Set<string>;
  readonly scene: Scene | undefined;
}

export function validateProject(project: Project): ValidationIssue[] {
  const issues = new Issues();
  const index = buildIndex(project);

  checkDuplicateIds(project.variables, '/variables', 'variable', issues);
  checkDuplicateIds(project.assets, '/assets', 'asset', issues);
  checkDuplicateIds(project.tilesets, '/tilesets', 'tileset', issues);
  checkDuplicateIds(project.entities, '/entities', 'entity', issues);
  checkDuplicateIds(project.scenes, '/scenes', 'scene', issues);
  checkDuplicateIds(project.globalEvents, '/globalEvents', 'rule', issues);

  if (!index.scenes.has(project.settings.startScene)) {
    issues.add(
      '/settings/startScene',
      'missing-scene',
      `The game starts on a level called "${project.settings.startScene}", which does not exist.`,
    );
  }

  checkTilesets(project, index, issues);
  checkPrototypes(project, index, issues);
  checkScenes(project, index, issues);

  const globalScope: RuleScope = {
    instances: index.instancesAnywhere,
    layers: index.layersAnywhere,
    ruleIds: index.ruleIdsAnywhere,
    scene: undefined,
  };
  project.globalEvents.forEach((rule, ruleIndex) => {
    checkRule(rule, `/globalEvents/${ruleIndex}`, globalScope, index, issues);
  });

  return issues.list;
}

function buildIndex(project: Project): ProjectIndex {
  const images = new Set<string>();
  const sounds = new Set<string>();
  for (const asset of project.assets) {
    (asset.kind === 'image' ? images : sounds).add(asset.id);
  }

  const tilesets = new Map<string, { tileWidth: number; tileHeight: number }>();
  const tileTags = new Set<string>(KNOWN_TILE_TAGS);
  for (const tileset of project.tilesets) {
    tilesets.set(tileset.id, { tileWidth: tileset.tileWidth, tileHeight: tileset.tileHeight });
    for (const tile of tileset.tiles) {
      for (const tag of tile.tags) tileTags.add(tag);
    }
  }

  const prototypes = new Map(project.entities.map((entity) => [entity.id, entity]));
  const entityTags = new Set<string>();
  for (const entity of project.entities) {
    for (const tag of entity.tags) entityTags.add(tag);
  }

  const scenes = new Map<string, Scene>();
  const instancesAnywhere = new Map<string, EntityInstance>();
  const layersAnywhere = new Set<string>();
  const ruleIdsAnywhere = new Set<string>(project.globalEvents.map((rule) => rule.id));
  const mostCopiesOf = new Map<string, number>();
  const spawnedKinds = new Set<string>();
  for (const rule of project.globalEvents) {
    for (const action of rule.then) if (action.type === 'spawn') spawnedKinds.add(action.entity);
  }
  for (const scene of project.scenes) {
    scenes.set(scene.id, scene);
    for (const layer of scene.layers) layersAnywhere.add(layer.id);
    for (const rule of scene.events) {
      ruleIdsAnywhere.add(rule.id);
      for (const action of rule.then) if (action.type === 'spawn') spawnedKinds.add(action.entity);
    }
    const hereByKind = new Map<string, number>();
    for (const instance of scene.entities) {
      if (!instancesAnywhere.has(instance.id)) instancesAnywhere.set(instance.id, instance);
      for (const tag of instance.tags) entityTags.add(tag);
      hereByKind.set(instance.prototype, (hereByKind.get(instance.prototype) ?? 0) + 1);
    }
    for (const [kind, count] of hereByKind) {
      mostCopiesOf.set(kind, Math.max(mostCopiesOf.get(kind) ?? 0, count));
    }
  }

  return {
    images,
    sounds,
    tilesets,
    prototypes,
    scenes,
    variables: new Map(project.variables.map((variable) => [variable.id, variable])),
    inputActions: new Set(Object.keys(project.settings.input)),
    entityTags,
    tileTags,
    instancesAnywhere,
    mostCopiesOf,
    spawnedKinds,
    layersAnywhere,
    ruleIdsAnywhere,
  };
}

function checkDuplicateIds(
  items: readonly { id: string }[],
  basePath: string,
  what: string,
  issues: Issues,
): void {
  const seen = new Map<string, number>();
  items.forEach((item, position) => {
    const first = seen.get(item.id);
    if (first === undefined) {
      seen.set(item.id, position);
      return;
    }
    issues.add(
      `${basePath}/${position}`,
      'duplicate-id',
      `There is already a ${what} with the id "${item.id}" at position ${first}. Ids must be unique.`,
    );
  });
}

function checkTilesets(project: Project, index: ProjectIndex, issues: Issues): void {
  project.tilesets.forEach((tileset, position) => {
    if (!index.images.has(tileset.image)) {
      issues.add(
        `/tilesets/${position}/image`,
        'missing-asset',
        `The tileset "${tileset.id}" uses an image called "${tileset.image}", which is not in the asset list.`,
      );
    }
  });
}

function checkPrototypes(project: Project, index: ProjectIndex, issues: Issues): void {
  project.entities.forEach((entity, position) => {
    const path = `/entities/${position}`;
    checkDuplicateIds(entity.properties, `${path}/properties`, 'property', issues);

    const sprite = entity.components.sprite;
    if (sprite) {
      if (!index.images.has(sprite.image)) {
        issues.add(
          `${path}/components/sprite/image`,
          'missing-asset',
          `"${entity.id}" uses an image called "${sprite.image}", which is not in the asset list.`,
        );
      }
      checkDuplicateIds(
        sprite.animations,
        `${path}/components/sprite/animations`,
        'animation',
        issues,
      );
      const names = new Set(sprite.animations.map((animation) => animation.id));
      if (sprite.defaultAnimation && !names.has(sprite.defaultAnimation)) {
        issues.add(
          `${path}/components/sprite/defaultAnimation`,
          'missing-animation',
          `"${entity.id}" starts on an animation called "${sprite.defaultAnimation}", which it does not have.`,
        );
      }
    }

    const movement = entity.components.movement;
    const patrol = movement?.patrol;
    if (movement && patrol) {
      const alongY = patrol.direction === 'up' || patrol.direction === 'down';
      if (movement.mode === 'platform' && alongY) {
        issues.add(
          `${path}/components/movement/patrol/direction`,
          'wrong-patrol-direction',
          `"${entity.id}" walks and jumps, so it cannot patrol ${patrol.direction}. Use left or right, or give it free movement.`,
        );
      }
      if (movement.mode === 'free') {
        if (movement.axes === 'horizontal' && alongY) {
          issues.add(
            `${path}/components/movement/patrol/direction`,
            'wrong-patrol-direction',
            `"${entity.id}" can only move across, so it cannot patrol ${patrol.direction}.`,
          );
        }
        if (movement.axes === 'vertical' && !alongY) {
          issues.add(
            `${path}/components/movement/patrol/direction`,
            'wrong-patrol-direction',
            `"${entity.id}" can only move up and down, so it cannot patrol ${patrol.direction}.`,
          );
        }
      }
    }

    if (entity.components.text && sprite) {
      issues.add(
        `${path}/components`,
        'conflicting-components',
        `"${entity.id}" has both a sprite and text. An entity draws one or the other, so remove one of them.`,
      );
    }
  });
}

function checkScenes(project: Project, index: ProjectIndex, issues: Issues): void {
  project.scenes.forEach((scene, position) => {
    const path = `/scenes/${position}`;
    checkDuplicateIds(scene.layers, `${path}/layers`, 'layer', issues);
    checkDuplicateIds(scene.entities, `${path}/entities`, 'entity', issues);
    checkDuplicateIds(scene.events, `${path}/events`, 'rule', issues);

    scene.layers.forEach((layer, layerPosition) => {
      const layerPath = `${path}/layers/${layerPosition}`;
      const tileset = index.tilesets.get(layer.tileset);
      if (!tileset) {
        issues.add(
          `${layerPath}/tileset`,
          'missing-tileset',
          `The layer "${layer.id}" uses a tileset called "${layer.tileset}", which does not exist.`,
        );
      } else if (tileset.tileWidth !== scene.tileSize || tileset.tileHeight !== scene.tileSize) {
        issues.add(
          `${layerPath}/tileset`,
          'tile-size-mismatch',
          `The layer "${layer.id}" uses a tileset with ${tileset.tileWidth} by ${tileset.tileHeight} pixel tiles, but this level is built on a ${scene.tileSize} pixel grid.`,
        );
      }

      if (layer.rows.length !== scene.size.rows) {
        issues.add(
          `${layerPath}/rows`,
          'wrong-row-count',
          `The layer "${layer.id}" has ${layer.rows.length} rows, but this level is ${scene.size.rows} tiles tall.`,
        );
      }
      layer.rows.forEach((row, rowPosition) => {
        if (row.length !== scene.size.columns) {
          issues.add(
            `${layerPath}/rows/${rowPosition}`,
            'wrong-row-length',
            `Row ${rowPosition} of the layer "${layer.id}" is ${row.length} characters long, but this level is ${scene.size.columns} tiles wide.`,
          );
          return;
        }
        const unknown = new Set(
          [...row].filter((character) => !Object.hasOwn(layer.legend, character)),
        );
        if (unknown.size > 0) {
          issues.add(
            `${layerPath}/rows/${rowPosition}`,
            'missing-legend-entry',
            `Row ${rowPosition} of the layer "${layer.id}" uses ${[...unknown]
              .map((character) => `"${character}"`)
              .join(', ')}, which the legend does not explain.`,
          );
        }
      });
    });

    scene.entities.forEach((instance, instancePosition) => {
      checkInstance(instance, `${path}/entities/${instancePosition}`, index, issues);
    });

    const scope: RuleScope = {
      instances: new Map(scene.entities.map((instance) => [instance.id, instance])),
      layers: new Set(scene.layers.map((layer) => layer.id)),
      ruleIds: new Set([
        ...scene.events.map((rule) => rule.id),
        ...project.globalEvents.map((rule) => rule.id),
      ]),
      scene,
    };

    if (scene.camera.mode === 'follow') {
      checkEntityRef(scene.camera.target, `${path}/camera/target`, scope, index, issues, {});
    }

    scene.events.forEach((rule, rulePosition) => {
      checkRule(rule, `${path}/events/${rulePosition}`, scope, index, issues);
    });
  });
}

function checkInstance(
  instance: EntityInstance,
  path: string,
  index: ProjectIndex,
  issues: Issues,
): void {
  const prototype = index.prototypes.get(instance.prototype);
  if (!prototype) {
    issues.add(
      `${path}/prototype`,
      'missing-prototype',
      `"${instance.id}" is a copy of "${instance.prototype}", which is not one of the project's entities.`,
    );
    return;
  }

  if (index.prototypes.has(instance.id)) {
    issues.add(
      `${path}/id`,
      'id-shadows-prototype',
      `"${instance.id}" is used both for this copy and for an entity in the project. Rules could not tell them apart, so give the copy a different id.`,
    );
  }

  for (const [name, value] of Object.entries(instance.properties)) {
    const definition = prototype.properties.find((property) => property.id === name);
    if (!definition) {
      issues.add(
        `${path}/properties/${name}`,
        'missing-property',
        `"${instance.id}" sets a property called "${name}", which "${prototype.id}" does not have.`,
      );
      continue;
    }
    if (!valueMatchesType(value, definition.type)) {
      issues.add(
        `${path}/properties/${name}`,
        'wrong-property-type',
        `The property "${name}" holds ${describeType(definition.type)}, but this copy sets it to ${JSON.stringify(value)}.`,
      );
    }
  }

  for (const [componentName, override] of Object.entries(instance.overrides)) {
    if (override === undefined) continue;
    if (!(componentName in prototype.components)) {
      issues.add(
        `${path}/overrides/${componentName}`,
        'missing-component',
        `"${instance.id}" changes the ${componentName} of "${prototype.id}", which has no ${componentName}.`,
      );
      continue;
    }
    if (componentName === 'movement') {
      const movement = prototype.components.movement;
      if (!movement) continue;
      const allowed = MOVEMENT_FIELDS_BY_MODE[movement.mode];
      for (const field of Object.keys(override)) {
        if (!allowed.includes(field)) {
          issues.add(
            `${path}/overrides/movement/${field}`,
            'wrong-movement-field',
            `"${field}" is not a setting of ${movement.mode} movement, which is what "${prototype.id}" uses.`,
          );
        }
      }
    }
  }
}

function valueMatchesType(value: Value, type: VariableDefinition['type']): boolean {
  if (type === 'number') return typeof value === 'number';
  if (type === 'boolean') return typeof value === 'boolean';
  return typeof value === 'string';
}

function describeType(type: VariableDefinition['type']): string {
  if (type === 'number') return 'a number';
  if (type === 'boolean') return 'true or false';
  return 'some text';
}

/**
 * What $self and $other stand for inside one rule: the trigger's subject, and
 * the other side of its collision. Keeping them here is what lets a rule about
 * $self still be checked before the game ever runs, and what makes "$other in a
 * rule about one entity" a mistake the editor can point at.
 */
interface RuleContext {
  readonly self?: string;
  readonly other?: string;
}

function checkEntityRef(
  ref: string,
  path: string,
  scope: RuleScope,
  index: ProjectIndex,
  issues: Issues,
  context: RuleContext,
): void {
  const resolved = parseEntityRef(ref);
  if (!resolved) return;

  switch (resolved.kind) {
    case 'self':
      if (context.self === undefined) {
        issues.add(
          path,
          'no-self',
          'This rule is not about one entity in particular, so $self has nothing to point at. Name the entity instead.',
        );
      }
      return;
    case 'other':
      if (context.other === undefined) {
        issues.add(
          path,
          'no-other',
          'There is no other entity here. $other only works in a rule about two things touching.',
        );
      }
      return;
    case 'tag':
      if (!index.entityTags.has(resolved.tag)) {
        issues.add(
          path,
          'missing-tag',
          `Nothing in this project carries the tag "${resolved.tag}".`,
        );
      }
      return;
    case 'named':
      if (!scope.instances.has(resolved.id) && !index.prototypes.has(resolved.id)) {
        issues.add(path, 'missing-entity', `There is no entity called "${resolved.id}" here.`);
      }
      return;
  }
}

/** The entity a trigger is about, when it is about one. */
function triggerSubject(trigger: Trigger): string | undefined {
  return 'subject' in trigger ? trigger.subject : undefined;
}

/** The second entity a trigger is about, when there is one. */
function triggerOther(trigger: Trigger): string | undefined {
  return trigger.type === 'collides' || trigger.type === 'collision-ends'
    ? trigger.with
    : undefined;
}

function checkRule(
  rule: EventRule,
  path: string,
  scope: RuleScope,
  index: ProjectIndex,
  issues: Issues,
): void {
  const context: RuleContext = {
    self: triggerSubject(rule.when),
    other: triggerOther(rule.when),
  };

  checkTrigger(rule.when, `${path}/when`, scope, index, issues, context);
  rule.if.forEach((condition, position) => {
    checkCondition(condition, `${path}/if/${position}`, scope, index, issues, context);
  });
  rule.then.forEach((action, position) => {
    checkAction(action, `${path}/then/${position}`, scope, index, issues, context);
  });
  checkGroupBroadcast(rule, path, scope, index, issues);
}

/** Every entity a condition asks something about, one entity at a time. */
function conditionSubjects(condition: Condition): string[] {
  switch (condition.type) {
    case 'property-is':
    case 'has-tag':
    case 'is-on-ground':
    case 'is-falling':
      return [condition.target];
    case 'distance-is':
      return [condition.from, condition.to];
    default:
      return [];
  }
}

/**
 * Whether a reference can really point at more than one entity at the same
 * time. A tag exists to name a group, so it always can. A kind only can when
 * the game actually has more than one of it: warning about "the player", of
 * which there is exactly one, would be noise, and a warning people learn to
 * ignore is worse than no warning at all.
 */
function pointsAtMany(ref: string, scope: RuleScope, index: ProjectIndex): boolean {
  const resolved = parseEntityRef(ref);
  if (!resolved) return false;
  if (resolved.kind === 'tag') return true;
  if (resolved.kind !== 'named') return false;
  // A copy in the level wins over a kind, and there is only ever one of those.
  if (scope.instances.has(resolved.id)) return false;
  if (!index.prototypes.has(resolved.id)) return false;
  const placed = index.mostCopiesOf.get(resolved.id) ?? 0;
  return placed > 1 || (placed > 0 && index.spawnedKinds.has(resolved.id));
}

/**
 * The trap two playtesters found independently, each with a working
 * reproduction: a rule that asks something about a group and then acts on the
 * same group.
 *
 *   IF hits-left of tag:enemy is at most 0 THEN remove tag:enemy
 *
 * The check is answered by "is there any one of them like this", and the action
 * is carried out on every single one. So one weak enemy running out of health
 * anywhere on screen removes the whole wave, healthy ones included — with no
 * error, and a game that carries on looking plausible. It is legal, and once in
 * a while it really is what someone meant, so it is said out loud rather than
 * refused.
 */
function checkGroupBroadcast(
  rule: EventRule,
  path: string,
  scope: RuleScope,
  index: ProjectIndex,
  issues: Issues,
): void {
  const asked = new Set<string>();
  for (const condition of rule.if) {
    for (const ref of conditionSubjects(condition)) {
      if (pointsAtMany(ref, scope, index)) asked.add(ref);
    }
  }
  if (asked.size === 0) return;

  const warned = new Set<string>();
  rule.then.forEach((action, position) => {
    if (!('target' in action)) return;
    const ref = action.target;
    if (!asked.has(ref) || warned.has(ref)) return;
    warned.add(ref);
    issues.warn(
      `${path}/then/${position}/target`,
      'group-broadcast',
      `This rule checks something about "${ref}" and then acts on "${ref}" as well. The check passes when any one of them matches, but the action runs on every single one, so one of them matching would affect all of them. If you meant only the one that matched, make the rule about that entity — a rule about two things touching, or about something being removed — and point at $self or $other instead.`,
    );
  });
}

function checkTrigger(
  trigger: Trigger,
  path: string,
  scope: RuleScope,
  index: ProjectIndex,
  issues: Issues,
  context: RuleContext,
): void {
  // A trigger is what gives $self and $other their meaning, so it cannot use
  // them itself. Its own references are looked up with nothing in scope.
  const bare: RuleContext = {};

  switch (trigger.type) {
    case 'every-seconds':
    case 'game-starts':
    case 'scene-starts':
    case 'every-frame':
      break;
    case 'action-pressed':
    case 'action-released':
      checkInputAction(trigger.action, `${path}/action`, index, issues);
      break;
    case 'variable-changes':
      checkVariable(trigger.variable, `${path}/variable`, index, issues);
      break;
    case 'collides':
    case 'collision-ends':
      checkEntityRef(trigger.subject, `${path}/subject`, scope, index, issues, bare);
      checkEntityRef(trigger.with, `${path}/with`, scope, index, issues, bare);
      break;
    case 'touches-tile':
    case 'blocked-by-tile':
      checkEntityRef(trigger.subject, `${path}/subject`, scope, index, issues, bare);
      if (!index.tileTags.has(trigger.tag)) {
        issues.add(
          `${path}/tag`,
          'missing-tile-tag',
          `No tile in this project carries the tag "${trigger.tag}".`,
        );
      }
      break;
    default:
      checkEntityRef(trigger.subject, `${path}/subject`, scope, index, issues, bare);
      break;
  }

  checkMovementMode(
    TRIGGERS[trigger.type],
    triggerSubject(trigger),
    path,
    scope,
    index,
    issues,
    context,
  );
}

function checkCondition(
  condition: Condition,
  path: string,
  scope: RuleScope,
  index: ProjectIndex,
  issues: Issues,
  context: RuleContext,
): void {
  switch (condition.type) {
    case 'variable-is':
      checkVariable(condition.variable, `${path}/variable`, index, issues);
      checkVariableValue(condition.variable, condition.value, `${path}/value`, index, issues);
      break;
    case 'variable-compare':
      checkVariable(condition.left, `${path}/left`, index, issues);
      checkVariable(condition.right, `${path}/right`, index, issues);
      checkSameKind(condition.left, condition.right, `${path}/right`, index, issues);
      break;
    case 'property-is':
      checkEntityRef(condition.target, `${path}/target`, scope, index, issues, context);
      checkProperty(
        condition.target,
        condition.property,
        `${path}/property`,
        scope,
        index,
        issues,
        context,
      );
      break;
    case 'has-tag':
      checkEntityRef(condition.target, `${path}/target`, scope, index, issues, context);
      if (!index.entityTags.has(condition.tag)) {
        issues.add(
          `${path}/tag`,
          'missing-tag',
          `Nothing in this project carries the tag "${condition.tag}".`,
        );
      }
      break;
    case 'entity-exists':
      checkEntityRef(condition.entity, `${path}/entity`, scope, index, issues, context);
      break;
    case 'action-held':
      checkInputAction(condition.action, `${path}/action`, index, issues);
      break;
    case 'distance-is':
      checkEntityRef(condition.from, `${path}/from`, scope, index, issues, context);
      checkEntityRef(condition.to, `${path}/to`, scope, index, issues, context);
      break;
    case 'chance':
      break;
    case 'current-scene-is':
      checkScene(condition.scene, `${path}/scene`, index, issues);
      break;
    case 'is-on-ground':
    case 'is-falling':
      checkEntityRef(condition.target, `${path}/target`, scope, index, issues, context);
      break;
  }

  const target = 'target' in condition ? condition.target : undefined;
  checkMovementMode(CONDITIONS[condition.type], target, path, scope, index, issues, context);
}

function checkAction(
  action: Action,
  path: string,
  scope: RuleScope,
  index: ProjectIndex,
  issues: Issues,
  context: RuleContext,
): void {
  switch (action.type) {
    case 'destroy':
    case 'set-camera-target':
      checkEntityRef(action.target, `${path}/target`, scope, index, issues, context);
      break;
    case 'spawn':
      if (!index.prototypes.has(action.entity)) {
        issues.add(
          `${path}/entity`,
          'missing-prototype',
          `There is no entity called "${action.entity}" in this project, so nothing can be created.`,
        );
      }
      if (action.relativeTo) {
        checkEntityRef(action.relativeTo, `${path}/relativeTo`, scope, index, issues, context);
      }
      break;
    case 'move':
      checkEntityRef(action.target, `${path}/target`, scope, index, issues, context);
      break;
    case 'teleport':
      checkEntityRef(action.target, `${path}/target`, scope, index, issues, context);
      if (action.relativeTo) {
        checkEntityRef(action.relativeTo, `${path}/relativeTo`, scope, index, issues, context);
      }
      break;
    case 'jump':
    case 'set-visible':
      checkEntityRef(action.target, `${path}/target`, scope, index, issues, context);
      break;
    case 'set-variable':
      checkVariable(action.variable, `${path}/variable`, index, issues);
      checkVariableValue(action.variable, action.value, `${path}/value`, index, issues);
      break;
    case 'change-variable': {
      checkVariable(action.variable, `${path}/variable`, index, issues);
      const variable = index.variables.get(action.variable);
      if (variable && variable.type !== 'number') {
        issues.add(
          `${path}/variable`,
          'wrong-variable-type',
          `"${action.variable}" holds ${describeType(variable.type)}, so it cannot be changed by an amount. Use "Set a variable to" instead.`,
        );
      }
      break;
    }
    case 'copy-variable':
      checkVariable(action.from, `${path}/from`, index, issues);
      checkVariable(action.into, `${path}/into`, index, issues);
      checkSameKind(action.from, action.into, `${path}/into`, index, issues);
      break;
    case 'set-property':
      checkEntityRef(action.target, `${path}/target`, scope, index, issues, context);
      checkProperty(
        action.target,
        action.property,
        `${path}/property`,
        scope,
        index,
        issues,
        context,
      );
      break;
    case 'change-property':
      checkEntityRef(action.target, `${path}/target`, scope, index, issues, context);
      checkProperty(
        action.target,
        action.property,
        `${path}/property`,
        scope,
        index,
        issues,
        context,
      );
      break;
    case 'play-animation': {
      checkEntityRef(action.target, `${path}/target`, scope, index, issues, context);
      const prototype = resolvePrototype(action.target, scope, index, context);
      const sprite = prototype?.components.sprite;
      if (prototype && sprite && !sprite.animations.some((one) => one.id === action.animation)) {
        issues.add(
          `${path}/animation`,
          'missing-animation',
          `"${prototype.id}" has no animation called "${action.animation}".`,
        );
      }
      break;
    }
    case 'play-sound':
      checkSound(action.sound, `${path}/sound`, index, issues);
      break;
    case 'stop-sound':
      if (action.sound) checkSound(action.sound, `${path}/sound`, index, issues);
      break;
    case 'show-message':
    case 'restart-scene':
    case 'shake-camera':
    case 'wait':
      break;
    case 'go-to-scene':
      checkScene(action.scene, `${path}/scene`, index, issues);
      break;
    case 'set-tile':
      if (!scope.layers.has(action.layer)) {
        issues.add(
          `${path}/layer`,
          'missing-layer',
          `There is no layer called "${action.layer}" here.`,
        );
      } else if (scope.scene) {
        if (action.column >= scope.scene.size.columns) {
          issues.add(
            `${path}/column`,
            'outside-scene',
            `Column ${action.column} is outside this level, which is ${scope.scene.size.columns} tiles wide.`,
          );
        }
        if (action.row >= scope.scene.size.rows) {
          issues.add(
            `${path}/row`,
            'outside-scene',
            `Row ${action.row} is outside this level, which is ${scope.scene.size.rows} tiles tall.`,
          );
        }
      }
      break;
    case 'enable-rule':
    case 'disable-rule':
      if (!scope.ruleIds.has(action.rule)) {
        issues.add(
          `${path}/rule`,
          'missing-rule',
          `There is no rule called "${action.rule}" here.`,
        );
      }
      break;
  }

  const target = 'target' in action ? action.target : undefined;
  checkMovementMode(ACTIONS[action.type], target, path, scope, index, issues, context);
}

function checkInputAction(name: string, path: string, index: ProjectIndex, issues: Issues): void {
  if (!index.inputActions.has(name)) {
    issues.add(
      path,
      'missing-input-action',
      `There is no control called "${name}". Controls are listed in the project settings.`,
    );
  }
}

function checkVariable(name: string, path: string, index: ProjectIndex, issues: Issues): void {
  if (!index.variables.has(name)) {
    issues.add(path, 'missing-variable', `There is no variable called "${name}" in this project.`);
  }
}

function checkVariableValue(
  name: string,
  value: Value,
  path: string,
  index: ProjectIndex,
  issues: Issues,
): void {
  const variable = index.variables.get(name);
  if (variable && !valueMatchesType(value, variable.type)) {
    issues.add(
      path,
      'wrong-variable-type',
      `"${name}" holds ${describeType(variable.type)}, but this rule uses ${JSON.stringify(value)}.`,
    );
  }
}

/**
 * Two variables used together have to hold the same kind of thing. Comparing a
 * score with a name, or copying a name into a score, is a mistake worth saying
 * out loud rather than quietly turning into a number.
 */
function checkSameKind(
  first: string,
  second: string,
  path: string,
  index: ProjectIndex,
  issues: Issues,
): void {
  const left = index.variables.get(first);
  const right = index.variables.get(second);
  if (!left || !right || left.type === right.type) return;
  issues.add(
    path,
    'mismatched-variables',
    `"${first}" holds ${describeType(left.type)} and "${second}" holds ${describeType(right.type)}, so they cannot be used together.`,
  );
}

function checkScene(id: string, path: string, index: ProjectIndex, issues: Issues): void {
  if (!index.scenes.has(id)) {
    issues.add(path, 'missing-scene', `There is no level called "${id}" in this project.`);
  }
}

function checkSound(id: string, path: string, index: ProjectIndex, issues: Issues): void {
  if (!index.sounds.has(id)) {
    issues.add(path, 'missing-asset', `There is no sound called "${id}" in the asset list.`);
  }
}

function checkProperty(
  ref: string,
  property: string,
  path: string,
  scope: RuleScope,
  index: ProjectIndex,
  issues: Issues,
  context: RuleContext,
): void {
  const prototype = resolvePrototype(ref, scope, index, context);
  if (!prototype) return;
  if (!prototype.properties.some((one) => one.id === property)) {
    issues.add(path, 'missing-property', `"${prototype.id}" has no property called "${property}".`);
  }
}

/** The prototype a reference points at, when that can be worked out without running the game. */
function resolvePrototype(
  ref: string,
  scope: RuleScope,
  index: ProjectIndex,
  context: RuleContext,
): EntityPrototype | undefined {
  const resolved = parseEntityRef(ref);
  if (!resolved) return undefined;
  // $self and $other are known before the game runs: they are whatever the
  // trigger named. Following them once is enough, and the empty context on the
  // way back stops a reference from chasing its own tail.
  if (resolved.kind === 'self') {
    return context.self === undefined
      ? undefined
      : resolvePrototype(context.self, scope, index, {});
  }
  if (resolved.kind === 'other') {
    return context.other === undefined
      ? undefined
      : resolvePrototype(context.other, scope, index, {});
  }
  if (resolved.kind !== 'named') return undefined;
  const instance = scope.instances.get(resolved.id);
  if (instance) return index.prototypes.get(instance.prototype);
  return index.prototypes.get(resolved.id);
}

/**
 * Refuses a rule that asks an entity something only platform movement can
 * answer, such as whether a coin is standing on the ground. The editor filters
 * these out of its dropdowns; this is the check for files written by hand or by
 * the MCP server.
 */
function checkMovementMode(
  entry: CatalogEntry,
  ref: string | undefined,
  path: string,
  scope: RuleScope,
  index: ProjectIndex,
  issues: Issues,
  context: RuleContext,
): void {
  const appliesEverywhere = entry.modes.length >= MOVEMENT_MODES.length;
  if (appliesEverywhere || ref === undefined) return;

  const prototype = resolvePrototype(ref, scope, index, context);
  if (!prototype) return;

  const movement = prototype.components.movement;
  if (!movement) {
    issues.add(
      path,
      'wrong-movement-mode',
      `"${entry.label}" only works for something that walks and jumps, and "${prototype.id}" does not move at all.`,
    );
    return;
  }
  if (!entry.modes.includes(movement.mode)) {
    issues.add(
      path,
      'wrong-movement-mode',
      `"${entry.label}" only works with ${entry.modes.join(' or ')} movement, and "${prototype.id}" uses ${movement.mode} movement.`,
    );
  }
}
