import { describe, expect, it } from 'vitest';
import { ACTIONS, TRIGGERS, type ProjectInput, type TriggerType } from '@pinforge/schema';
import { makeGame, player, steps, type WorldOptions } from './helpers.js';
import type { Game } from '../src/index.js';

/**
 * Every trigger the engine advertises must actually be able to fire, and every
 * action must actually be able to run.
 *
 * This file exists because "when something is removed" shipped dead. It was in
 * the catalog, in the editor's dropdowns, in the blocks palette, in the events
 * reference and in PinScript, and no test had ever used it, so nobody noticed
 * that the rule engine skipped every one of its firings. A vocabulary nothing
 * exercises is a vocabulary that rots.
 */

const FIRED: NonNullable<WorldOptions['variables']> = [
  { id: 'fired', type: 'boolean', initial: false },
  { id: 'score', type: 'number', initial: 0 },
  // Written only by the witness rule below, so an action under test and the
  // witness can never be mistaken for one another.
  { id: 'ticks', type: 'number', initial: 0 },
];

const PROTOTYPES: NonNullable<ProjectInput['entities']> = [
  {
    id: 'player',
    size: { width: 12, height: 16 },
    tags: ['player'],
    components: { collider: {}, movement: { mode: 'platform' } },
  },
  {
    id: 'coin',
    size: { width: 8, height: 8 },
    tags: ['pickup'],
    components: { collider: { kind: 'trigger' } },
  },
];

const BOTTOMLESS = Array(6).fill('.'.repeat(10));
const HAZARD = ['..........', '..........', '..........', '..........', '..^.......', '##########'];

/** Sets "fired" to true, which is all any of these rules has to do. */
const SAY_SO = [{ type: 'set-variable' as const, variable: 'fired', value: true }];

interface Scenario {
  /** The world this trigger needs in order to be able to fire at all. */
  readonly world?: Partial<WorldOptions>;
  /** Rules alongside the one under test, when firing takes some help. */
  readonly alongside?: NonNullable<WorldOptions['events']>;
  /** Whatever a player would have to do. */
  readonly drive?: (game: Game) => void;
}

/** One world per trigger, arranged so that trigger and no other has to fire. */
const SCENARIOS: Record<TriggerType, Scenario> = {
  'game-starts': {},
  'scene-starts': {},
  'every-frame': {},
  'every-seconds': { drive: (game) => steps(game, 130) },
  'action-pressed': {
    drive: (game) => {
      game.input.press('jump');
      game.step();
    },
  },
  'action-released': {
    drive: (game) => {
      game.input.press('jump');
      game.step();
      game.input.release('jump');
      game.step();
    },
  },
  collides: {
    world: {
      entities: [
        { id: 'player-1', prototype: 'player', x: 32, y: 64 },
        { id: 'coin-1', prototype: 'coin', x: 34, y: 68 },
      ],
    },
  },
  'collision-ends': {
    world: {
      entities: [
        { id: 'player-1', prototype: 'player', x: 32, y: 64 },
        { id: 'coin-1', prototype: 'coin', x: 34, y: 68 },
      ],
    },
    // Walk out of the overlap rather than destroying the coin, so this covers
    // the ordinary ending and not the removal case.
    drive: (game) => {
      game.step();
      game.input.press('right');
      steps(game, 90);
    },
  },
  // Both of these need the player to have finished falling first.
  'touches-tile': { world: { rows: HAZARD }, drive: (game) => steps(game, 90) },
  'variable-changes': {
    alongside: [
      {
        id: 'writer',
        when: { type: 'scene-starts' },
        then: [{ type: 'change-variable', variable: 'score', value: 1 }],
      },
    ],
  },
  'entity-spawned': {
    alongside: [
      {
        id: 'maker',
        when: { type: 'scene-starts' },
        then: [{ type: 'spawn', entity: 'coin', x: 100, y: 20 }],
      },
    ],
  },
  'entity-destroyed': {
    world: {
      entities: [
        { id: 'player-1', prototype: 'player', x: 32, y: 64 },
        { id: 'coin-1', prototype: 'coin', x: 100, y: 20 },
      ],
    },
    alongside: [
      {
        id: 'breaker',
        when: { type: 'scene-starts' },
        then: [{ type: 'destroy', target: 'coin' }],
      },
    ],
  },
  'leaves-scene': { world: { rows: BOTTOMLESS }, drive: (game) => steps(game, 120) },
  lands: {
    world: { entities: [{ id: 'player-1', prototype: 'player', x: 32, y: 0 }] },
    drive: (game) => steps(game, 90),
  },
  jumps: {
    drive: (game) => {
      steps(game, 60);
      game.input.press('jump');
      game.step();
    },
  },
  clicked: {
    drive: (game) => {
      // Let it settle onto the floor first, then click where it is standing.
      steps(game, 60);
      const entity = player(game);
      game.click(entity.x + 2, entity.y + 2);
      game.step();
    },
  },
};

