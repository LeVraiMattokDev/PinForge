import type {
  Action,
  Arithmetic,
  Comparison,
  Condition,
  EntityPrototype,
  EventRule,
  Project,
  Trigger,
  Value,
} from '@pinforge/schema';
import type { AudioOutput } from './renderer.js';
import type { InputState } from './input.js';
import type { Random } from './random.js';
import type { Entity, World } from './world.js';

export type SceneEdge = 'top' | 'bottom' | 'left' | 'right';

export interface RuleContext {
  self?: Entity;
  other?: Entity;
}

/** What happened this step, gathered before any rule runs. */
export interface StepSignals {
  gameStarted: boolean;
  sceneStarted: boolean;
  collisionsStarted: [Entity, Entity][];
  collisionsEnded: [Entity, Entity][];
  tileTouches: [Entity, string][];
  landed: Entity[];
  jumped: Entity[];
  leftScene: [Entity, SceneEdge][];
  clicked: Entity[];
  spawned: Entity[];
  destroyed: Entity[];
  variablesChanged: ReadonlySet<string>;
}

export interface PendingActions {
  actions: readonly Action[];
  index: number;
  waitLeft: number;
  context: RuleContext;
}

/** What the rule engine needs from the game it is running inside. */
export interface RuntimeHost {
  readonly project: Project;
  readonly world: World;
  readonly input: InputState;
  readonly random: Random;
  readonly audio: AudioOutput;
  readonly changingScene: boolean;
  variable(name: string): Value | undefined;
  setVariable(name: string, value: Value): void;
  prototype(id: string): EntityPrototype | undefined;
  goToScene(id: string): void;
  restartScene(): void;
  destroy(entity: Entity): void;
  queue(pending: PendingActions): void;
  takePending(): PendingActions[];
}

export function rulesOf(host: RuntimeHost): readonly EventRule[] {
  return [...host.world.scene.events, ...host.project.globalEvents];
}

export function runRules(host: RuntimeHost, signals: StepSignals, seconds: number): void {
  for (const rule of rulesOf(host)) {
    if (host.changingScene) return;
    if (!rule.enabled || host.world.disabledRules.has(rule.id)) continue;
    if (rule.once && host.world.firedOnce.has(rule.id)) continue;
    for (const context of firings(host, rule.when, signals, rule.id, seconds)) {
      if (host.changingScene) return;
      if (rule.once && host.world.firedOnce.has(rule.id)) break;
      // An earlier rule in the same step may already have removed one of the
      // entities this firing is about. The canonical case is a platformer: one
      // rule squashes an enemy when the player lands on it, the next takes a
      // life when the player walks into one. Without this, squashing would also
      // hurt, because the first rule's bounce changes what "is falling" answers
      // for the second. A rule about something that no longer exists does not
      // run.
      if (context.self?.destroyed || context.other?.destroyed) continue;
      if (!conditionsHold(host, rule.if, context)) continue;
      if (rule.once) host.world.firedOnce.add(rule.id);
      start(host, rule.then, context);
    }
  }
}

function* firings(
  host: RuntimeHost,
  trigger: Trigger,
  signals: StepSignals,
  ruleId: string,
  seconds: number,
): Generator<RuleContext> {
  switch (trigger.type) {
    case 'game-starts':
      if (signals.gameStarted) yield {};
      return;
    case 'scene-starts':
      if (signals.sceneStarted) yield {};
      return;
    case 'every-frame':
      yield {};
      return;
    case 'every-seconds': {
      const elapsed = (host.world.timers.get(ruleId) ?? 0) + seconds;
      let left = elapsed;
      while (left >= trigger.seconds) {
        left -= trigger.seconds;
        yield {};
      }
      host.world.timers.set(ruleId, left);
      return;
    }
    case 'action-pressed':
      if (host.input.wasPressed(trigger.action)) yield {};
      return;
    case 'action-released':
      if (host.input.wasReleased(trigger.action)) yield {};
      return;
    case 'variable-changes':
      if (signals.variablesChanged.has(trigger.variable)) yield {};
      return;
    case 'collides':
    case 'collision-ends': {
      const pairs =
        trigger.type === 'collides' ? signals.collisionsStarted : signals.collisionsEnded;
      for (const [a, b] of pairs) {
        if (matches(trigger.subject, a, {}) && matches(trigger.with, b, {})) {
          yield { self: a, other: b };
        } else if (matches(trigger.subject, b, {}) && matches(trigger.with, a, {})) {
          yield { self: b, other: a };
        }
      }
      return;
    }
    case 'touches-tile':
      for (const [entity, tag] of signals.tileTouches) {
        if (tag === trigger.tag && matches(trigger.subject, entity, {})) yield { self: entity };
      }
      return;
    case 'lands':
      for (const entity of signals.landed) {
        if (matches(trigger.subject, entity, {})) yield { self: entity };
      }
      return;
    case 'jumps':
      for (const entity of signals.jumped) {
        if (matches(trigger.subject, entity, {})) yield { self: entity };
      }
      return;
    case 'entity-spawned':
      for (const entity of signals.spawned) {
        if (matches(trigger.subject, entity, {})) yield { self: entity };
      }
      return;
    case 'entity-destroyed':
      for (const entity of signals.destroyed) {
        if (matches(trigger.subject, entity, {})) yield { self: entity };
      }
      return;
    case 'leaves-scene':
      for (const [entity, edge] of signals.leftScene) {
        if (
          (trigger.edge === 'any' || trigger.edge === edge) &&
          matches(trigger.subject, entity, {})
        )
          yield { self: entity };
      }
      return;
    case 'clicked':
      for (const entity of signals.clicked) {
        if (matches(trigger.subject, entity, {})) yield { self: entity };
      }
      return;
  }
}

