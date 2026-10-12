export type TokenKind =
  | 'openParen' | 'closeParen' | 'openBracket' | 'closeBracket'
  | 'identifier' | 'capture' | 'predicate' | 'string' | 'comment'
  | 'colon' | 'slash' | 'negation' | 'quantifier' | 'anchor' | 'unknown';

export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
}

export interface Tokenization {
  tokens: Token[];
  complete: boolean;
}

const punctuation: Record<string, TokenKind> = {
  '(': 'openParen', ')': 'closeParen', '[': 'openBracket', ']': 'closeBracket',
  ':': 'colon', '/': 'slash', '!': 'negation', '.': 'anchor',
  '?': 'quantifier', '*': 'quantifier', '+': 'quantifier'
};

/** Keep the exact text and UTF-16 offsets; whitespace alone is omitted. */
export function tokenize(source: string): Tokenization {
  const tokens: Token[] = [];
  const identifier = /[\p{L}\p{N}_-][\p{L}\p{N}_.-]*/uy;
  let complete = true;
  let offset = 0;

  while (offset < source.length) {
    const char = source[offset]!;
    if (/[ \t\r\n\v\f]/.test(char) || (offset === 0 && char === '\ufeff')) {
      offset++;
      continue;
    }

    const start = offset;
    let kind: TokenKind;
    if (char === ';') {
      kind = 'comment';
      while (offset < source.length && source[offset] !== '\n'
        && !(source[offset] === '\r' && source[offset + 1] === '\n')) offset++;
    } else if (char === '"') {
      kind = 'string';
      offset++;
      let closed = false;
      while (offset < source.length) {
        const next = source[offset++];
        if (next === '\\') {
          // An escaped quote, delimiter, or line ending belongs to the string.
          if (offset < source.length) offset++;
        } else if (next === '"') {
          closed = true;
          break;
        }
      }
      if (!closed) complete = false;
    } else if (char === '@' || char === '#') {
      kind = char === '@' ? 'capture' : 'predicate';
      identifier.lastIndex = ++offset;
      const name = identifier.exec(source);
      if (name) {
        offset = identifier.lastIndex;
        if (char === '#') {
          if (source[offset] === '?' || source[offset] === '!') offset++;
          else complete = false;
        }
      } else complete = false;
    } else if (punctuation[char]) {
      kind = punctuation[char]!;
      offset++;
    } else {
      identifier.lastIndex = offset;
      const name = identifier.exec(source);
      if (name) {
        kind = 'identifier';
        offset = identifier.lastIndex;
      } else {
        kind = 'unknown';
        offset += source.codePointAt(offset)! > 0xffff ? 2 : 1;
        complete = false;
      }
    }
    tokens.push({ kind, text: source.slice(start, offset), start, end: offset });
  }

  return { tokens, complete };
}
