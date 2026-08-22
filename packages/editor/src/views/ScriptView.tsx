import { useMemo, useState } from 'react';
import type { EventRule } from '@pinforge/schema';
import { parseScript, printScript, type ScriptIssue } from '@pinforge/script';
import * as edit from '../state/commands.js';
import { useEditor } from '../state/useStore.js';
import { Button, Note, Panel } from '../ui/controls.js';

/**
 * The same rules as text: PinScript. Typing is faster than dropdowns once the
 * sentences are familiar, and text can be copied out of a chat or a friend's
 * game. Apply parses the whole script and swaps the rules in as one undoable
 * step; nothing changes until every line reads.
 */
export function ScriptView({
  rules,
  sceneId,
}: {
  rules: readonly EventRule[];
  sceneId: string | undefined;
}) {
  const store = useEditor();
  const printed = useMemo(() => printScript(rules), [rules]);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [issues, setIssues] = useState<readonly ScriptIssue[]>([]);

  const text = draft ?? printed;
  const changed = draft !== undefined && draft !== printed;

  const apply = (): void => {
    const result = parseScript(text);
    setIssues(result.issues);
    if (result.issues.length > 0) return;
    store.apply(edit.setRules(result.rules, sceneId));
    // The store refuses a script that breaks the project; keep the text so
    // the problem it reported can be fixed rather than typed again.
    if (store.getState().problem === undefined) setDraft(undefined);
  };

  return (
    <Panel>
      <Note>
        Every rule, written as sentences. when is the trigger, if lines must all be true, then lines
        run in order. The docs page “Writing rules as text” lists every sentence.
      </Note>
      <textarea
        className="script-editor"
        value={text}
        rows={Math.max(12, text.split('\n').length + 2)}
        spellCheck={false}
        aria-label="The rules as PinScript"
        placeholder={'rule my-first-rule\nwhen the level starts\nthen say "Hello"'}
        onChange={(event) => {
          setDraft(event.target.value);
          setIssues([]);
        }}
      />
      {issues.length > 0 ? (
        <div className="script-issues" role="alert">
          {issues.map((issue, at) => (
            <p key={at}>
              Line {issue.line}: {issue.message}
            </p>
          ))}
        </div>
      ) : null}
      <div className="stage-bar" style={{ marginTop: 10 }}>
        <Button kind="primary" disabled={!changed} onClick={apply}>
          Apply the script
        </Button>
        <Button
          kind="quiet"
          disabled={!changed}
          onClick={() => {
            setDraft(undefined);
            setIssues([]);
          }}
        >
          Throw my typing away
        </Button>
        <span className="spacer" />
        <span className="saved-note">{changed ? 'Not applied yet' : 'Same as the rules'}</span>
      </div>
    </Panel>
  );
}
