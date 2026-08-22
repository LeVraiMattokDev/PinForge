import type {
  Animation,
  EntityInstance,
  EntityPrototype,
  MovementComponent,
  Scene,
  TileLayer,
} from '@pinforge/schema';
import * as edit from '../state/commands.js';
import { useEditor, useEditorState } from '../state/useStore.js';
import {
  Button,
  Checkbox,
  Field,
  Note,
  NumberInput,
  Panel,
  Select,
  TextInput,
} from '../ui/controls.js';
import { readable } from '../rule-fields.js';

type Store = ReturnType<typeof useEditor>;

/**
 * The right column, showing whatever is selected. Only one thing is ever shown,
 * so there is no hunting through tabs of properties for the one that matters.
 */
export function Inspector() {
  const store = useEditor();
  const state = useEditorState();
  const scene = store.scene;
  // Held in a local so the narrowing survives into the callbacks below.
  const selection = state.selection;

  if (selection.kind === 'instance') {
    const instance = scene.entities.find((one) => one.id === selection.id);
    const prototype = state.project.entities.find((one) => one.id === instance?.prototype);
    if (instance && prototype) {
      return (
        <InstanceInspector store={store} scene={scene} instance={instance} prototype={prototype} />
      );
    }
  }

  if (selection.kind === 'prototype') {
    const prototype = state.project.entities.find((one) => one.id === selection.id);
    if (prototype) return <PrototypeInspector store={store} prototype={prototype} />;
  }

  if (selection.kind === 'layer') {
    const layer = scene.layers.find((one) => one.id === selection.id);
    if (layer) return <LayerInspector store={store} scene={scene} layer={layer} />;
  }

  return <SceneInspector store={store} scene={scene} />;
}

function SceneInspector({ store, scene }: { store: Store; scene: Scene }) {
  const project = store.getState().project;
  const isStart = project.settings.startScene === scene.id;
  const camera = scene.camera;

  return (
    <Panel title="This level">
      <Field label="Name">
        <TextInput
          value={scene.name ?? ''}
          onChange={(name) => store.apply(edit.updateScene({ ...scene, name: name || undefined }))}
        />
      </Field>
      <div className="pair">
        <Field
          label="Tiles across"
          hint="The level is this many tiles wide. Growing it adds empty space on the right."
        >
          <NumberInput
            min={1}
            value={scene.size.columns}
            onChange={(columns) =>
              store.apply(edit.resizeScene(scene.id, columns, scene.size.rows))
            }
          />
        </Field>
        <Field label="Tiles down">
          <NumberInput
            min={1}
            value={scene.size.rows}
            onChange={(rows) => store.apply(edit.resizeScene(scene.id, scene.size.columns, rows))}
          />
        </Field>
      </div>
      <Field label="Background colour">
        <TextInput
          value={scene.background.color}
          onChange={(color) =>
            store.apply(edit.updateScene({ ...scene, background: { ...scene.background, color } }))
          }
        />
      </Field>

      <h2 style={{ marginTop: 16 }}>Camera</h2>
      <Field
        label="What it does"
        hint="Follow keeps the player in view. Fixed stays put, for a single screen level. Scrolling by itself suits a shoot-em-up."
      >
        <Select
          value={camera.mode}
          onChange={(mode) =>
            store.apply(edit.updateScene({ ...scene, camera: cameraOfMode(scene, mode) }))
          }
          choices={[
            { value: 'follow', label: 'Follow something' },
            { value: 'fixed', label: 'Stay in one place' },
            { value: 'auto-scroll', label: 'Scroll by itself' },
          ]}
        />
      </Field>
      {camera.mode === 'follow' ? (
        <>
          <Field label="Follow which thing">
            <Select
              value={camera.target}
              onChange={(target) =>
                store.apply(edit.updateScene({ ...scene, camera: { ...camera, target } }))
              }
              choices={scene.entities.map((one) => ({ value: one.id, label: one.name ?? one.id }))}
            />
          </Field>
          <Field
            label="Still zone"
            hint="How far the thing can move in the middle of the screen before the camera follows. Stops the picture wobbling on every step."
          >
            <NumberInput
              value={camera.deadZone.width}
              onChange={(width) =>
                store.apply(
                  edit.updateScene({
                    ...scene,
                    camera: { ...camera, deadZone: { ...camera.deadZone, width } },
                  }),
                )
              }
            />
          </Field>
        </>
      ) : null}
      <Checkbox
        label="Never show past the edge"
        checked={camera.clampToScene}
        onChange={(clampToScene) =>
          store.apply(edit.updateScene({ ...scene, camera: { ...camera, clampToScene } }))
        }
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <Button
          small
          disabled={isStart}
          onClick={() => store.apply(edit.setSettings({ startScene: scene.id }))}
        >
          {isStart ? 'The game starts here' : 'Start the game here'}
        </Button>
        <Button small kind="danger" onClick={() => store.apply(edit.removeScene(scene.id))}>
          Delete this level
        </Button>
      </div>
    </Panel>
  );
}