export function matches(reference: string, entity: Entity, context: RuleContext): boolean {
  if (reference === '$self') return context.self === entity;
  if (reference === '$other') return context.other === entity;
  if (reference.startsWith('tag:')) return entity.tags.has(reference.slice('tag:'.length));
  return entity.id === reference || entity.prototypeId === reference;
}

/** Every living entity a reference points at. A copy is looked up before a kind. */
export function resolve(world: World, reference: string, context: RuleContext): Entity[] {
  if (reference === '$self') return alive(context.self);
  if (reference === '$other') return alive(context.other);
  const living = world.entities.filter((entity) => !entity.destroyed);
  if (reference.startsWith('tag:')) {
    const tag = reference.slice('tag:'.length);
    return living.filter((entity) => entity.tags.has(tag));
  }
  const byId = living.filter((entity) => entity.id === reference);
  return byId.length > 0 ? byId : living.filter((entity) => entity.prototypeId === reference);
}

function alive(entity: Entity | undefined): Entity[] {
  return entity && !entity.destroyed ? [entity] : [];
}

function conditionsHold(
  host: RuntimeHost,
  conditions: readonly Condition[],
  context: RuleContext,
): boolean {
  return conditions.every((condition) => holds(host, condition, context) !== condition.negate);
}

function holds(host: RuntimeHost, condition: Condition, context: RuleContext): boolean {
  const world = host.world;
  switch (condition.type) {
    case 'variable-is':
      return compare(host.variable(condition.variable), condition.operator, condition.value);
    case 'property-is':
      return resolve(world, condition.target, context).some((entity) =>
        compare(entity.properties.get(condition.property), condition.operator, condition.value),
      );
    case 'has-tag':
      return resolve(world, condition.target, context).some((entity) =>
        entity.tags.has(condition.tag),
      );
    case 'entity-exists':
      return resolve(world, condition.entity, context).length > 0;
    case 'action-held':
      return host.input.isHeld(condition.action);
    case 'distance-is': {
      const from = resolve(world, condition.from, context)[0];
      const to = resolve(world, condition.to, context)[0];
      if (!from || !to) return false;
      const dx = from.x + from.width / 2 - (to.x + to.width / 2);
      const dy = from.y + from.height / 2 - (to.y + to.height / 2);
      const distance = Math.sqrt(dx * dx + dy * dy);
      return condition.operator === 'at-most'
        ? distance <= condition.pixels
        : distance >= condition.pixels;
    }
    case 'chance':
      return host.random.next() * 100 < condition.percent;
    case 'current-scene-is':
      return world.scene.id === condition.scene;
    case 'is-on-ground':
      return resolve(world, condition.target, context).some((entity) => entity.onGround);
    case 'is-falling':
      return resolve(world, condition.target, context).some(
        (entity) => !entity.onGround && entity.velocityY > 0,
      );
  }
}

function compare(left: Value | undefined, operator: Comparison, right: Value): boolean {
  if (left === undefined) return false;
  switch (operator) {
    case 'equals':
      return left === right;
    case 'not-equals':
      return left !== right;
    case 'at-least':
      return Number(left) >= Number(right);
    case 'at-most':
      return Number(left) <= Number(right);
    case 'greater-than':
      return Number(left) > Number(right);
    case 'less-than':
      return Number(left) < Number(right);
  }
}

function start(host: RuntimeHost, actions: readonly Action[], context: RuleContext): void {
  advance(host, { actions, index: 0, waitLeft: 0, context });
}

