import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseProject } from '@pinforge/schema';
import { App } from './App.js';
import { EditorStore } from './state/store.js';
import { StoreContext } from './state/useStore.js';
import { readAutosave } from './state/storage.js';
import { STARTER } from './starter.generated.js';
import './theme.css';

/**
 * Opens whatever was being worked on last, and the starter project the first
 * time. Nobody should meet an empty screen.
 */
function openingProject() {
  const saved = readAutosave();
  if (saved !== undefined) {
    try {
      return parseProject(saved);
    } catch {
      // An autosave from an older, incompatible build. The starter is a better
      // answer than an error nobody can act on.
    }
  }
  return parseProject(STARTER);
}

const store = new EditorStore(openingProject());
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <StoreContext.Provider value={store}>
        <App />
      </StoreContext.Provider>
    </StrictMode>,
  );
}