function cameraOfMode(scene: Scene, mode: string): Scene['camera'] {
  if (mode === 'fixed') return { mode: 'fixed', x: 0, y: 0, clampToScene: true };
  if (mode === 'auto-scroll') {
    return {
      mode: 'auto-scroll',
      speed: { x: 20, y: 0 },
      offset: { x: 0, y: 0 },
      clampToScene: true,
    };
  }
  return {
    mode: 'follow',
    target: scene.entities[0]?.id ?? '',
    deadZone: { width: 64, height: 40 },
    smoothing: 0.15,
    offset: { x: 0, y: 0 },
    clampToScene: true,
  };
}

function InstanceInspector({
  store,
  scene,
  instance,
  prototype,
}: {
  store: Store;
  scene: Scene;
  instance: EntityInstance;
  prototype: EntityPrototype;
}) {
  const change = (changes: Partial<EntityInstance>) =>
    store.apply(edit.updateInstance(scene.id, { ...instance, ...changes }));

  return (
    <Panel title={`This ${prototype.name ?? prototype.id}`}>
      <Note>
        One copy of <code>{prototype.id}</code>. Change the kind of thing itself to change every
        copy.
      </Note>
      <Field label="Name">
        <TextInput
          value={instance.name ?? ''}
          onChange={(name) => change({ name: name || undefined })}
        />
      </Field>
      <div className="pair">
        <Field label="Across" hint="Pixels from the left edge of the level.">
          <NumberInput value={instance.x} onChange={(x) => change({ x })} />
        </Field>
        <Field label="Down" hint="Pixels from the top. Down is positive.">
          <NumberInput value={instance.y} onChange={(y) => change({ y })} />
        </Field>
      </div>
      <Checkbox
        label="Stays still on screen"
        checked={instance.fixedToCamera}
        onChange={(fixedToCamera) => change({ fixedToCamera })}
        hint="Does not scroll with the level. This is how a score is shown."
      />

      {prototype.properties.length > 0 ? (
        <>
          <h2 style={{ marginTop: 16 }}>Its own values</h2>
          {prototype.properties.map((property) => (
            <Field key={property.id} label={property.name ?? property.id}>
              <TextInput
                value={String(instance.properties[property.id] ?? property.initial)}
                onChange={(raw) =>
                  change({
                    properties: {
                      ...instance.properties,
                      [property.id]: coerce(raw, property.type),
                    },
                  })
                }
              />
            </Field>
          ))}
        </>
      ) : null}

      {prototype.components.movement ? (
        <details>
          <summary style={{ cursor: 'pointer', margin: '12px 0 8px', color: 'var(--ink-soft)' }}>
            Move differently from the others
          </summary>
          <Field label="Top speed" hint="Leave empty to move like every other one of these.">
            <NumberInput
              value={
                instance.overrides.movement?.maxSpeed ?? prototype.components.movement.maxSpeed
              }
              onChange={(maxSpeed) =>
                change({
                  overrides: {
                    ...instance.overrides,
                    movement: { ...instance.overrides.movement, maxSpeed },
                  },
                })
              }
            />
          </Field>
        </details>
      ) : null}

      <Button
        small
        kind="danger"
        onClick={() => store.apply(edit.removeInstance(scene.id, instance.id))}
      >
        Remove it from this level
      </Button>
    </Panel>
  );
}