/** Runs a rule's actions until it finishes or hits a wait. */
function advance(host: RuntimeHost, pending: PendingActions): void {
  while (pending.index < pending.actions.length) {
    const action = pending.actions[pending.index];
    if (!action) break;
    pending.index += 1;
    if (action.type === 'wait') {
      pending.waitLeft = action.seconds;
      host.queue(pending);
      return;
    }
    perform(host, action, pending.context);
    if (host.changingScene) return;
  }
}

export function advancePending(host: RuntimeHost, seconds: number): void {
  const waiting = host.takePending();
  for (const pending of waiting) {
    pending.waitLeft -= seconds;
    if (pending.waitLeft > 0) {
      host.queue(pending);
      continue;
    }
    advance(host, pending);
    if (host.changingScene) return;
  }
}

function perform(host: RuntimeHost, action: Action, context: RuleContext): void {
  const world = host.world;
  switch (action.type) {
    case 'destroy':
      for (const entity of resolve(world, action.target, context)) host.destroy(entity);
      return;
    case 'spawn': {
      const prototype = host.prototype(action.entity);
      if (!prototype) return;
      const anchor = action.relativeTo ? resolve(world, action.relativeTo, context)[0] : undefined;
      const originX = anchor?.x ?? 0;
      const originY = anchor?.y ?? 0;
      world.spawn(prototype, originX + action.x, originY + action.y);
      return;
    }
    case 'move':
      for (const entity of resolve(world, action.target, context)) {
        if (action.x !== undefined) {
          entity.velocityX = action.mode === 'add' ? entity.velocityX + action.x : action.x;
        }
        if (action.y !== undefined) {
          entity.velocityY = action.mode === 'add' ? entity.velocityY + action.y : action.y;
        }
      }
      return;
    case 'teleport': {
      const anchor = action.relativeTo ? resolve(world, action.relativeTo, context)[0] : undefined;
      for (const entity of resolve(world, action.target, context)) {
        entity.x = (anchor?.x ?? 0) + action.x;
        entity.y = (anchor?.y ?? 0) + action.y;
        entity.previousX = entity.x;
        entity.previousY = entity.y;
      }
      return;
    }
    case 'jump':
      for (const entity of resolve(world, action.target, context)) {
        const movement = entity.movement;
        if (movement?.mode !== 'platform') continue;
        const height = action.height ?? movement.jumpHeight;
        entity.velocityY = -Math.sqrt(2 * movement.gravity * height);
        entity.onGround = false;
        entity.jumped = true;
        entity.jumpCut = false;
      }
      return;
    case 'set-variable':
      host.setVariable(action.variable, action.value);
      return;
    case 'change-variable':
      host.setVariable(
        action.variable,
        apply(Number(host.variable(action.variable) ?? 0), action.operator, action.value),
      );
      return;
    case 'set-property':
      for (const entity of resolve(world, action.target, context)) {
        entity.properties.set(action.property, action.value);
      }
      return;
    case 'change-property':
      for (const entity of resolve(world, action.target, context)) {
        entity.properties.set(
          action.property,
          apply(Number(entity.properties.get(action.property) ?? 0), action.operator, action.value),
        );
      }
      return;
    case 'play-animation':
      for (const entity of resolve(world, action.target, context)) {
        if (!entity.sprite) continue;
        if (entity.sprite.animation === action.animation) continue;
        entity.sprite.animation = action.animation;
        entity.sprite.elapsed = 0;
        entity.sprite.frame = 0;
      }
      return;
    case 'set-visible':
      for (const entity of resolve(world, action.target, context)) entity.visible = action.visible;
      return;
    case 'play-sound':
      host.audio.play(action.sound, action.volume);
      return;
    case 'stop-sound':
      host.audio.stop(action.sound);
      return;
    case 'show-message':
      world.message = { text: action.text, secondsLeft: action.seconds };
      return;
    case 'go-to-scene':
      host.goToScene(action.scene);
      return;
    case 'restart-scene':
      host.restartScene();
      return;
    case 'set-camera-target': {
      const target = resolve(world, action.target, context)[0];
      if (target) world.camera.targetId = target.id;
      return;
    }
    case 'shake-camera':
      world.camera.shakeLeft = action.seconds;
      world.camera.shakeStrength = action.strength;
      return;
    case 'set-tile':
      world.map.setTile(action.layer, action.column, action.row, action.tile);
      return;
    case 'enable-rule':
      world.disabledRules.delete(action.rule);
      return;
    case 'disable-rule':
      world.disabledRules.add(action.rule);
      return;
    case 'wait':
      return;
  }
}

function apply(current: number, operator: Arithmetic, value: number): number {
  switch (operator) {
    case 'add':
      return current + value;
    case 'subtract':
      return current - value;
    case 'multiply':
      return current * value;
    case 'divide':
      return value === 0 ? current : current / value;
    case 'set':
      return value;
  }
}
