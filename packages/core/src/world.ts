import type {
  ColliderComponent,
  Components,
  EntityInstance,
  EntityPrototype,
  MovementComponent,
  Project,
  Scene,
  SpriteComponent,
  TextComponent,
  Value,
} from '@pinforge/schema';
import { Tilemap } from './tilemap.js';

export interface SpriteState {
  component: SpriteComponent;
  animation: string | undefined;
  elapsed: number;
  frame: number;
}

export interface Entity {
  id: string;
  prototypeId: string;
  tags: Set<string>;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Where it was at the end of the previous step, so rendering can interpolate. */
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  visible: boolean;
  destroyed: boolean;
  fixedToCamera: boolean;
  properties: Map<string, Value>;
  sprite: SpriteState | undefined;
  collider: ColliderComponent | undefined;
  movement: MovementComponent | undefined;
  text: TextComponent | undefined;
  facing: 1 | -1;
  onGround: boolean;
  coyoteLeft: number;
  jumpBufferLeft: number;
  airJumpsLeft: number;
  patrolDirection: 1 | -1;
  jumped: boolean;
  landed: boolean;
  jumpCut: boolean;
}

export interface CameraState {
  x: number;
  y: number;
  targetId: string | undefined;
  shakeLeft: number;
  shakeStrength: number;
  offsetX: number;
  offsetY: number;
}

export interface Message {
  text: string;
  secondsLeft: number;
}

/** Everything that is true about the scene being played right now. */
export class World {
  readonly map: Tilemap;
  readonly entities: Entity[] = [];
  readonly camera: CameraState;
  readonly overlaps = new Set<string>();
  readonly firedOnce = new Set<string>();
  readonly disabledRules = new Set<string>();
  readonly timers = new Map<string, number>();
  /** Entities created this step, drained by the game so rules can react next step. */
  readonly recentSpawns: Entity[] = [];
  message: Message | undefined;
  elapsed = 0;
  steps = 0;
  private spawnCount = 0;

  constructor(
    readonly scene: Scene,
    project: Project,
  ) {
    this.map = new Tilemap(scene, project);
    this.camera = {
      x: 0,
      y: 0,
      targetId: scene.camera.mode === 'follow' ? scene.camera.target : undefined,
      shakeLeft: 0,
      shakeStrength: 0,
      offsetX: 0,
      offsetY: 0,
    };

    const prototypes = new Map(project.entities.map((entity) => [entity.id, entity]));
    for (const instance of scene.entities) {
      const prototype = prototypes.get(instance.prototype);
      if (prototype) this.entities.push(createEntity(prototype, instance));
    }
  }

  find(id: string): Entity | undefined {
    return this.entities.find((entity) => entity.id === id && !entity.destroyed);
  }

  spawn(prototype: EntityPrototype, x: number, y: number): Entity {
    this.spawnCount += 1;
    const entity = createEntity(prototype, {
      id: `${prototype.id}#${this.spawnCount}`,
      prototype: prototype.id,
      x,
      y,
      fixedToCamera: false,
      tags: [],
      properties: {},
      overrides: {},
    });
    this.entities.push(entity);
    this.recentSpawns.push(entity);
    return entity;
  }

  removeDestroyed(): void {
    for (let index = this.entities.length - 1; index >= 0; index -= 1) {
      if (this.entities[index]?.destroyed) this.entities.splice(index, 1);
    }
  }
}

export function createEntity(prototype: EntityPrototype, instance: EntityInstance): Entity {
  const components = resolveComponents(prototype.components, instance.overrides);
  const properties = new Map<string, Value>();
  for (const definition of prototype.properties) properties.set(definition.id, definition.initial);
  for (const [name, value] of Object.entries(instance.properties)) properties.set(name, value);

  const sprite = components.sprite;
  return {
    id: instance.id,
    prototypeId: prototype.id,
    tags: new Set([...prototype.tags, ...instance.tags]),
    x: instance.x,
    y: instance.y,
    width: prototype.size.width,
    height: prototype.size.height,
    previousX: instance.x,
    previousY: instance.y,
    velocityX: 0,
    velocityY: 0,
    visible: true,
    destroyed: false,
    fixedToCamera: instance.fixedToCamera,
    properties,
    sprite: sprite
      ? { component: sprite, animation: sprite.defaultAnimation, elapsed: 0, frame: 0 }
      : undefined,
    collider: components.collider,
    movement: components.movement,
    text: components.text,
    facing: 1,
    onGround: false,
    coyoteLeft: 0,
    jumpBufferLeft: 0,
    airJumpsLeft: 0,
    patrolDirection:
      components.movement?.mode === 'platform' && components.movement.patrol?.direction === 'right'
        ? 1
        : -1,
    jumped: false,
    landed: false,
    jumpCut: false,
  };
}

/**
 * An override patches the fields it names onto the prototype's component and
 * nothing else. The cast is the boundary: the schema guarantees an override only
 * carries fields of the component it names, and cannot change a movement mode.
 */
function resolveComponents(base: Components, overrides: EntityInstance['overrides']): Components {
  return {
    sprite: patch(base.sprite, overrides.sprite),
    collider: patch(base.collider, overrides.collider),
    movement: patch(base.movement, overrides.movement) as MovementComponent | undefined,
    text: patch(base.text, overrides.text),
  };
}

function patch<T extends object>(base: T | undefined, override: object | undefined): T | undefined {
  if (!base) return undefined;
  if (!override || Object.keys(override).length === 0) return base;
  return { ...base, ...override };
}

export type { ColliderComponent, MovementComponent, SpriteComponent, TextComponent };
