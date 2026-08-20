import { parseProject, type EntityInstance, type Scene } from '@pinforge/schema';
import * as edit from '../state/commands.js';
import { useEditor, useEditorState } from '../state/useStore.js';
import { Button, Note, Panel } from '../ui/controls.js';

/**
 * The left column: which level, what is in it, and what kinds of thing exist.
 * Three short lists rather than one tree, because three short lists can be read
 * at a glance and a tree cannot.
 */
export function Sidebar() {
  const store = useEditor();
  const state = useEditorState();
  const project = state.project;
  const scene = store.scene;

  return (
    <>
      <Panel
        title="Levels"
        action={
          <Button small kind="quiet" onClick={() => addLevel(store, project.scenes)}>
            Add
          </Button>
        }
      >
        <ul className="list">
          {project.scenes.map((one) => (
            <li key={one.id}>
              <button
                type="button"
                className="row"
                aria-current={one.id === scene.id}
                onClick={() =>
                  store.set({
                    sceneId: one.id,
                    selection: { kind: 'scene', id: one.id },
                    activeLayerId: one.layers[0]?.id,
                  })
                }
              >
                {one.name ?? one.id}
                {project.settings.startScene === one.id ? (
                  <span className="muted">starts here</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={`In ${scene.name ?? scene.id}`}>
        {scene.entities.length === 0 ? (
          <Note>Nothing here yet. Place something from the list below.</Note>
        ) : (
          <ul className="list">
            {scene.entities.map((instance) => (
              <li key={instance.id}>
                <button
                  type="button"
                  className="row"
                  aria-current={
                    state.selection.kind === 'instance' && state.selection.id === instance.id
                  }
                  onClick={() =>
                    store.set({ selection: { kind: 'instance', id: instance.id }, tool: 'select' })
                  }
                >
                  {instance.name ?? instance.id}
                  <span className="muted">{instance.prototype}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {scene.layers.length > 0 ? (
          <>
            <h2 style={{ marginTop: 14 }}>Layers</h2>
            <ul className="list">
              {scene.layers.map((layer) => (
                <li key={layer.id}>
                  <button
                    type="button"
                    className="row"
                    aria-current={
                      state.selection.kind === 'layer' && state.selection.id === layer.id
                    }
                    onClick={() =>
                      store.set({
                        selection: { kind: 'layer', id: layer.id },
                        activeLayerId: layer.id,
                      })
                    }
                  >
                    {layer.name ?? layer.id}
                    <span className="muted">{layer.collides ? 'solid' : 'decoration'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Button small onClick={() => addGroundLayer(store, scene, project.tilesets[0]?.id)}>
            Add a layer to paint on
          </Button>
        )}
      </Panel>

      <Panel title="Kinds of thing">
        {project.entities.length === 0 ? (
          <Note>Nothing yet. Add a picture first, then make something that uses it.</Note>
        ) : (
          <ul className="list">
            {project.entities.map((prototype) => (
              <li key={prototype.id} style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  type="button"
                  className="row"
                  aria-current={
                    state.selection.kind === 'prototype' && state.selection.id === prototype.id
                  }
                  onClick={() => store.set({ selection: { kind: 'prototype', id: prototype.id } })}
                >
                  {prototype.name ?? prototype.id}
                </button>
                <Button small kind="quiet" onClick={() => place(store, scene, prototype.id)}>
                  Place
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button small onClick={() => addKind(store)}>
          Make a new kind of thing
        </Button>
      </Panel>
    </>
  );
}

type Store = ReturnType<typeof useEditor>;

export function nextId(taken: readonly string[], stem: string): string {
  if (!taken.includes(stem)) return stem;
  for (let number = 2; number < 1000; number += 1) {
    if (!taken.includes(`${stem}-${number}`)) return `${stem}-${number}`;
  }
  return `${stem}-${Date.now()}`;
}

function addLevel(store: Store, scenes: readonly Scene[]): void {
  const id = nextId(
    scenes.map((one) => one.id),
    'level',
  );
  const template = scenes[0];
  const scene = parseProject({
    formatVersion: 1,
    meta: { name: 'temporary' },
    settings: { startScene: id },
    scenes: [
      {
        id,
        name: `Level ${scenes.length + 1}`,
        tileSize: template?.tileSize ?? 16,
        size: template?.size ?? { columns: 20, rows: 10 },
        background: { color: template?.background.color ?? '#10141c' },
      },
    ],
  }).scenes[0]!;
  store.apply(edit.addScene(scene));
  store.set({ sceneId: id, selection: { kind: 'scene', id } });
}

function addGroundLayer(store: Store, scene: Scene, tilesetId: string | undefined): void {
  if (!tilesetId) {
    store.set({ problem: 'Add a picture of tiles first, on the Pictures and sounds tab.' });
    return;
  }
  const layer = {
    id: nextId(
      scene.layers.map((one) => one.id),
      'ground',
    ),
    name: 'Ground',
    tileset: tilesetId,
    collides: true,
    visible: true,
    parallax: { x: 1, y: 1 },
    drawEntitiesAfter: true,
    legend: { '.': null },
    rows: Array.from({ length: scene.size.rows }, () => '.'.repeat(scene.size.columns)),
  };
  store.apply(edit.addLayer(scene.id, layer));
  store.set({ activeLayerId: layer.id, tool: 'paint' });
}

function place(store: Store, scene: Scene, prototypeId: string): void {
  const instance: EntityInstance = {
    id: nextId(
      scene.entities.map((one) => one.id),
      prototypeId,
    ),
    prototype: prototypeId,
    x: Math.round((scene.size.columns * scene.tileSize) / 4),
    y: Math.round((scene.size.rows * scene.tileSize) / 4),
    fixedToCamera: false,
    tags: [],
    properties: {},
    overrides: {},
  };
  store.apply(edit.placeInstance(scene.id, instance));
  store.set({ selection: { kind: 'instance', id: instance.id }, tool: 'select' });
}

function addKind(store: Store): void {
  const project = store.getState().project;
  const id = nextId(
    project.entities.map((one) => one.id),
    'thing',
  );
  store.apply(
    edit.addPrototype({
      id,
      name: 'New thing',
      size: { width: 16, height: 16 },
      tags: [],
      properties: [],
      components: { collider: { kind: 'solid', collidesWithTiles: true } },
    }),
  );
  store.set({ selection: { kind: 'prototype', id } });
}
