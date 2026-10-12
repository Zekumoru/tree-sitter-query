import { tokenize } from './tokenizer.js';
import type { Token } from './tokenizer.js';

export interface FormattingOptions {
  insertSpaces: boolean;
  tabSize: number;
  eol?: '\n' | '\r\n';
}

interface Group {
  open: Token;
  closeIndex: number;
  startColumn: number;
  width: number;
  compact: boolean;
  hasChildren: boolean;
  components: number;
  fieldValue: boolean;
  predicate: boolean;
}

function needsSpace(previous: Token | undefined, token: Token): boolean {
  return (
    previous !== undefined &&
    previous.kind !== 'openParen' &&
    previous.kind !== 'openBracket' &&
    previous.kind !== 'slash' &&
    previous.kind !== 'negation' &&
    !['closeParen', 'closeBracket', 'colon', 'slash', 'quantifier'].includes(token.kind)
  );
}

/** Change whitespace only. Unclosed strings, unknown characters, and mismatched
 * delimiters leave the entire document unchanged, including its whitespace. */
export function formatQuery(source: string, options: FormattingOptions): string {
  const { tokens, complete } = tokenize(source);
  if (!complete || tokens.length === 0) return source;

  const groups = new Map<Token, Group>();
  const stack: Group[] = [];
  let flatColumn = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    const previous = tokens[index - 1];
    const startColumn = flatColumn + Number(needsSpace(previous, token));
    flatColumn = startColumn + token.text.length;
    if (token.kind === 'openParen' || token.kind === 'openBracket') {
      const parent = stack.at(-1);
      if (parent) parent.hasChildren = true;
      const group: Group = {
        open: token,
        closeIndex: index,
        startColumn,
        width: 0,
        compact: true,
        hasChildren: false,
        components: 0,
        fieldValue: previous?.kind === 'colon',
        predicate: false
      };
      groups.set(token, group);
      stack.push(group);
    } else if (token.kind === 'closeParen' || token.kind === 'closeBracket') {
      const group = stack.pop();
      if (!group || (token.kind === 'closeParen') !== (group.open.kind === 'openParen'))
        return source;
      group.closeIndex = index;
      group.width = flatColumn - group.startColumn;
      // Several fields or nested components deserve separate lines even when
      // they fit. Leaf children and nesting depth alone do not force a break.
      if (!group.predicate && group.components > 1) group.compact = false;
      // Inline alternatives should be short enough to scan within a field.
      if (token.kind === 'closeBracket' && group.width > 40) group.compact = false;
      const parent = stack.at(-1);
      if (parent) {
        parent.compact &&= group.compact && !group.predicate;
        if (!group.fieldValue && (group.hasChildren || token.kind === 'closeBracket'))
          parent.components++;
      }
    } else {
      const parent = stack.at(-1);
      if (parent) {
        if (token.kind === 'predicate') parent.predicate = true;
        if (token.kind === 'comment' || /[\r\n]/.test(token.text)) parent.compact = false;
        if (token.kind === 'colon' || token.kind === 'negation') parent.components++;
      }
    }
  }
  if (stack.length) return source;

  // Include captures, quantifiers, and attached parent closers in width checks.
  // Computing suffix widths backwards keeps deeply nested input linear.
  const tails = Array.from({ length: tokens.length }, () => 0);
  for (let index = tokens.length - 2; index >= 0; index--) {
    const next = tokens[index + 1]!;
    if (['capture', 'quantifier', 'closeParen'].includes(next.kind)) {
      tails[index] = Number(needsSpace(tokens[index], next)) + next.text.length + tails[index + 1]!;
    }
  }

  const eol = options.eol ?? (source.includes('\r\n') ? '\r\n' : '\n');
  const width = Number.isInteger(options.tabSize) && options.tabSize > 0 ? options.tabSize : 2;
  const indent = options.insertSpaces ? ' '.repeat(width) : '\t';
  const chunks: string[] = source.startsWith('\ufeff') ? ['\ufeff'] : [];
  let onLine = false;
  let breaks = 0;
  let column = 0;

  function newline(blank = false): void {
    const count = blank ? 2 : 1;
    if (onLine || breaks > 0) {
      while (breaks < count) {
        chunks.push(eol);
        breaks++;
      }
    }
    onLine = false;
    column = 0;
  }

  function write(text: string, depth: number, space = false): void {
    if (!onLine) {
      chunks.push(indent.repeat(depth));
      column = depth * width;
    } else if (space) {
      chunks.push(' ');
      column++;
    }
    chunks.push(text);
    for (const char of text) {
      if (char === '\n') column = 0;
      else if (char === '\t') column += width - (column % width);
      else column++;
    }
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
      if (token.kind === 'closeBracket' && !group.compact) newline();
      write(token.text, stack.length);
    } else {
      const postfix =
        (token.kind === 'capture' && !parent?.predicate) || token.kind === 'quantifier';
      const joined =
        token.kind === 'colon' ||
        token.kind === 'slash' ||
        previous?.kind === 'slash' ||
        previous?.kind === 'negation';
      const afterField = previous?.kind === 'colon';
      const head =
        previous === parent?.open && (token.kind === 'identifier' || token.kind === 'predicate');

      if (!postfix && !joined && !afterField && !head && !parent?.compact) {
        newline(previous?.kind === 'comment' ? blank : !parent && previous !== undefined);
      }
      const space = needsSpace(previous, token);

      if (token.kind === 'openParen' || token.kind === 'openBracket') {
        const group = groups.get(token)!;
        const start = onLine ? column + Number(space) : stack.length * width;
        group.compact &&= start + group.width + tails[group.closeIndex]! <= 100;
        write(token.text, stack.length, space);
        stack.push(group);
      } else {
        write(token.text, stack.length, space);
      }
    }
  }
  newline();
  const result = chunks.join('');

  // This also catches accidental merging of identifiers and comment swallowing.
  const check = tokenize(result);
  if (
    !check.complete ||
    check.tokens.length !== tokens.length ||
    tokens.some(
      (token, index) =>
        token.kind !== check.tokens[index]!.kind || token.text !== check.tokens[index]!.text
    )
  ) {
    return source;
  }
  return result;
}
