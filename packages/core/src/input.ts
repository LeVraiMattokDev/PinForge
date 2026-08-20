import type { InputActions } from '@pinforge/schema';

/**
 * Input is held as named actions, never as keys. The host translates key codes
 * into action names; the simulation only ever sees "jump".
 */
export class InputState {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly released = new Set<string>();

  press(action: string): void {
    if (!this.down.has(action)) this.pressed.add(action);
    this.down.add(action);
  }

  release(action: string): void {
    if (this.down.delete(action)) this.released.add(action);
  }

  isHeld(action: string): boolean {
    return this.down.has(action);
  }

  wasPressed(action: string): boolean {
    return this.pressed.has(action);
  }

  wasReleased(action: string): boolean {
    return this.released.has(action);
  }

  /** Called once per simulation step, after the rules have read the edges. */
  endStep(): void {
    this.pressed.clear();
    this.released.clear();
  }

  releaseAll(): void {
    for (const action of [...this.down]) this.release(action);
  }
}

/** Which actions a key code belongs to. One key may drive several actions. */
export function actionsForKey(bindings: InputActions, code: string): string[] {
  const actions: string[] = [];
  for (const [action, keys] of Object.entries(bindings)) {
    if (keys.includes(code)) actions.push(action);
  }
  return actions;
}
