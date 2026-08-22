/**
 * A line of PinScript is a run of tokens: words, numbers and quoted text.
 * Quotes hold anything, with \" \\ and \n escaped, so a message can contain
 * spaces, a # or a line break without confusing the line reader.
 */
export interface Token {
  readonly text: string;
  readonly quoted: boolean;
}

/** Splits one line into tokens. A # outside quotes starts a comment. */
export function tokenizeLine(line: string): Token[] | { error: string } {
  const tokens: Token[] = [];
  let at = 0;

  while (at < line.length) {
    const character = line[at]!;
    if (character === ' ' || character === '\t') {
      at += 1;
      continue;
    }
    if (character === '#') break;
    if (character === '"') {
      let text = '';
      at += 1;
      let closed = false;
      while (at < line.length) {
        const inside = line[at]!;
        if (inside === '\\') {
          const escaped = line[at + 1];
          if (escaped === '"' || escaped === '\\') text += escaped;
          else if (escaped === 'n') text += '\n';
          else return { error: `Only \\" \\\\ and \\n can follow a backslash in quotes.` };
          at += 2;
          continue;
        }
        if (inside === '"') {
          closed = true;
          at += 1;
          break;
        }
        text += inside;
        at += 1;
      }
      if (!closed) return { error: 'A quote was opened and never closed.' };
      tokens.push({ text, quoted: true });
      continue;
    }
    let end = at;
    while (end < line.length && line[end] !== ' ' && line[end] !== '\t' && line[end] !== '#') {
      end += 1;
    }
    tokens.push({ text: line.slice(at, end), quoted: false });
    at = end;
  }

  return tokens;
}

/** Wraps text in quotes, escaping what the tokenizer unescapes. */
export function quote(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

const NUMBER_PATTERN = /^-?(\d+(\.\d+)?)(e[+-]?\d+)?$/i;

export function isNumberToken(token: Token): boolean {
  return !token.quoted && NUMBER_PATTERN.test(token.text);
}
