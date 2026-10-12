import { tokenize } from './tokenizer.js';
import type { Token } from './tokenizer.js';

export interface FormattingOptions {
  insertSpaces: boolean;
  tabSize: number;
  eol?: '\n' | '\r\n';
}

interface Group {
  open: Token;
  compact: boolean;
}

/** Change whitespace only. Unclosed strings, unknown characters, and mismatched
 * delimiters leave the entire document unchanged, including its whitespace. */
export function formatQuery(source: string, options: FormattingOptions): string {
  const { tokens, complete } = tokenize(source);
  if (!complete || tokens.length === 0) return source;

  const groups = new Map<Token, Group>();
  const stack: Group[] = [];
  for (const token of tokens) {
    if (token.kind === 'openParen' || token.kind === 'openBracket') {
      const parent = stack.at(-1);
      if (parent) parent.compact = false;
      const group = { open: token, compact: token.kind === 'openParen' };
      groups.set(token, group);
      stack.push(group);
    } else if (token.kind === 'closeParen' || token.kind === 'closeBracket') {
      const group = stack.pop();
      if (!group || (token.kind === 'closeParen') !== (group.open.kind === 'openParen')) return source;
    } else if (['comment', 'colon', 'negation', 'anchor', 'quantifier'].includes(token.kind)) {
      const parent = stack.at(-1);
      if (parent) parent.compact = false;
    }
  }
  if (stack.length) return source;

  const eol = options.eol ?? (source.includes('\r\n') ? '\r\n' : '\n');
  const width = Number.isInteger(options.tabSize) && options.tabSize > 0 ? options.tabSize : 2;
  const indent = options.insertSpaces ? ' '.repeat(width) : '\t';
  const chunks: string[] = source.startsWith('\ufeff') ? ['\ufeff'] : [];
  let onLine = false;
  let breaks = 0;

  function newline(blank = false): void {
    const count = blank ? 2 : 1;
    if (onLine || breaks > 0) {
      while (breaks < count) {
        chunks.push(eol);
        breaks++;
      }
    }
    onLine = false;
  }

  function write(text: string, depth: number, space = false): void {
    if (!onLine) chunks.push(indent.repeat(depth));
    else if (space) chunks.push(' ');
    chunks.push(text);
    onLine = true;
    breaks = 0;
  }

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    const previous = tokens[index - 1];
    const parent = stack.at(-1);
    const gap = source.slice(previous?.end ?? 0, token.start);
    const blank = (gap.match(/\r\n|\r|\n/g)?.length ?? 0) > 1;

    if (token.kind === 'comment') {
      const inline = previous !== undefined && !/[\r\n]/.test(gap);
      if (!inline) newline(blank);
      write(token.text, stack.length, inline);
      newline();
    } else if (token.kind === 'closeParen' || token.kind === 'closeBracket') {
      const group = stack.pop()!;
      if (!group.compact) newline();
      write(token.text, stack.length);
    } else {
      const postfix = token.kind === 'capture' || token.kind === 'quantifier';
      const joined = token.kind === 'colon' || token.kind === 'slash'
        || previous?.kind === 'slash' || previous?.kind === 'negation';
      const afterField = previous?.kind === 'colon';
      const head = previous === parent?.open && token.kind === 'identifier';

      if (!postfix && !joined && !afterField && !head && !parent?.compact) newline(blank);
      const space = token.kind !== 'quantifier' && !joined && previous !== parent?.open;
      write(token.text, stack.length, space);

      if (token.kind === 'openParen' || token.kind === 'openBracket') {
        stack.push(groups.get(token)!);
      }
    }
  }
  newline();
  const result = chunks.join('');

  // This also catches accidental merging of identifiers and comment swallowing.
  const check = tokenize(result);
  if (!check.complete || check.tokens.length !== tokens.length
    || tokens.some((token, index) => token.kind !== check.tokens[index]!.kind || token.text !== check.tokens[index]!.text)) {
    return source;
  }
  return result;
}
