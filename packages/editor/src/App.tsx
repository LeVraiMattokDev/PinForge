import { useEffect, useMemo, useRef } from 'react';
import { EditorAssets } from './assets.js';
import { setProjectName } from './state/commands.js';
import { PlayOverlay } from './PlayOverlay.js';
import { Inspector } from './panels/Inspector.js';
import { Sidebar } from './panels/Sidebar.js';
import { downloadProject, makeAutosaver, readProjectFile } from './state/storage.js';
import { useEditor, useEditorState } from './state/useStore.js';
import { AssetsView } from './views/AssetsView.js';
import { LevelView } from './views/LevelView.js';
import { RulesView } from './views/RulesView.js';
import { SettingsView } from './views/SettingsView.js';
import { Button } from './ui/controls.js';
import type { Tab } from './state/store.js';

const TABS: { value: Tab; label: string }[] = [
  { value: 'level', label: 'Level' },
  { value: 'rules', label: 'Rules' },
  { value: 'assets', label: 'Pictures and sounds' },
  { value: 'settings', label: 'Settings' },
];

export function App() {
  const store = useEditor();
  const state = useEditorState();
  const opener = useRef<HTMLInputElement>(null);

  // One asset loader for the whole editor, redrawing what is on screen as
  // pictures arrive.
  const assets = useMemo(() => new EditorAssets(() => store.set({})), [store]);
  assets.sync(state.project);

  const autosaver = useMemo(() => makeAutosaver(), []);
  useEffect(() => {
    autosaver.schedule(state.project);
  }, [autosaver, state.project]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        store.undo();
      } else if (
        (event.key.toLowerCase() === 'z' && event.shiftKey) ||
        event.key.toLowerCase() === 'y'
      ) {
        event.preventDefault();
        store.redo();
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        downloadProject(store.getState().project);
        store.markSaved();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  return (
    <div className="shell">
      <header className="header">
        <span className="wordmark">
          Pin<span>Forge</span>
        </span>
        <input
          className="project-name"
          value={state.project.meta.name}
          aria-label="The name of the game"
          onChange={(event) => store.apply(setProjectName(event.target.value))}
        />
        <span className="spacer" />
        <span className="saved-note">
          {state.changedSinceSave ? 'Kept in this browser' : 'Saved'}
        </span>
        <Button
          kind="quiet"
          onClick={() => store.undo()}
          disabled={state.undoLabel === undefined}
          title={state.undoLabel ? `Undo: ${state.undoLabel}` : 'Nothing to undo'}
        >
          Undo
        </Button>
        <Button
          kind="quiet"
          onClick={() => store.redo()}
          disabled={state.redoLabel === undefined}
          title={state.redoLabel ? `Redo: ${state.redoLabel}` : 'Nothing to redo'}
        >
          Redo
        </Button>
        <Button onClick={() => opener.current?.click()}>Open a file</Button>
        <Button
          onClick={() => {
            downloadProject(state.project);
            store.markSaved();
          }}
        >
          Save to a file
        </Button>
        <Button kind="primary" onClick={() => store.set({ playing: true })}>
          Play
        </Button>
        <input
          ref={opener}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void readProjectFile(file)
              .then((document) => store.replaceProject(document))
              .catch((error: Error) => store.set({ problem: error.message }));
            event.target.value = '';
          }}
        />
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            className="tab"
            aria-selected={state.tab === tab.value}
            onClick={() => store.set({ tab: tab.value })}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/*
        One row for either banner, never both, so the row the editor itself
        lives in is never the one a banner grows into.
      */}
      {state.problem !== undefined ? (
        <div className="problem" role="alert">
          <span>{state.problem}</span>
          <Button small kind="quiet" onClick={() => store.set({ problem: undefined })}>
            Close
          </Button>
        </div>
      ) : state.notice !== undefined ? (
        <div className="notice" role="status">
          <span>{state.notice}</span>
          <Button small kind="quiet" onClick={() => store.set({ notice: undefined })}>
            Close
          </Button>
        </div>
      ) : null}

      <main className={`body${state.tab === 'level' ? '' : ' wide'}`}>
        {state.tab === 'level' ? (
          <>
            <div className="column">
              <Sidebar />
            </div>
            <LevelView assets={assets} />
            <div className="column">
              <Inspector />
            </div>
          </>
        ) : null}
        {state.tab === 'rules' ? <RulesView /> : null}
        {state.tab === 'assets' ? <AssetsView /> : null}
        {state.tab === 'settings' ? <SettingsView /> : null}
      </main>

      {state.playing ? (
        <PlayOverlay
          project={state.project}
          sceneId={state.sceneId}
          onStop={() => store.set({ playing: false })}
        />
      ) : null}
    </div>
  );
}
