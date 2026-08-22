import type { EntityPrototype, Project, Scene, Value } from '@pinforge/schema';
import { boxesOverlap } from './collision.js';
import {
  advancePending,
  runRules,
  type PendingActions,
  type RuntimeHost,
  type SceneEdge,
  type StepSignals,
} from './events.js';
import { InputState } from './input.js';
import { STEP_SECONDS, stepMovement } from './movement.js';
import { Random } from './random.js';
import { noAssets, silentAudio, type AssetStore, type AudioOutput } from './renderer.js';
import { World, type Entity } from './world.js';

export interface GameOptions {
  assets?: AssetStore;
  audio?: AudioOutput;
  /** Fixed by default, because the simulation has to be reproducible. */
  seed?: number;
}

/** Longest real time a single advance() call may catch up on, to avoid a spiral. */
const MAX_CATCH_UP = 0.25;

/**
 * One game, playing. The same class runs the editor's play mode and the
 * exported HTML: there is no second implementation of anything a player sees.
 *
 * The simulation advances in fixed steps of 1/60 second, driven by an
 * accumulator that is separate from render frames. Variable frame time never
 * reaches the simulation, which is what makes the same inputs produce the same
 * result on every machine and what makes the deterministic tests possible.
 */
export class Game implements RuntimeHost {
  readonly input = new InputState();
  readonly random: Random;
  readonly audio: AudioOutput;
  readonly assets: AssetStore;
  world: World;

  private readonly prototypes: Map<string, EntityPrototype>;
  private readonly scenes: Map<string, Scene>;
  private readonly variables = new Map<string, Value>();
  private pending: PendingActions[] = [];
  private accumulator = 0;
  private startedGame = false;
  private sceneStarting = true;
  private nextSceneId: string | undefined;
  private destroyedThisStep: Entity[] = [];
  private spawnedLastStep: Entity[] = [];
  private destroyedLastStep: Entity[] = [];
  private variablesChangedThisStep = new Set<string>();
  private variablesChangedLastStep: ReadonlySet<string> = new Set();
  private clickQueue: { x: number; y: number }[] = [];

  constructor(
    readonly project: Project,
    options: GameOptions = {},
  ) {
    this.random = new Random(options.seed ?? 1);
    this.audio = options.audio ?? silentAudio;
    this.assets = options.assets ?? noAssets;
    this.prototypes = new Map(project.entities.map((entity) => [entity.id, entity]));
    this.scenes = new Map(project.scenes.map((scene) => [scene.id, scene]));
    for (const variable of project.variables) this.variables.set(variable.id, variable.initial);

    const first = this.scenes.get(project.settings.startScene) ?? project.scenes[0];
    if (!first) throw new Error('This project has no scenes.');
    this.world = new World(first, project);
    this.snapCamera();
  }

  // --- the loop -------------------------------------------------------------

  /** Feeds real time in. Runs as many fixed steps as have become due. */
  advance(seconds: number): void {
    // Clamped on both sides: a huge frame time must not spiral, and a clock
    // that runs backwards must not drain the accumulator below zero.
    this.accumulator += Math.min(Math.max(seconds, 0), MAX_CATCH_UP);
    while (this.accumulator >= STEP_SECONDS) {
      this.accumulator -= STEP_SECONDS;
      this.step();
    }
  }

  /** How far between the last two simulation states the next frame should draw. */
  get alpha(): number {
    return this.accumulator / STEP_SECONDS;
  }

  step(): void {
    const world = this.world;
    const gameStarted = !this.startedGame;
    const sceneStarted = this.sceneStarting;
    this.startedGame = true;
    this.sceneStarting = false;

    for (const entity of world.entities) {
      entity.previousX = entity.x;
      entity.previousY = entity.y;
    }

    advancePending(this, STEP_SECONDS);

    if (!this.changingScene) {
      for (const entity of world.entities) {
        if (!entity.destroyed) stepMovement(entity, world.map, this.input, STEP_SECONDS);
      }
    }

    const signals = this.collectSignals(gameStarted, sceneStarted);
    if (!this.changingScene) runRules(this, signals, STEP_SECONDS);

    this.spawnedLastStep = world.recentSpawns.splice(0);
    this.destroyedLastStep = this.destroyedThisStep.splice(0);
    this.variablesChangedLastStep = this.variablesChangedThisStep;
    this.variablesChangedThisStep = new Set();
    world.removeDestroyed();

    this.updateCamera(STEP_SECONDS, false);
    this.advanceAnimations(STEP_SECONDS);
    if (world.message) {
      world.message.secondsLeft -= STEP_SECONDS;
      if (world.message.secondsLeft <= 0) world.message = undefined;
    }
    world.elapsed += STEP_SECONDS;
    world.steps += 1;
    this.input.endStep();

    if (this.nextSceneId !== undefined) {
      const id = this.nextSceneId;
      this.nextSceneId = undefined;
      this.enterScene(id);
    }
  }

