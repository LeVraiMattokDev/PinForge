import { useRef, useState } from 'react';
import type { Asset } from '@pinforge/schema';
import * as edit from '../state/commands.js';
import { fileToDataUri } from '../state/storage.js';
import { useEditor, useEditorState } from '../state/useStore.js';
import { Button, Field, Note, NumberInput, Panel, TextInput } from '../ui/controls.js';
import { nextId } from '../panels/Sidebar.js';

/**
 * PinForge imports art, it does not draw it. Anything brought in here is stored
 * inside the game file, so a game stays one file that can be moved anywhere.
 */
export function AssetsView() {
  const store = useEditor();
  const state = useEditorState();
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const add = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      const kind = file.type.startsWith('audio/') ? 'sound' : 'image';
      try {
        const source = await fileToDataUri(file);
        const id = nextId(
          state.project.assets.map((one) => one.id),
          file.name
            .replace(/\.[^.]+$/, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || kind,
        );
        const asset =
          kind === 'sound'
            ? ({ id, kind, name: file.name, source, volume: 1, loop: false } satisfies Asset)
            : ({ id, kind, name: file.name, source } satisfies Asset);
        store.apply(edit.addAsset(asset));
      } catch (error) {
        store.set({ problem: (error as Error).message });
      }
    }
    setBusy(false);
  };

  return (
    <div className="column" style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
      <Panel>
        <div className="stage-bar">
          <div>
            <strong>Pictures and sounds</strong>
            <Note>PNG pictures and WAV or MP3 sounds. They are kept inside the game file.</Note>
          </div>
          <span className="spacer" />
          <Button kind="primary" onClick={() => picker.current?.click()} disabled={busy}>
            {busy ? 'Adding…' : 'Add pictures or sounds'}
          </Button>
          <input
            ref={picker}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/gif,image/webp,audio/*"
            style={{ display: 'none' }}
            onChange={(event) => void add(event.target.files)}
          />
        </div>
      </Panel>

      {state.project.assets.length === 0 ? (
        <Panel>
          <Note>Nothing yet. Add a picture, then make something that uses it.</Note>
        </Panel>
      ) : (
        <div className="assets">
          {state.project.assets.map((asset) => (
            <div key={asset.id} className="asset">
              <div className="preview">
                {asset.kind === 'image' ? (
                  <img src={asset.source} alt={asset.name ?? asset.id} />
                ) : (
                  <span className="chip">sound</span>
                )}
              </div>
              <strong style={{ fontSize: 14 }}>{asset.name ?? asset.id}</strong>
              <div className="note">
                <code>{asset.id}</code>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {asset.kind === 'image' ? (
                  <Button small onClick={() => makeTileset(store, asset.id)}>
                    Use as tiles
                  </Button>
                ) : null}
                <Button small kind="danger" onClick={() => store.apply(edit.removeAsset(asset.id))}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Panel title="Tilesets">
        <Note>A tileset cuts a picture into a grid, and says what each tile means.</Note>
        {state.project.tilesets.map((tileset) => (
          <div key={tileset.id} className="panel plain" style={{ marginTop: 10 }}>
            <div className="stage-bar">
              <strong>{tileset.name ?? tileset.id}</strong>
              <span className="chip">{tileset.image}</span>
            </div>
            <div className="pair" style={{ marginTop: 8 }}>
              <Field label="Tile width">
                <NumberInput
                  min={1}
                  value={tileset.tileWidth}
                  onChange={(tileWidth) =>
                    store.apply(edit.updateTileset({ ...tileset, tileWidth }))
                  }
                />
              </Field>
              <Field label="Tile height">
                <NumberInput
                  min={1}
                  value={tileset.tileHeight}
                  onChange={(tileHeight) =>
                    store.apply(edit.updateTileset({ ...tileset, tileHeight }))
                  }
                />
              </Field>
            </div>
            <TileTags tileset={tileset} />
          </div>
        ))}
      </Panel>
    </div>
  );
}

function TileTags({ tileset }: { tileset: import('@pinforge/schema').Tileset }) {
  const store = useEditor();
  return (
    <>
      <Field
        label="Tiles that do something"
        hint="Write them as a number and its tags, one per line: 0 solid. Tags the engine knows are solid, one-way and hazard."
      >
        <TextInput
          value={tileset.tiles
            .map((tile) => `${tile.index} ${tile.tags.join(' ')}`.trim())
            .join('\n')}
          onChange={(raw) => {
            const tiles = raw
              .split('\n')
              .map((line) => line.trim().split(/\s+/).filter(Boolean))
              .filter((parts) => parts.length > 0 && Number.isInteger(Number(parts[0])))
              .map((parts) => ({
                index: Number(parts[0]),
                tags: parts.slice(1).map((one) => one.toLowerCase()),
              }));
            store.apply(edit.updateTileset({ ...tileset, tiles }));
          }}
        />
      </Field>
      <Note>One line per tile. Everything else in the picture is decoration.</Note>
    </>
  );
}

function makeTileset(store: ReturnType<typeof useEditor>, imageId: string): void {
  const project = store.getState().project;
  const id = nextId(
    project.tilesets.map((one) => one.id),
    `${imageId}-tiles`,
  );
  const size = project.scenes[0]?.tileSize ?? 16;
  store.apply(
    edit.addTileset({
      id,
      name: 'Tiles',
      image: imageId,
      tileWidth: size,
      tileHeight: size,
      margin: 0,
      spacing: 0,
      tiles: [{ index: 0, tags: ['solid'] }],
    }),
  );
}
