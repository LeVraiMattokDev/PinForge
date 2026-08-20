import { createContext, useContext, useSyncExternalStore } from 'react';
import type { EditorState, EditorStore } from './store.js';

export const StoreContext = createContext<EditorStore | undefined>(undefined);

export function useEditor(): EditorStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('The editor is used outside its provider.');
  return store;
}

export function useEditorState(): EditorState {
  const store = useEditor();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
