/**
 * Errors are part of the product. A beginner and an assistant driving the MCP
 * server both read them, so they say what is wrong and where, in plain words.
 */

/** The file is not shaped like a PinForge project, or was written by another version. */
export class ProjectFormatError extends Error {
  readonly details: readonly string[];

  constructor(message: string, details: readonly string[] = []) {
    super(
      details.length > 0 ? `${message}\n${details.map((d) => `  - ${d}`).join('\n')}` : message,
    );
    this.name = 'ProjectFormatError';
    this.details = details;
  }
}

/** The file is shaped correctly but says something impossible, such as pointing at a missing scene. */
export class ProjectValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, issues: readonly ValidationIssue[]) {
    super(`${message}\n${issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`);
    this.name = 'ProjectValidationError';
    this.issues = issues;
  }
}

/**
 * error   the game would not run, or would run wrongly in a way nothing could
 *         have meant. Refused.
 * warning legal, and almost always a mistake. Said out loud, never refused,
 *         because sometimes it really is what someone meant.
 */
export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  /** Where the problem is, as a path into the document, for example /scenes/0/layers/1. */
  readonly path: string;
  /** A stable code, so tools can react without matching on wording. */
  readonly code: string;
  /** What is wrong, written for a person. */
  readonly message: string;
  readonly severity: IssueSeverity;
}

export function errorsAmong(issues: readonly ValidationIssue[]): ValidationIssue[] {
  return issues.filter((issue) => issue.severity === 'error');
}

export function warningsAmong(issues: readonly ValidationIssue[]): ValidationIssue[] {
  return issues.filter((issue) => issue.severity === 'warning');
}