  // --- what the rules can ask for ------------------------------------------

  get changingScene(): boolean {
    return this.nextSceneId !== undefined;
  }

  variable(name: string): Value | undefined {
    return this.variables.get(name);
  }

  setVariable(name: string, value: Value): void {
    this.variables.set(name, value);
    this.variablesChangedThisStep.add(name);
  }

  /** Every global variable, for a score display or a save. */
  get variableValues(): ReadonlyMap<string, Value> {
    return this.variables;
  }

  prototype(id: string): EntityPrototype | undefined {
    return this.prototypes.get(id);
  }

  goToScene(id: string): void {
    if (this.scenes.has(id)) this.nextSceneId = id;
  }

  restartScene(): void {
    this.nextSceneId = this.world.scene.id;
  }

  destroy(entity: Entity): void {
    if (entity.destroyed) return;
    entity.destroyed = true;
    this.destroyedThisStep.push(entity);
  }

  queue(pending: PendingActions): void {
    this.pending.push(pending);
  }

  takePending(): PendingActions[] {
    const waiting = this.pending;
    this.pending = [];
    return waiting;
  }

  /** The host reports a click in game pixels; the rules see it as an entity. */
  click(x: number, y: number): void {
    this.clickQueue.push({ x, y });
  }

  // --- internals ------------------------------------------------------------

  private enterScene(id: string): void {
    const scene = this.scenes.get(id);
    if (!scene) return;
    this.world = new World(scene, this.project);
    this.pending = [];
    this.sceneStarting = true;
    this.destroyedThisStep = [];
    this.spawnedLastStep = [];
    this.destroyedLastStep = [];
    this.snapCamera();
  }

  private collectSignals(gameStarted: boolean, sceneStarted: boolean): StepSignals {
    const world = this.world;
    const solidEnough = world.entities.filter(
      (entity) => !entity.destroyed && entity.collider && entity.collider.kind !== 'none',
    );

    const current = new Set<string>();
    const collisionsStarted: [Entity, Entity][] = [];
    for (let i = 0; i < solidEnough.length; i += 1) {
      for (let j = i + 1; j < solidEnough.length; j += 1) {
        const a = solidEnough[i];
        const b = solidEnough[j];
        if (!a || !b || !boxesOverlap(a, b)) continue;
        const key = `${a.id}|${b.id}`;
        current.add(key);
        if (!world.overlaps.has(key)) collisionsStarted.push([a, b]);
      }
    }

    const byId = new Map(world.entities.map((entity) => [entity.id, entity]));
    const collisionsEnded: [Entity, Entity][] = [];
    for (const key of world.overlaps) {
      if (current.has(key)) continue;
      const [left, right] = key.split('|');
      const a = left === undefined ? undefined : byId.get(left);
      const b = right === undefined ? undefined : byId.get(right);
      if (a && b && !a.destroyed && !b.destroyed) collisionsEnded.push([a, b]);
    }
    world.overlaps.clear();
    for (const key of current) world.overlaps.add(key);

    const tileTouches: [Entity, string][] = [];
    for (const entity of solidEnough) {
      for (const tag of tagsUnder(entity, world)) tileTouches.push([entity, tag]);
    }

    const leftScene: [Entity, SceneEdge][] = [];
    for (const entity of world.entities) {
      if (entity.destroyed) continue;
      const edge = outsideEdge(entity, world);
      if (edge) leftScene.push([entity, edge]);
    }

    const clicked: Entity[] = [];
    for (const point of this.clickQueue.splice(0)) {
      for (let index = world.entities.length - 1; index >= 0; index -= 1) {
        const entity = world.entities[index];
        if (!entity || entity.destroyed || !entity.visible) continue;
        // The renderer offsets by the shake as well, so clicking maps back
        // through the same total offset or a shaking screen misses.
        const x = entity.fixedToCamera ? point.x : point.x + world.camera.x + world.camera.offsetX;
        const y = entity.fixedToCamera ? point.y : point.y + world.camera.y + world.camera.offsetY;
        if (
          x >= entity.x &&
          x <= entity.x + entity.width &&
          y >= entity.y &&
          y <= entity.y + entity.height
        ) {
          clicked.push(entity);
          break;
        }
      }
    }

    return {
      gameStarted,
      sceneStarted,
      collisionsStarted,
      collisionsEnded,
      tileTouches,
      landed: world.entities.filter((entity) => entity.landed && !entity.destroyed),
      jumped: world.entities.filter((entity) => entity.jumped && !entity.destroyed),
      leftScene,
      clicked,
      spawned: this.spawnedLastStep,
      destroyed: this.destroyedLastStep,
      variablesChanged: this.variablesChangedLastStep,
    };
  }