/** The subject a trigger needs, for the triggers that take one. */
function subjectFor(type: TriggerType): Record<string, unknown> {
  switch (type) {
    case 'collides':
    case 'collision-ends':
      return { subject: 'player', with: 'coin' };
    case 'touches-tile':
      return { subject: 'player', tag: 'hazard' };
    case 'entity-spawned':
    case 'entity-destroyed':
      return { subject: 'coin' };
    case 'leaves-scene':
      return { subject: 'player', edge: 'bottom' };
    case 'lands':
    case 'jumps':
    case 'clicked':
      return { subject: 'player' };
    case 'every-seconds':
      return { seconds: 2 };
    case 'action-pressed':
    case 'action-released':
      return { action: 'jump' };
    case 'variable-changes':
      return { variable: 'score' };
    default:
      return {};
  }
}

describe('every trigger the engine advertises can fire', () => {
  for (const type of Object.keys(TRIGGERS) as TriggerType[]) {
    it(`${type}: ${TRIGGERS[type].label}`, () => {
      const scenario = SCENARIOS[type];
      const game = makeGame({
        variables: FIRED,
        prototypes: PROTOTYPES,
        events: [
          ...(scenario.alongside ?? []),
          {
            id: 'under-test',
            when: { type, ...subjectFor(type) } as NonNullable<
              WorldOptions['events']
            >[number]['when'],
            then: SAY_SO,
          },
        ],
        ...scenario.world,
      });

      if (scenario.drive) scenario.drive(game);
      else steps(game, 2);

      expect(
        game.variable('fired'),
        `"${TRIGGERS[type].label}" never fired, so nothing a person builds with it can work`,
      ).toBe(true);
    });
  }
});

/**
 * The actions, checked the same way: each one has to change something the rest
 * of the engine can see. An action that quietly does nothing is the same kind
 * of dead vocabulary as a trigger that never fires.
 */
