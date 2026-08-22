import { MOVEMENT_MODES, type MovementMode } from '../components.js';
import type { ActionType } from './actions.js';
import type { ConditionType } from './conditions.js';
import type { TriggerType } from './triggers.js';

/**
 * Plain language metadata for every trigger, condition and action.
 *
 * It lives next to the schema on purpose. The editor builds its dropdowns from
 * it, the MCP server describes itself with it, docs/events-reference.md is
 * generated from it, and validation uses `modes` to refuse a rule that asks an
 * entity about the ground when that entity has no gravity. One list, so none of
 * those four can drift apart.
 */
export interface CatalogEntry {
  /** What the editor shows in the dropdown. */
  readonly label: string;
  /** One sentence, written for someone who has never made a game. */
  readonly summary: string;
  /** Movement modes this applies to. Entries for every mode are always offered. */
  readonly modes: readonly MovementMode[];
  /** A valid example, checked against the schema by the test suite. */
  readonly example: Record<string, unknown>;
}

const ANY_MODE = MOVEMENT_MODES;
const PLATFORM_ONLY = ['platform'] as const satisfies readonly MovementMode[];

export const TRIGGERS: Record<TriggerType, CatalogEntry> = {
  'game-starts': {
    label: 'When the game starts',
    summary: 'Fires once, the first time the game is launched.',
    modes: ANY_MODE,
    example: { type: 'game-starts' },
  },
  'scene-starts': {
    label: 'When the scene starts',
    summary: 'Fires every time this scene is entered or restarted.',
    modes: ANY_MODE,
    example: { type: 'scene-starts' },
  },
  'every-frame': {
    label: 'Every frame',
    summary: 'Fires on every step of the simulation, sixty times a second.',
    modes: ANY_MODE,
    example: { type: 'every-frame' },
  },
  'every-seconds': {
    label: 'Every few seconds',
    summary: 'Fires on a repeating timer.',
    modes: ANY_MODE,
    example: { type: 'every-seconds', seconds: 2 },
  },
  'action-pressed': {
    label: 'When a control is pressed',
    summary: 'Fires when the player presses one of the keys bound to an action.',
    modes: ANY_MODE,
    example: { type: 'action-pressed', action: 'jump' },
  },
  'action-released': {
    label: 'When a control is released',
    summary: 'Fires when the player lets go of an action.',
    modes: ANY_MODE,
    example: { type: 'action-released', action: 'jump' },
  },
  collides: {
    label: 'When two things touch',
    summary: 'Fires the moment two entities begin to overlap.',
    modes: ANY_MODE,
    example: { type: 'collides', subject: 'player', with: 'coin' },
  },
  'collision-ends': {
    label: 'When two things stop touching',
    summary: 'Fires the moment two entities stop overlapping.',
    modes: ANY_MODE,
    example: { type: 'collision-ends', subject: 'player', with: 'tag:enemy' },
  },
  'touches-tile': {
    label: 'When something touches a kind of tile',
    summary: 'Fires while an entity overlaps a tile carrying the given tag.',
    modes: ANY_MODE,
    example: { type: 'touches-tile', subject: 'player', tag: 'hazard' },
  },
  'variable-changes': {
    label: 'When a variable changes',
    summary: 'Fires whenever something writes to that variable.',
    modes: ANY_MODE,
    example: { type: 'variable-changes', variable: 'score' },
  },
  'entity-spawned': {
    label: 'When something appears',
    summary: 'Fires when a new entity of that kind is created.',
    modes: ANY_MODE,
    example: { type: 'entity-spawned', subject: 'coin' },
  },
  'entity-destroyed': {
    label: 'When something is removed',
    summary: 'Fires when an entity of that kind is destroyed.',
    modes: ANY_MODE,
    example: { type: 'entity-destroyed', subject: 'tag:enemy' },
  },
  'leaves-scene': {
    label: 'When something leaves the level',
    summary:
      'Fires once when an entity crosses an edge of the scene, and again only if it comes back and leaves again.',
    modes: ANY_MODE,
    example: { type: 'leaves-scene', subject: 'player', edge: 'bottom' },
  },
  lands: {
    label: 'When something lands',
    summary: 'Fires when an entity touches the ground after being in the air.',
    modes: PLATFORM_ONLY,
    example: { type: 'lands', subject: 'player' },
  },
  jumps: {
    label: 'When something jumps',
    summary: 'Fires when an entity leaves the ground by jumping.',
    modes: PLATFORM_ONLY,
    example: { type: 'jumps', subject: 'player' },
  },
  clicked: {
    label: 'When something is clicked',
    summary: 'Fires when the pointer presses on an entity.',
    modes: ANY_MODE,
    example: { type: 'clicked', subject: 'start-button' },
  },
};

