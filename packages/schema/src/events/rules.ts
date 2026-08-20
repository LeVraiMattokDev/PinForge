import * as z from 'zod';
import { Id, Label } from '../common.js';
import { Action } from './actions.js';
import { Condition } from './conditions.js';
import { Trigger } from './triggers.js';

/**
 * One rule, read as a sentence:
 *
 *   WHEN <trigger> IF <conditions> THEN <actions>
 *
 * Rules are data. Nothing here is compiled into code, which is what lets the
 * editor, the runtime and the MCP server all agree on what a game does.
 */
export const EventRule = z.strictObject({
  id: Id,
  name: Label.optional().meta({ description: 'What this rule is for, in plain words.' }),
  enabled: z.boolean().default(true),
  once: z.boolean().default(false).meta({ description: 'Run at most once per scene.' }),
  when: Trigger,
  if: z.array(Condition).max(16).default([]),
  then: z.array(Action).min(1).max(32),
});

export type EventRule = z.infer<typeof EventRule>;
export type EventRuleInput = z.input<typeof EventRule>;
