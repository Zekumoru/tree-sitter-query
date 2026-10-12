import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/tokenizer.js';

describe('tokenize', () => {
  it('recognizes query tokens even without whitespace', () => {
    const source = '(node name:[(identifier)?@a.b "type"*]+ !field . (#eq? @a.b "x"))';
    expect(tokenize(source).complete).toBe(true);
    expect(tokenize(source).tokens.map(token => [token.kind, token.text])).toEqual([
      ['openParen', '('], ['identifier', 'node'], ['identifier', 'name'], ['colon', ':'],
      ['openBracket', '['], ['openParen', '('], ['identifier', 'identifier'], ['closeParen', ')'],
      ['quantifier', '?'], ['capture', '@a.b'], ['string', '"type"'], ['quantifier', '*'],
      ['closeBracket', ']'], ['quantifier', '+'], ['negation', '!'], ['identifier', 'field'],
      ['anchor', '.'], ['openParen', '('], ['predicate', '#eq?'], ['capture', '@a.b'],
      ['string', '"x"'], ['closeParen', ')'], ['closeParen', ')']
    ]);
  });

  it('keeps escaped strings and example comments opaque', () => {
    const source = String.raw`(#match? @x "[;()\\[\\]@#]+\\\"end") ; @x = "(value)"  `;
    const result = tokenize(source);
    expect(result.complete).toBe(true);
    expect(result.tokens.filter(token => token.kind === 'string').map(token => token.text))
      .toEqual([String.raw`"[;()\\[\\]@#]+\\\"end"`]);
    expect(result.tokens.at(-1)?.text).toBe('; @x = "(value)"  ');
    for (const token of result.tokens) expect(source.slice(token.start, token.end)).toBe(token.text);
  });

  it('supports directives, bare arguments, subtypes, wildcards, and Unicode names', () => {
    const source = '(expression/"()") @_x (#set! injection.language "js") (MISSING identifier) (nœud)';
    expect(tokenize(source).complete).toBe(true);
    expect(tokenize(source).tokens.map(token => token.text)).toEqual([
      '(', 'expression', '/', '"()"', ')', '@_x', '(', '#set!', 'injection.language', '"js"', ')',
      '(', 'MISSING', 'identifier', ')', '(', 'nœud', ')'
    ]);
  });

  it.each(['"unfinished', '"unfinished\\', '@', '#', '#eq', '(node $unexpected)'])
    ('marks incomplete or unsupported text without dropping it: %s', source => {
      const result = tokenize(source);
      expect(result.complete).toBe(false);
      expect(result.tokens.map(token => token.text).join('')).toBe(source.replace(/\s/g, ''));
    });

  it('keeps real line breaks inside strings and handles CRLF comments', () => {
    expect(tokenize('"first\nsecond" ; example\r\n(node)').tokens.map(token => token.text))
      .toEqual(['"first\nsecond"', '; example', '(', 'node', ')']);
  });

  it('treats a lone carriage return as comment content, as Tree-sitter does', () => {
    expect(tokenize('; example\r(node)\n(child)').tokens.map(token => token.text))
      .toEqual(['; example\r(node)', '(', 'child', ')']);
  });
});