export const CONDITIONS: Record<ConditionType, CatalogEntry> = {
  'variable-is': {
    label: 'A variable is',
    summary: 'Compares a variable with a value.',
    modes: ANY_MODE,
    example: { type: 'variable-is', variable: 'score', operator: 'at-least', value: 3 },
  },
  'variable-compare': {
    label: 'One variable, compared with another',
    summary:
      'Compares two variables with each other rather than with a fixed number, which is what a best score needs.',
    modes: ANY_MODE,
    example: {
      type: 'variable-compare',
      left: 'score',
      operator: 'greater-than',
      right: 'high-score',
    },
  },
  'property-is': {
    label: 'A property is',
    summary: 'Compares a custom property on an entity with a value.',
    modes: ANY_MODE,
    example: {
      type: 'property-is',
      target: '$self',
      property: 'hits-left',
      operator: 'at-most',
      value: 0,
    },
  },
  'has-tag': {
    label: 'Has the tag',
    summary: 'True when the entity carries that tag.',
    modes: ANY_MODE,
    example: { type: 'has-tag', target: '$other', tag: 'enemy' },
  },
  'entity-exists': {
    label: 'Something still exists',
    summary: 'True while at least one entity of that kind is alive.',
    modes: ANY_MODE,
    example: { type: 'entity-exists', entity: 'coin', negate: true },
  },
  'action-held': {
    label: 'A control is held down',
    summary: 'True while the player holds an action.',
    modes: ANY_MODE,
    example: { type: 'action-held', action: 'down' },
  },
  'distance-is': {
    label: 'The distance between two things is',
    summary: 'Compares the distance between two entities with a number of pixels.',
    modes: ANY_MODE,
    example: { type: 'distance-is', from: '$self', to: 'player', operator: 'at-most', pixels: 64 },
  },
  chance: {
    label: 'By chance',
    summary: 'True a percentage of the time.',
    modes: ANY_MODE,
    example: { type: 'chance', percent: 25 },
  },
  'current-scene-is': {
    label: 'The current level is',
    summary: 'True while that scene is the one running. Useful for global rules.',
    modes: ANY_MODE,
    example: { type: 'current-scene-is', scene: 'level-1' },
  },
  'is-on-ground': {
    label: 'Is standing on the ground',
    summary: 'True while the entity has something solid under its feet.',
    modes: PLATFORM_ONLY,
    example: { type: 'is-on-ground', target: '$self' },
  },
  'is-falling': {
    label: 'Is falling',
    summary: 'True while the entity is moving downwards through the air.',
    modes: PLATFORM_ONLY,
    example: { type: 'is-falling', target: '$self' },
  },
};

