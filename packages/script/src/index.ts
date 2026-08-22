/**
 * @pinforge/script is PinScript: every rule a project can hold, written as a
 * sentence a person can type. It is a second face for the same rules the
 * editor's dropdowns build, not a second language: parsing and printing share
 * one table of sentences, and nothing here can express what the schema cannot.
 *
 *   rule collect-coin "Collect a coin"
 *   when player touches coin
 *   then remove $other
 *   then add 1 to score
 */

export { parseScript, type ParsedScript, type ScriptIssue } from './parse.js';
export {
  printAction,
  printCondition,
  printRule,
  printScript,
  printTrigger,
  templateFor,
} from './print.js';
export {
  ACTION_TEMPLATES,
  COMPARISON_PHRASES,
  CONDITION_TEMPLATES,
  TRIGGER_TEMPLATES,
  type GroupPart,
  type Node,
  type Part,
  type SlotKind,
  type SlotPart,
  type Template,
  type WordPart,
} from './templates.js';