function PrototypeInspector({ store, prototype }: { store: Store; prototype: EntityPrototype }) {
  const project = store.getState().project;
  const images = project.assets.filter((one) => one.kind === 'image');
  const change = (changes: Partial<EntityPrototype>) =>
    store.apply(edit.updatePrototype({ ...prototype, ...changes }));
  const components = (changes: Partial<EntityPrototype['components']>) =>
    change({ components: { ...prototype.components, ...changes } });

  const movement = prototype.components.movement;
  const sprite = prototype.components.sprite;

  return (
    <Panel title="This kind of thing">
      <Note>
        Every copy of <code>{prototype.id}</code> in every level changes with this.
      </Note>
      <Field label="Name">
        <TextInput
          value={prototype.name ?? ''}
          onChange={(name) => change({ name: name || undefined })}
        />
      </Field>
      <div className="pair">
        <Field
          label="Width"
          hint="The box that actually touches things, in pixels. The picture may be bigger."
        >
          <NumberInput
            min={1}
            value={prototype.size.width}
            onChange={(width) => change({ size: { ...prototype.size, width } })}
          />
        </Field>
        <Field label="Height">
          <NumberInput
            min={1}
            value={prototype.size.height}
            onChange={(height) => change({ size: { ...prototype.size, height } })}
          />
        </Field>
      </div>
      <Field
        label="Tags"
        hint="Words a rule can use to mean a group of things, such as enemy. Separate them with commas."
      >
        <TextInput
          value={prototype.tags.join(', ')}
          onChange={(raw) =>
            change({
              tags: raw
                .split(',')
                .map((one) =>
                  one
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, '-'),
                )
                .filter(Boolean),
            })
          }
        />
      </Field>

      <h2 style={{ marginTop: 16 }}>What it looks like</h2>
      {sprite ? (
        <>
          <Field label="Picture">
            <Select
              value={sprite.image}
              onChange={(image) => components({ sprite: { ...sprite, image } })}
              choices={images.map((one) => ({ value: one.id, label: one.name ?? one.id }))}
            />
          </Field>
          <div className="pair">
            <Field
              label="Frame width"
              hint="One picture can hold several frames side by side. This is the width of one of them."
            >
              <NumberInput
                min={1}
                value={sprite.frameWidth}
                onChange={(frameWidth) => components({ sprite: { ...sprite, frameWidth } })}
              />
            </Field>
            <Field label="Frame height">
              <NumberInput
                min={1}
                value={sprite.frameHeight}
                onChange={(frameHeight) => components({ sprite: { ...sprite, frameHeight } })}
              />
            </Field>
          </div>
          <div className="pair">
            <Field
              label="Picture across"
              hint="Nudges the picture against the box, so art can hang over the edges."
            >
              <NumberInput
                value={sprite.offset.x}
                onChange={(x) =>
                  components({ sprite: { ...sprite, offset: { ...sprite.offset, x } } })
                }
              />
            </Field>
            <Field label="Picture down">
              <NumberInput
                value={sprite.offset.y}
                onChange={(y) =>
                  components({ sprite: { ...sprite, offset: { ...sprite.offset, y } } })
                }
              />
            </Field>
          </div>
          <Checkbox
            label="Mirror it when going left"
            checked={sprite.flipToFaceMovement}
            onChange={(flipToFaceMovement) =>
              components({ sprite: { ...sprite, flipToFaceMovement } })
            }
            hint="Saves drawing the same thing twice."
          />
          <Animations
            sprite={sprite}
            onChange={(animations) => components({ sprite: { ...sprite, animations } })}
          />
          <Field label="Starts on">
            <Select
              value={sprite.defaultAnimation ?? ''}
              placeholder="Nothing"
              onChange={(id) =>
                components({ sprite: { ...sprite, defaultAnimation: id || undefined } })
              }
              choices={sprite.animations.map((one) => ({
                value: one.id,
                label: one.name ?? one.id,
              }))}
            />
          </Field>
        </>
      ) : (
        <Button
          small
          disabled={images.length === 0 || Boolean(prototype.components.text)}
          onClick={() =>
            components({
              sprite: {
                image: images[0]!.id,
                frameWidth: prototype.size.width,
                frameHeight: prototype.size.height,
                offset: { x: 0, y: 0 },
                flipToFaceMovement: false,
                animations: [],
              },
            })
          }
        >
          {images.length === 0 ? 'Add a picture first' : 'Give it a picture'}
        </Button>
      )}

      <h2 style={{ marginTop: 16 }}>How it touches things</h2>
      <Field
        label="When it hits something"
        hint="Solid is pushed out of walls. A trigger passes through and only tells the rules it was touched. None never touches anything."
      >
        <Select
          value={prototype.components.collider?.kind ?? 'none'}
          onChange={(kind) =>
            components({
              collider:
                kind === 'none' && !prototype.components.collider
                  ? undefined
                  : {
                      kind: kind as 'solid' | 'trigger' | 'none',
                      collidesWithTiles: prototype.components.collider?.collidesWithTiles ?? true,
                    },
            })
          }
          choices={[
            { value: 'solid', label: 'Solid' },
            { value: 'trigger', label: 'Passes through' },
            { value: 'none', label: 'Never touches anything' },
          ]}
        />
      </Field>

      <h2 style={{ marginTop: 16 }}>How it moves</h2>
      <Field
        label="What kind of moving"
        hint="Walking and jumping has gravity. Free movement has none, for a puzzle or a top down game."
      >
        <Select
          value={movement?.mode ?? 'none'}
          onChange={(mode) => components({ movement: movementOfMode(mode) })}
          choices={[
            { value: 'none', label: 'It does not move' },
            { value: 'platform', label: 'Walking and jumping' },
            { value: 'free', label: 'Free movement' },
          ]}
        />
      </Field>
      {movement ? (
        <MovementFields movement={movement} onChange={(next) => components({ movement: next })} />
      ) : null}

      {prototype.components.text ? (
        <>
          <h2 style={{ marginTop: 16 }}>Text</h2>
          <Field
            label="What it says"
            hint="Put a variable in curly brackets to show its value, like Score: {score}"
          >
            <TextInput
              value={prototype.components.text.content}
              onChange={(content) =>
                components({ text: { ...prototype.components.text!, content } })
              }
            />
          </Field>
        </>
      ) : (
        <Button
          small
          disabled={Boolean(sprite)}
          onClick={() =>
            components({
              text: { content: 'Score: {score}', color: '#ffffff', align: 'left', size: 'normal' },
            })
          }
        >
          Show text instead of a picture
        </Button>
      )}

      <div style={{ marginTop: 16 }}>
        <Button small kind="danger" onClick={() => store.apply(edit.removePrototype(prototype.id))}>
          Delete this kind of thing
        </Button>
      </div>
    </Panel>
  );
}