describe('every action the engine advertises does something', () => {
  /**
   * What each action must visibly have done. A check may step the game on
   * further when the action is about time.
   */
  const EFFECTS: Record<string, (game: Game) => boolean> = {
    destroy: (game) => !game.world.entities.some((one) => one.prototypeId === 'coin'),
    spawn: (game) => game.world.entities.filter((one) => one.prototypeId === 'coin').length > 1,
    move: (game) => player(game).velocityX !== 0,
    teleport: (game) => player(game).x === 24,
    jump: (game) => player(game).velocityY < 0,
    'set-variable': (game) => game.variable('score') === 9,
    'change-variable': (game) => game.variable('score') === 1,
    'set-property': (game) => player(game).properties.get('hits-left') === 5,
    'change-property': (game) => player(game).properties.get('hits-left') === 3,
    'play-animation': (game) => player(game).sprite?.animation === 'hurt',
    'set-visible': (game) => player(game).visible === false,
    // Nothing in the simulation can see a sound; the audio output is the seam,
    // and the browser host is what has to honour it.
    'play-sound': () => true,
    'stop-sound': () => true,
    'show-message': (game) => game.world.message?.text === 'You made it',
    'go-to-scene': (game) => game.world.scene.id === 'level-2',
    'restart-scene': (game) => game.world.steps <= 1,
    'pause-game': (game) => game.paused,
    // Nothing was paused, so starting the game again is a no-op that has to
    // leave the game running rather than break anything.
    'resume-game': (game) => !game.paused && game.world.steps > 0,
    'set-camera-target': (game) => game.world.camera.targetId === 'player-1',
    'shake-camera': (game) => game.world.camera.shakeLeft > 0,
    'set-tile': (game) => !game.world.map.isSolid(0, 5),
    // The witness starts switched off for this one, so ticking at all proves
    // the rule really was switched back on.
    'enable-rule': (game) => Number(game.variable('ticks')) > 0,
    // And here it starts switched on, so never ticking proves it was switched off.
    'disable-rule': (game) => game.variable('ticks') === 0,
    // Waiting has to hold the rest of the rule back, and then let it through.
    wait: (game) => {
      const heldBack = game.variable('score') !== 9;
      steps(game, 150);
      return heldBack && game.variable('score') === 9;
    },
  };

  /** A player carrying a property and an animation, so those actions have somewhere to land. */
  const RICH: NonNullable<ProjectInput['entities']> = [
    {
      id: 'player',
      size: { width: 12, height: 16 },
      tags: ['player'],
      properties: [{ id: 'hits-left', type: 'number', initial: 4 }],
      components: {
        collider: {},
        movement: { mode: 'platform' },
        sprite: {
          image: 'tiles',
          frameWidth: 16,
          frameHeight: 16,
          animations: [
            { id: 'idle', frames: [0] },
            { id: 'hurt', frames: [1] },
          ],
          defaultAnimation: 'idle',
        },
      },
    },
    PROTOTYPES[1]!,
  ];

  const TWO_LEVELS: NonNullable<WorldOptions['scenes']> = [1, 2].map((number) => ({
    id: `level-${number}`,
    tileSize: 16,
    size: { columns: 10, rows: 6 },
    layers: [
      {
        id: 'ground',
        tileset: 'ground',
        collides: true,
        legend: { '.': null, '#': 0, '^': 1, '=': 2 },
        rows: ['..........', '..........', '..........', '..........', '..........', '##########'],
      },
    ],
    entities: [
      { id: `player-${number}`, prototype: 'player', x: 32, y: 64 },
      { id: `coin-${number}`, prototype: 'coin', x: 100, y: 20 },
    ],
    camera: { mode: 'fixed' as const },
    events: [],
  }));

  for (const [type, entry] of Object.entries(ACTIONS)) {
    it(`${type}: ${entry.label}`, () => {
      const example = { ...entry.example } as Record<string, unknown>;
      // Point the example at what this little world actually has.
      if ('target' in example) example.target = type === 'destroy' ? 'coin' : 'player';
      if ('relativeTo' in example) example.relativeTo = 'player';
      if (type === 'set-variable') {
        example.variable = 'score';
        example.value = 9;
      }
      if (type === 'change-variable') example.value = 1;
      if (type === 'set-property') example.value = 5;
      if (type === 'go-to-scene') example.scene = 'level-2';
      if (type === 'set-tile') {
        example.layer = 'ground';
        example.column = 0;
        example.row = 5;
      }
      if (type === 'enable-rule') example.rule = 'sleeper';
      if (type === 'disable-rule') example.rule = 'sleeper';
      if (type === 'play-sound' || type === 'stop-sound') example.sound = 'beep';

      const scenes = TWO_LEVELS.map((scene, index) =>
        index === 0
          ? {
              ...scene,
              events: [
                // Turning a rule on only means something if it was off first.
                ...(type === 'enable-rule'
                  ? [
                      {
                        id: 'switch-it-off-first',
                        when: { type: 'scene-starts' as const },
                        then: [{ type: 'disable-rule' as const, rule: 'sleeper' }],
                      },
                    ]
                  : []),
                {
                  id: 'under-test',
                  when: { type: 'scene-starts' as const },
                  then: (type === 'wait'
                    ? [example, { type: 'set-variable', variable: 'score', value: 9 }]
                    : [example]) as NonNullable<WorldOptions['events']>[number]['then'],
                },
                {
                  id: 'sleeper',
                  when: { type: 'every-frame' as const },
                  then: [{ type: 'change-variable' as const, variable: 'ticks', value: 1 }],
                },
              ],
            }
          : scene,
      );

      const game = makeGame({ variables: FIRED, prototypes: RICH, scenes });
      // Two steps: one for the rule to run, one for what it did to settle.
      steps(game, 2);

      const check = EFFECTS[type];
      expect(check, `no expected effect is written down for "${type}"`).toBeDefined();
      expect(check!(game), `"${entry.label}" ran and changed nothing observable`).toBe(true);
    });
  }
});

