import {
  errorsAmong,
  parseProject,
  validateProject,
  warningsAmong,
  type Project,
  type ValidationIssue,
} from '@pinforge/schema';
import type { Command } from './commands.js';

export type Tab = 'level' | 'rules' | 'assets' | 'settings';
export type Tool = 'select' | 'paint' | 'erase';

export type Selection =
  | { kind: 'none' }
  | { kind: 'instance'; id: string }
  | { kind: 'prototype'; id: string }
  | { kind: 'layer'; id: string }
  | { kind: 'scene'; id: string }
  | { kind: 'rule'; id: string; scene: string | undefined };

export interface EditorState {
  readonly project: Project;
  readonly sceneId: string;
  readonly tab: Tab;
  readonly tool: Tool;
  readonly selection: Selection;
  readonly activeLayerId: string | undefined;
  readonly paintTile: number | null;
  readonly brushSize: number;
  readonly playing: boolean;
  readonly zoom: number;
  /** Set when a change is refused, so the interface can say why. */
  readonly problem: string | undefined;
  /** Set when something worked and there is a next step worth naming. */
  readonly notice: string | undefined;
  readonly savedAt: number | undefined;
  readonly changedSinceSave: boolean;
  readonly undoLabel: string | undefined;
  readonly redoLabel: string | undefined;
}

interface Snapshot {
  readonly project: Project;
  readonly label: string;
  readonly mergeKey: string | undefined;
}

const HISTORY_LIMIT = 200;

/**
 * The editor's state, kept outside React so the canvas, the panels and play
 * mode all read exactly the same thing.
 *
 * Project changes go through commands and are undoable. Everything else here is
 * about what the user is looking at, and is not.
 */
export class EditorStore {
  private state: EditorState;
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(project: Project) {
    const scene =
      project.scenes.find((one) => one.id === project.settings.startScene) ?? project.scenes[0];
    this.state = {
      project,
      sceneId: scene?.id ?? project.settings.startScene,
      tab: 'level',
      tool: 'select',
      selection: { kind: 'none' },
      activeLayerId: scene?.layers.find((layer) => layer.collides)?.id ?? scene?.layers[0]?.id,
      paintTile: 0,
      brushSize: 1,
      playing: false,
      zoom: 2,
      problem: undefined,
      notice: undefined,
      savedAt: undefined,
      changedSinceSave: false,
      undoLabel: undefined,
      redoLabel: undefined,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): EditorState => this.state;

  /**
   * Applies a change to the project. Refuses anything that would break it, and
   * lets through anything that is merely unwise, with a word about why.
   */
  apply(command: Command): void {
    let next: Project;
    let advice: string | undefined;
    try {
      next = command.run(this.state.project);
      const issues = validateProject(next);
      const errors = errorsAmong(issues);
      if (errors.length > 0) throw new RefusedChange(errors);
      advice = adviceFrom(issues);
    } catch (error) {
      this.set({ problem: explain(error) });
      return;
    }

    const top = this.past[this.past.length - 1];
    const merging =
      command.mergeKey !== undefined && top !== undefined && top.mergeKey === command.mergeKey;
    if (!merging) {
      this.past.push({
        project: this.state.project,
        label: command.label,
        mergeKey: command.mergeKey,
      });
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.future = [];
    this.set({ project: next, problem: advice, notice: undefined, changedSinceSave: true });
  }

  undo(): void {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push({ ...previous, project: this.state.project });
    this.set({
      project: previous.project,
      changedSinceSave: true,
      problem: undefined,
      notice: undefined,
    });
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push({ ...next, project: this.state.project });
    this.set({
      project: next.project,
      changedSinceSave: true,
      problem: undefined,
      notice: undefined,
    });
  }

  /** Replaces the whole project, as when a file is opened. Clears the history. */
  replaceProject(document: unknown): void {
    try {
      const project = parseProject(document);
      const errors = errorsAmong(validateProject(project));
      if (errors.length > 0) throw new RefusedChange(errors);
      this.past = [];
      this.future = [];
      const scene = project.scenes.find((one) => one.id === project.settings.startScene);
      this.state = {
        ...this.state,
        project,
        sceneId: scene?.id ?? project.scenes[0]!.id,
        selection: { kind: 'none' },
        activeLayerId: scene?.layers[0]?.id,
        playing: false,
        problem: undefined,
        notice: undefined,
        changedSinceSave: false,
      };
      this.announce();
    } catch (error) {
      this.set({ problem: explain(error) });
    }
  }

  /** Changes what the user is looking at. Never undoable. */
  set(changes: Partial<EditorState>): void {
    this.state = { ...this.state, ...changes };
    this.announce();
  }

  markSaved(): void {
    this.set({ savedAt: Date.now(), changedSinceSave: false });
  }

  get scene() {
    return (
      this.state.project.scenes.find((one) => one.id === this.state.sceneId) ??
      this.state.project.scenes[0]!
    );
  }

  private announce(): void {
    this.state = {
      ...this.state,
      undoLabel: this.past[this.past.length - 1]?.label,
      redoLabel: this.future[this.future.length - 1]?.label,
    };
    for (const listener of this.listeners) listener();
  }
}

class RefusedChange extends Error {
  constructor(readonly issues: readonly ValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(' '));
  }
}

/** What to say about a change that was allowed but is probably not meant. */
function adviceFrom(issues: readonly ValidationIssue[]): string | undefined {
  const warnings = warningsAmong(issues);
  if (warnings.length === 0) return undefined;
  return `Worth a look: ${warnings.map((issue) => issue.message).join('\n')}`;
}

function explain(error: unknown): string {
  if (error instanceof RefusedChange) {
    return error.issues.map((issue) => issue.message).join('\n');
  }
  return error instanceof Error ? error.message : String(error);
}
