import type { Project } from '@pinforge/schema';

const AUTOSAVE_KEY = 'pinforge.project';
const AUTOSAVE_DELAY = 1500;

/**
 * Autosave goes to the browser, so closing the tab by accident is not a
 * catastrophe. Saving to a file is always explicit, because the file is the
 * thing a person actually owns.
 */
export function readAutosave(): unknown {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function forgetAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // A browser with storage switched off is allowed; it just loses autosave.
  }
}

export function autosave(project: Project): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
  } catch {
    // Usually means the project is bigger than the browser will store, which is
    // a reason to save to a file, not a reason to stop working.
  }
}

/** Saves at most once every AUTOSAVE_DELAY milliseconds. */
export function makeAutosaver(save: (project: Project) => void = autosave): {
  schedule(project: Project): void;
  cancel(): void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule(project) {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => save(project), AUTOSAVE_DELAY);
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}

export function projectFileName(project: Project): string {
  const slug = project.meta.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${slug || 'game'}.pinforge.json`;
}

export function downloadProject(project: Project): void {
  const text = `${JSON.stringify(project, null, 2)}\n`;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = projectFileName(project);
  link.click();
  URL.revokeObjectURL(url);
}

export async function readProjectFile(file: File): Promise<unknown> {
  const text = await file.text();
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${file.name} is not a PinForge game file: ${(error as Error).message}`);
  }
}

/** Turns a picture or sound the user picked into something a project can hold. */
export function fileToDataUri(file: File): Promise<string> {
  return new Promise((settle, fail) => {
    const reader = new FileReader();
    reader.onload = () => settle(String(reader.result));
    reader.onerror = () => fail(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
