export type ChangeKind = 'added' | 'removed' | 'changed';

export interface Change {
  /** Where in the project file, as a path: /scenes/0/entities/3/x */
  readonly path: string;
  readonly kind: ChangeKind;
  readonly before?: unknown;
  readonly after?: unknown;
}

const MAX_CHANGES = 80;

/**
 * What a mutation actually did, as a list. The caller of an MCP tool cannot see
 * the file, so "it worked" is not a useful answer: every mutation reports the
 * paths it touched and the values before and after.
 *
 * Large values are summarised rather than repeated, because an inlined image is
 * not something anybody wants to read back.
 */
export function diffJson(before: unknown, after: unknown, path = ''): Change[] {
  const changes: Change[] = [];
  walk(before, after, path, changes);
  return changes.slice(0, MAX_CHANGES);
}

function walk(before: unknown, after: unknown, path: string, changes: Change[]): void {
  if (changes.length >= MAX_CHANGES) return;
  if (Object.is(before, after)) return;

  if (before === undefined) {
    changes.push({ path, kind: 'added', after: summarise(after) });
    return;
  }
  if (after === undefined) {
    changes.push({ path, kind: 'removed', before: summarise(before) });
    return;
  }

  const bothArrays = Array.isArray(before) && Array.isArray(after);
  const bothObjects = !bothArrays && isPlainObject(before) && isPlainObject(after);

  if (bothArrays) {
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      walk(before[index], after[index], `${path}/${index}`, changes);
    }
    return;
  }

  if (bothObjects) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      walk(before[key], after[key], `${path}/${key}`, changes);
    }
    return;
  }

  if (JSON.stringify(before) === JSON.stringify(after)) return;
  changes.push({ path, kind: 'changed', before: summarise(before), after: summarise(after) });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function summarise(value: unknown): unknown {
  if (typeof value === 'string' && value.length > 120) {
    return `${value.slice(0, 60)}… (${value.length} characters)`;
  }
  if (Array.isArray(value) && JSON.stringify(value).length > 200) {
    return `[${value.length} items]`;
  }
  if (isPlainObject(value) && JSON.stringify(value).length > 200) {
    return `{${Object.keys(value).join(', ')}}`;
  }
  return value;
}

export function describeChanges(changes: readonly Change[]): string {
  if (changes.length === 0) return 'Nothing changed.';
  return changes
    .map((change) => {
      if (change.kind === 'added') return `+ ${change.path} = ${JSON.stringify(change.after)}`;
      if (change.kind === 'removed')
        return `- ${change.path} (was ${JSON.stringify(change.before)})`;
      return `~ ${change.path}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`;
    })
    .join('\n');
}