function movementOfMode(mode: string): MovementComponent | undefined {
  if (mode === 'platform') {
    return {
      mode: 'platform',
      controlledBy: 'player',
      maxSpeed: 90,
      acceleration: 600,
      deceleration: 900,
      airControl: 0.7,
      gravity: 900,
      fallGravityMultiplier: 1.7,
      maxFallSpeed: 320,
      jumpHeight: 44,
      jumpCount: 1,
      variableJumpHeight: true,
      coyoteTime: 0.1,
      jumpBufferTime: 0.12,
    };
  }
  if (mode === 'free') {
    return {
      mode: 'free',
      controlledBy: 'player',
      maxSpeed: 90,
      acceleration: 600,
      deceleration: 900,
      axes: 'both',
    };
  }
  return undefined;
}

function MovementFields({
  movement,
  onChange,
}: {
  movement: MovementComponent;
  onChange: (movement: MovementComponent) => void;
}) {
  return (
    <>
      <Field
        label="Who moves it"
        hint="The player, using the controls, or only the rules you write."
      >
        <Select
          value={movement.controlledBy}
          onChange={(controlledBy) =>
            onChange({ ...movement, controlledBy: controlledBy as 'player' | 'rules' })
          }
          choices={[
            { value: 'player', label: 'The player' },
            { value: 'rules', label: 'Only the rules' },
          ]}
        />
      </Field>
      <Field label="Top speed">
        <NumberInput
          value={movement.maxSpeed}
          onChange={(maxSpeed) => onChange({ ...movement, maxSpeed })}
        />
      </Field>
      {movement.mode === 'platform' ? (
        <>
          <Field
            label="Jump height"
            hint="How high a jump reaches, in pixels. Sixteen pixels is one tile."
          >
            <NumberInput
              value={movement.jumpHeight}
              onChange={(jumpHeight) => onChange({ ...movement, jumpHeight })}
            />
          </Field>
          <Field label="Jumps in a row" hint="Two makes a double jump.">
            <NumberInput
              min={0}
              max={8}
              value={movement.jumpCount}
              onChange={(jumpCount) => onChange({ ...movement, jumpCount })}
            />
          </Field>
          <details>
            <summary style={{ cursor: 'pointer', margin: '10px 0', color: 'var(--ink-soft)' }}>
              How it feels
            </summary>
            <Note>These are already set to good values. You do not need to touch them.</Note>
            <Field
              label="Falls faster than it rises by"
              hint="The single biggest reason a jump feels solid rather than floaty."
            >
              <NumberInput
                step={0.1}
                min={1}
                value={movement.fallGravityMultiplier}
                onChange={(fallGravityMultiplier) =>
                  onChange({ ...movement, fallGravityMultiplier })
                }
              />
            </Field>
            <Field
              label="Grace after a ledge"
              hint="Seconds during which a jump still works after walking off a ledge. Players press late constantly."
            >
              <NumberInput
                step={0.01}
                value={movement.coyoteTime}
                onChange={(coyoteTime) => onChange({ ...movement, coyoteTime })}
              />
            </Field>
            <Field
              label="Remembers an early jump for"
              hint="Seconds. A jump pressed just before landing fires on landing instead of doing nothing."
            >
              <NumberInput
                step={0.01}
                value={movement.jumpBufferTime}
                onChange={(jumpBufferTime) => onChange({ ...movement, jumpBufferTime })}
              />
            </Field>
            <Field label="Gravity">
              <NumberInput
                value={movement.gravity}
                onChange={(gravity) => onChange({ ...movement, gravity })}
              />
            </Field>
          </details>
          <Patrol
            movement={movement}
            directions={['left', 'right']}
            onChange={(patrol) => onChange({ ...movement, patrol })}
          />
        </>
      ) : (
        <>
          <Field label="Which way it can move">
            <Select
              value={movement.axes}
              onChange={(axes) =>
                onChange({ ...movement, axes: axes as 'both' | 'horizontal' | 'vertical' })
              }
              choices={['both', 'horizontal', 'vertical'].map((one) => ({
                value: one,
                label: readable(one),
              }))}
            />
          </Field>
          <Patrol
            movement={movement}
            directions={
              movement.axes === 'horizontal'
                ? ['left', 'right']
                : movement.axes === 'vertical'
                  ? ['up', 'down']
                  : ['left', 'right', 'up', 'down']
            }
            onChange={(patrol) => onChange({ ...movement, patrol })}
          />
        </>
      )}
    </>
  );
}