/**
 * The conditions, checked in both directions. A condition that is stuck on true
 * passes any test that only ever asks it to hold, so each one here has to hold
 * when it should and refuse when the same rule asks for its opposite.
 */
describe('every condition the engine advertises can hold and can refuse', () => {
  const ON_FLOOR = [
    { id: 'player-1', prototype: 'player', x: 32, y: 64 },
    { id: 'coin-1', prototype: 'coin', x: 40, y: 68 },
  ];
  const IN_AIR = [
    { id: 'player-1', prototype: 'player', x: 32, y: 0 },
    { id: 'coin-1', prototype: 'coin', x: 40, y: 68 },
  ];

  /** Every condition, in a world where it holds from the very first step. */
  const HOLDS: Record<string, { condition: Record<string, unknown>; scenario: Scenario }> = {
    'variable-is': {
      condition: { type: 'variable-is', variable: 'score', operator: 'equals', value: 0 },
      scenario: { world: { entities: ON_FLOOR } },
    },
    'property-is': {
      condition: {
        type: 'property-is',
        target: 'player',
        property: 'hits-left',
        operator: 'equals',
        value: 4,
      },
      scenario: { world: { entities: ON_FLOOR } },
    },
    'has-tag': {
      condition: { type: 'has-tag', target: 'player', tag: 'player' },
      scenario: { world: { entities: ON_FLOOR } },
    },
    'entity-exists': {
      condition: { type: 'entity-exists', entity: 'coin' },
      scenario: { world: { entities: ON_FLOOR } },
    },
    'action-held': {
      condition: { type: 'action-held', action: 'jump' },
      scenario: {
        world: { entities: ON_FLOOR },
        drive: (game) => {
          game.input.press('jump');
          steps(game, 3);
        },
      },
    },
    'distance-is': {
      condition: {
        type: 'distance-is',
        from: 'player',
        to: 'coin',
        operator: 'at-most',
        pixels: 64,
      },
      scenario: { world: { entities: ON_FLOOR } },
    },
    chance: {
      condition: { type: 'chance', percent: 100 },
      scenario: { world: { entities: ON_FLOOR } },
    },
    'current-scene-is': {
      condition: { type: 'current-scene-is', scene: 'level-1' },
      scenario: { world: { entities: ON_FLOOR } },
    },
    'is-on-ground': {
      condition: { type: 'is-on-ground', target: 'player' },
      scenario: { world: { entities: ON_FLOOR } },
    },
    'is-falling': {
      condition: { type: 'is-falling', target: 'player' },
      scenario: { world: { entities: IN_AIR } },
    },
  };

  /** The player needs a property for one of them to have anywhere to look. */
  const WITH_PROPERTY: NonNullable<ProjectInput['entities']> = [
    {
      id: 'player',
      size: { width: 12, height: 16 },
      tags: ['player'],
      properties: [{ id: 'hits-left', type: 'number', initial: 4 }],
      components: { collider: {}, movement: { mode: 'platform' } },
    },
    PROTOTYPES[1]!,
  ];

  const run = (condition: Record<string, unknown>, scenario: Scenario, negate: boolean) => {
    const game = makeGame({
      variables: FIRED,
      prototypes: WITH_PROPERTY,
      events: [
        {
          id: 'under-test',
          when: { type: 'every-frame' },
          if: [{ ...condition, negate }] as NonNullable<WorldOptions['events']>[number]['if'],
          then: SAY_SO,
        },
      ],
      ...scenario.world,
    });
    if (scenario.drive) scenario.drive(game);
    else steps(game, 3);
    return game.variable('fired') === true;
  };

  for (const [type, { condition, scenario }] of Object.entries(HOLDS)) {
    it(`${type} holds when it should, and refuses when asked for its opposite`, () => {
      expect(run(condition, scenario, false), `"${type}" never held, even where it should`).toBe(
        true,
      );
      expect(
        run(condition, scenario, true),
        `"${type}" held even when the rule asked for its opposite, so it is stuck on true`,
      ).toBe(false);
    });
  }
});
