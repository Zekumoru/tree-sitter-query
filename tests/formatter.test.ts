import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatQuery } from '../src/formatter.js';
import { tokenize } from '../src/tokenizer.js';

const spaces = { insertSpaces: true, tabSize: 2 };
const fixture = readFileSync(new URL('./fixtures/imports.scm', import.meta.url), 'utf8');
const signature = (source: string) => tokenize(source).tokens.map(({ kind, text }) => [kind, text]);

describe('formatQuery', () => {
  it('indents nested fields and alternations, keeping captures and quantifiers with their nodes', () => {
    expect(formatQuery('(node name:[(identifier)?@name (string)]@value !type .)@node', spaces))
      .toBe('(node\n  name: [\n    (identifier)? @name\n    (string)\n  ] @value\n  !type\n  .\n) @node\n');
  });

  it('formats the authoritative fixture without moving captures across delimiters', () => {
    const output = formatQuery(fixture, spaces);
    expect(signature(output)).toEqual(signature(fixture));
    expect(output).toContain('"type"? @declaration.type\n  source: (string) @module\n) @statement');
    expect(output).toContain('alias: (identifier)? @alias\n        ) @named');
    expect(output.slice(0, output.indexOf('(import_statement')))
      .toBe(fixture.slice(0, fixture.indexOf('(import_statement')));
  });

  it('formats grouped patterns and keeps predicate arguments intact', () => {
    const input = '((identifier)@name (#eq? @name "a;b") (#match? @name "^[A-Z_]+$") (#set! injection.language "js"))';
    expect(formatQuery(input, spaces)).toBe('(\n  (identifier) @name\n  (#eq? @name "a;b")\n  (#match? @name "^[A-Z_]+$")\n  (#set! injection.language "js")\n)\n');
  });

  it('preserves standalone, inline, and interposed comments, including trailing spaces', () => {
    const input = ';  @x = `value`  \n(node ; head example\n name: ; field example\n(identifier) ; child example\n @x ; captured value: "a"\n) ; end example  ';
    const output = formatQuery(input, spaces);
    expect(signature(output)).toEqual(signature(input));
    expect(output).toBe(';  @x = `value`  \n(node ; head example\n  name: ; field example\n  (identifier) ; child example\n  @x ; captured value: "a"\n) ; end example  \n');
  });

  it('keeps comments inside predicates from swallowing arguments or closing brackets', () => {
    const input = '((identifier) @n (#eq? ; compare\n @n ; capture\n "x" ; text\n))';
    const output = formatQuery(input, spaces);
    expect(signature(output)).toEqual(signature(input));
    expect(formatQuery(output, spaces)).toBe(output);
  });

  it('respects tabs, space width, and CRLF', () => {
    const input = '(node (child (leaf)))';
    expect(formatQuery(input, { insertSpaces: false, tabSize: 4 }))
      .toBe('(node\n\t(child\n\t\t(leaf)\n\t)\n)\n');
    expect(formatQuery(input, { insertSpaces: true, tabSize: 4, eol: '\r\n' }))
      .toBe('(node\r\n    (child\r\n        (leaf)\r\n    )\r\n)\r\n');
    expect(formatQuery('(node\r\n (child))\r\n', spaces)).toBe('(node\r\n  (child)\r\n)\r\n');
  });

  it('preserves multiline strings, escape sequences, BOM, and special node forms', () => {
    const input = '\ufeff((expression/"()") @x (#eq? @x "first\nsecond\\\";[]"))\n(MISSING ";") @missing';
    const output = formatQuery(input, spaces);
    expect(output.startsWith('\ufeff(\n')).toBe(true);
    expect(signature(output)).toEqual(signature(input));
    expect(output).toContain('(expression/"()") @x');
    expect(output).toContain('(MISSING ";") @missing');
    expect(formatQuery(output, spaces)).toBe(output);
  });

  it.each([
    '', ' \t\n', '(node', '(node ["a")]', '(node))', ')', '"unfinished',
    '(node $unknown)', '(node) @', '((node) (#eq @x "a"))', '(node)\ufeff(child)'
  ])('leaves incomplete or unrecognized input unchanged: %s', input => {
    expect(formatQuery(input, spaces)).toBe(input);
  });

  it.each([
    fixture,
    '(node . (child)* @a . (child)+ @b .)',
    '["a"? "b"+ "c"*] @alternatives',
    '(_)? @any\n(ERROR) @error\n(MISSING identifier) @missing',
    '(node ! field name : (identifier))',
    '; only a comment  ',
    '(node (child)) ; inline\n\n; next example\n(node)'
  ])('is idempotent and preserves the exact token stream: %s', input => {
    const output = formatQuery(input, spaces);
    expect(signature(output)).toEqual(signature(input));
    expect(formatQuery(output, spaces)).toBe(output);
  });

  it('formats an ordinary large query file without recursive traversal', () => {
    const input = '(node name:(identifier)?@name (#eq? @name "x"))\n'.repeat(4000);
    const output = formatQuery(input, spaces);
    expect(signature(output)).toEqual(signature(input));
    expect(formatQuery(output, spaces)).toBe(output);
  });
});