type PatrolDirection = 'left' | 'right' | 'up' | 'down';
type PatrolConfig = NonNullable<MovementComponent['patrol']>;

/**
 * "Walks back and forth by itself", for both kinds of movement. Which way it
 * can set off depends on the movement: something with gravity cannot patrol
 * upwards, and something locked to one axis cannot patrol across the other.
 */
function Patrol({
  movement,
  directions,
  onChange,
}: {
  movement: MovementComponent;
  directions: readonly PatrolDirection[];
  onChange: (patrol: PatrolConfig | undefined) => void;
}) {
  const patrol = movement.patrol;
  const first = directions[0] ?? 'left';
  return (
    <>
      <Checkbox
        label="Walks back and forth by itself"
        checked={Boolean(patrol)}
        hint="Turns around at a wall, with no rules at all. What most simple enemies need."
        onChange={(on) =>
          onChange(on ? { direction: first, turnAtWalls: true, turnAtLedges: true } : undefined)
        }
      />
      {patrol ? (
        <Field label="Sets off going">
          <Select
            value={
              directions.includes(patrol.direction as PatrolDirection) ? patrol.direction : first
            }
            onChange={(direction) =>
              onChange({ ...patrol, direction: direction as PatrolDirection })
            }
            choices={directions.map((one) => ({ value: one, label: readable(one) }))}
          />
        </Field>
      ) : null}
    </>
  );
}