  private snapCamera(): void {
    this.updateCamera(0, true);
  }

  private updateCamera(seconds: number, snap: boolean): void {
    const view = this.project.settings.viewport;
    const camera = this.world.camera;
    const config = this.world.scene.camera;
    const map = this.world.map;

    if (config.mode === 'fixed') {
      camera.x = config.x;
      camera.y = config.y;
    } else if (config.mode === 'auto-scroll') {
      camera.x += config.speed.x * seconds;
      camera.y += config.speed.y * seconds;
    } else {
      const target = camera.targetId ? this.world.find(camera.targetId) : undefined;
      if (target) {
        const centreX = target.x + target.width / 2;
        const centreY = target.y + target.height / 2;
        let wantedX = camera.x;
        let wantedY = camera.y;
        const left = camera.x + (view.width - config.deadZone.width) / 2;
        const right = camera.x + (view.width + config.deadZone.width) / 2;
        const top = camera.y + (view.height - config.deadZone.height) / 2;
        const bottom = camera.y + (view.height + config.deadZone.height) / 2;
        if (centreX < left) wantedX = camera.x - (left - centreX);
        else if (centreX > right) wantedX = camera.x + (centreX - right);
        if (centreY < top) wantedY = camera.y - (top - centreY);
        else if (centreY > bottom) wantedY = camera.y + (centreY - bottom);

        const factor = snap ? 1 : 1 - config.smoothing;
        camera.x += (wantedX + config.offset.x - camera.x) * factor;
        camera.y += (wantedY + config.offset.y - camera.y) * factor;
      }
    }

    if (config.clampToScene) {
      camera.x = clamp(camera.x, 0, Math.max(0, map.widthInPixels - view.width));
      camera.y = clamp(camera.y, 0, Math.max(0, map.heightInPixels - view.height));
    }

    if (camera.shakeLeft > 0) {
      camera.shakeLeft = Math.max(0, camera.shakeLeft - seconds);
      const strength = camera.shakeStrength * (camera.shakeLeft > 0 ? 1 : 0);
      camera.offsetX = this.random.between(-strength, strength);
      camera.offsetY = this.random.between(-strength, strength);
    } else {
      camera.offsetX = 0;
      camera.offsetY = 0;
    }
  }

  private advanceAnimations(seconds: number): void {
    for (const entity of this.world.entities) {
      const sprite = entity.sprite;
      if (!sprite) continue;
      const animation = sprite.component.animations.find((one) => one.id === sprite.animation);
      if (!animation) continue;
      const frameSeconds = 1 / animation.fps;
      sprite.elapsed += seconds;
      while (sprite.elapsed >= frameSeconds) {
        sprite.elapsed -= frameSeconds;
        if (sprite.frame + 1 < animation.frames.length) sprite.frame += 1;
        else if (animation.loop) sprite.frame = 0;
        else {
          sprite.elapsed = 0;
          break;
        }
      }
    }
  }
}

function tagsUnder(entity: Entity, world: World): string[] {
  const map = world.map;
  const left = Math.floor(entity.x / map.tileSize);
  const right = Math.floor((entity.x + entity.width - 0.001) / map.tileSize);
  const top = Math.floor(entity.y / map.tileSize);
  const bottom = Math.floor((entity.y + entity.height - 0.001) / map.tileSize);
  const found: string[] = [];
  for (const tag of map.tags) {
    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        if (map.hasTag(tag, column, row)) {
          found.push(tag);
          row = bottom + 1;
          break;
        }
      }
    }
  }
  return found;
}

function outsideEdge(entity: Entity, world: World): SceneEdge | undefined {
  const map = world.map;
  if (entity.y > map.heightInPixels) return 'bottom';
  if (entity.y + entity.height < 0) return 'top';
  if (entity.x + entity.width < 0) return 'left';
  if (entity.x > map.widthInPixels) return 'right';
  return undefined;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}