export const ACTIONS: Record<ActionType, CatalogEntry> = {
  destroy: {
    label: 'Remove',
    summary: 'Takes an entity out of the level.',
    modes: ANY_MODE,
    example: { type: 'destroy', target: '$other' },
  },
  spawn: {
    label: 'Create',
    summary: 'Adds a new copy of an entity at a position.',
    modes: ANY_MODE,
    example: { type: 'spawn', entity: 'coin', x: 0, y: -12, relativeTo: '$self' },
  },
  move: {
    label: 'Set the speed of',
    summary: 'Sets or adds to how fast an entity is moving. Leave an axis out to keep it as it is.',
    modes: ANY_MODE,
    example: { type: 'move', target: '$self', mode: 'set', x: -24 },
  },
  teleport: {
    label: 'Move instantly to',
    summary: 'Puts an entity at a position, with no movement in between.',
    modes: ANY_MODE,
    example: { type: 'teleport', target: 'player', x: 24, y: 112 },
  },
  jump: {
    label: 'Jump',
    summary: 'Makes an entity jump, optionally to a different height than usual.',
    modes: PLATFORM_ONLY,
    example: { type: 'jump', target: '$self', height: 28 },
  },
  'set-variable': {
    label: 'Set a variable to',
    summary: 'Writes a value into a variable.',
    modes: ANY_MODE,
    example: { type: 'set-variable', variable: 'lives', value: 3 },
  },
  'change-variable': {
    label: 'Change a variable by',
    summary: 'Adds to, subtracts from, multiplies or divides a number variable.',
    modes: ANY_MODE,
    example: { type: 'change-variable', variable: 'score', operator: 'add', value: 1 },
  },
  'copy-variable': {
    label: 'Copy a variable into another',
    summary: 'Puts what one variable holds into another one, for remembering a best score.',
    modes: ANY_MODE,
    example: { type: 'copy-variable', from: 'score', into: 'high-score' },
  },
  'set-property': {
    label: 'Set a property to',
    summary: 'Writes a value into a custom property on an entity.',
    modes: ANY_MODE,
    example: { type: 'set-property', target: '$self', property: 'hits-left', value: 2 },
  },
  'change-property': {
    label: 'Change a property by',
    summary: 'Adds to, subtracts from, multiplies or divides a number property.',
    modes: ANY_MODE,
    example: {
      type: 'change-property',
      target: '$self',
      property: 'hits-left',
      operator: 'subtract',
      value: 1,
    },
  },
  'play-animation': {
    label: 'Play the animation',
    summary: 'Switches an entity to one of its animations.',
    modes: ANY_MODE,
    example: { type: 'play-animation', target: '$self', animation: 'hurt' },
  },
  'set-visible': {
    label: 'Show or hide',
    summary: 'Shows or hides an entity without removing it.',
    modes: ANY_MODE,
    example: { type: 'set-visible', target: 'door', visible: false },
  },
  'play-sound': {
    label: 'Play the sound',
    summary: 'Plays a sound once.',
    modes: ANY_MODE,
    example: { type: 'play-sound', sound: 'sfx-coin', volume: 0.8 },
  },
  'stop-sound': {
    label: 'Stop the sound',
    summary: 'Stops one sound, or every sound if none is named.',
    modes: ANY_MODE,
    example: { type: 'stop-sound', sound: 'music' },
  },
  'show-message': {
    label: 'Show the message',
    summary: 'Puts a short line of text on screen for a few seconds.',
    modes: ANY_MODE,
    example: { type: 'show-message', text: 'You made it', seconds: 2 },
  },
  'go-to-scene': {
    label: 'Go to the level',
    summary: 'Loads another scene.',
    modes: ANY_MODE,
    example: { type: 'go-to-scene', scene: 'level-2' },
  },
  'restart-scene': {
    label: 'Restart the level',
    summary: 'Starts the current scene again from the beginning.',
    modes: ANY_MODE,
    example: { type: 'restart-scene' },
  },
  'pause-game': {
    label: 'Pause the game',
    summary:
      'Freezes everything: nothing moves, no timers run, and only the player pressing a control is still heard, so a rule can start the game again.',
    modes: ANY_MODE,
    example: { type: 'pause-game' },
  },
  'resume-game': {
    label: 'Start the game again',
    summary: 'Unfreezes a paused game and carries on exactly where it stopped.',
    modes: ANY_MODE,
    example: { type: 'resume-game' },
  },
  'set-camera-target': {
    label: 'Follow with the camera',
    summary: 'Points the camera at a different entity.',
    modes: ANY_MODE,
    example: { type: 'set-camera-target', target: 'boss' },
  },
  'shake-camera': {
    label: 'Shake the camera',
    summary: 'Shakes the view, for an explosion or a heavy landing.',
    modes: ANY_MODE,
    example: { type: 'shake-camera', strength: 4, seconds: 0.3 },
  },
  'set-tile': {
    label: 'Change a tile',
    summary: 'Paints or clears one tile while the game runs, for a door or a bridge.',
    modes: ANY_MODE,
    example: { type: 'set-tile', layer: 'ground', column: 12, row: 5, tile: null },
  },
  'enable-rule': {
    label: 'Turn on the rule',
    summary: 'Switches another rule on.',
    modes: ANY_MODE,
    example: { type: 'enable-rule', rule: 'spawn-enemies' },
  },
  'disable-rule': {
    label: 'Turn off the rule',
    summary: 'Switches another rule off.',
    modes: ANY_MODE,
    example: { type: 'disable-rule', rule: 'spawn-enemies' },
  },
  wait: {
    label: 'Wait',
    summary: 'Pauses the rest of this rule for a moment. The game keeps running.',
    modes: ANY_MODE,
    example: { type: 'wait', seconds: 1.5 },
  },
};

/** True when this entry can be offered for an entity using that movement mode. */
export function appliesToMode(entry: CatalogEntry, mode: MovementMode): boolean {
  return entry.modes.includes(mode);
}