function Animations({
  sprite,
  onChange,
}: {
  sprite: NonNullable<EntityPrototype['components']['sprite']>;
  onChange: (animations: Animation[]) => void;
}) {
  return (
    <>
      <h2 style={{ marginTop: 14 }}>Animations</h2>
      {sprite.animations.map((animation, index) => (
        <div key={animation.id} className="panel plain" style={{ marginBottom: 8 }}>
          <Field label="Name">
            <TextInput
              value={animation.id}
              onChange={(id) =>
                onChange(
                  sprite.animations.map((one, at) =>
                    at === index
                      ? { ...one, id: id.toLowerCase().replace(/[^a-z0-9-]/g, '-') }
                      : one,
                  ),
                )
              }
            />
          </Field>
          <Field
            label="Frames"
            hint="Frame numbers from the picture, counting from 0, separated by commas."
          >
            <TextInput
              value={animation.frames.join(', ')}
              onChange={(raw) => {
                const frames = raw
                  .split(',')
                  .map((one) => Number(one.trim()))
                  .filter((one) => Number.isInteger(one) && one >= 0);
                if (frames.length > 0) {
                  onChange(
                    sprite.animations.map((one, at) => (at === index ? { ...one, frames } : one)),
                  );
                }
              }}
            />
          </Field>
          <div className="pair">
            <Field label="Frames a second">
              <NumberInput
                min={1}
                value={animation.fps}
                onChange={(fps) =>
                  onChange(
                    sprite.animations.map((one, at) => (at === index ? { ...one, fps } : one)),
                  )
                }
              />
            </Field>
            <Checkbox
              label="Repeats"
              checked={animation.loop}
              onChange={(loop) =>
                onChange(
                  sprite.animations.map((one, at) => (at === index ? { ...one, loop } : one)),
                )
              }
            />
          </div>
          <Button
            small
            kind="quiet"
            onClick={() => onChange(sprite.animations.filter((_, at) => at !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        small
        onClick={() =>
          onChange([
            ...sprite.animations,
            { id: `animation-${sprite.animations.length + 1}`, frames: [0], fps: 8, loop: true },
          ])
        }
      >
        Add an animation
      </Button>
    </>
  );
}

function LayerInspector({ store, scene, layer }: { store: Store; scene: Scene; layer: TileLayer }) {
  const project = store.getState().project;
  const change = (changes: Partial<TileLayer>) =>
    store.apply(edit.updateLayer(scene.id, { ...layer, ...changes }));

  return (
    <Panel title="This layer">
      <Field label="Name">
        <TextInput
          value={layer.name ?? ''}
          onChange={(name) => change({ name: name || undefined })}
        />
      </Field>
      <Field label="Tiles from">
        <Select
          value={layer.tileset}
          onChange={(tileset) => change({ tileset })}
          choices={project.tilesets.map((one) => ({ value: one.id, label: one.name ?? one.id }))}
        />
      </Field>
      <Checkbox
        label="Things are stopped by it"
        checked={layer.collides}
        onChange={(collides) => change({ collides })}
        hint="Only tiles tagged solid or one-way stop anything, and only on a layer with this switched on."
      />
      <Checkbox
        label="Visible"
        checked={layer.visible}
        onChange={(visible) => change({ visible })}
      />
      <Checkbox
        label="Things are drawn in front of it"
        checked={layer.drawEntitiesAfter}
        onChange={(drawEntitiesAfter) => change({ drawEntitiesAfter })}
      />
      <Field
        label="Scrolls at"
        hint="1 moves with the level. 0.5 lags behind, which makes a distant background."
      >
        <NumberInput
          step={0.1}
          value={layer.parallax.x}
          onChange={(x) => change({ parallax: { ...layer.parallax, x } })}
        />
      </Field>
      <Button small kind="danger" onClick={() => store.apply(edit.removeLayer(scene.id, layer.id))}>
        Delete this layer
      </Button>
    </Panel>
  );
}

function coerce(raw: string, type: 'number' | 'boolean' | 'text'): number | boolean | string {
  if (type === 'number') {
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }
  if (type === 'boolean') return raw === 'true' || raw === 'yes';
  return raw;
}
