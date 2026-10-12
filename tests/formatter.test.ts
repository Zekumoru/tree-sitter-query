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
      .toBe('(node\n  name: [(identifier)? @name (string)] @value\n  !type\n  .) @node\n');
  });

  it.each([
    '(interface_declaration name: (type_identifier) @name) @definition.interface',
    '(function_declaration name: (identifier) @name) @definition.function',
    '[\n  (function_declaration name: (identifier) @name)\n  (generator_function_declaration name: (identifier) @name)\n  (function_signature name: (identifier) @name)\n] @definition.function',
    '(variable_declarator\n  name: (identifier) @name\n  value: [\n    (arrow_function)\n    (function_expression)\n    (generator_function)\n  ]) @definition.function',
    '(import_specifier\n  "type"? @binding.type\n  name: [(identifier) (string)] @name\n  alias: (identifier)? @alias) @named',
    '(import_clause\n  [\n    (identifier) @default\n    (namespace_import (identifier) @namespace)\n    (named_imports\n      (import_specifier\n        name: [(identifier) (string)] @name\n        alias: (identifier)? @alias) @named)\n  ])',
    '(call_expression (identifier) (arguments (identifier) (number))) @call',
    '[(identifier) (string)] @name',
    '(node\n  (left (identifier))\n  (right (identifier)))'
  ])('chooses compact or expanded layouts from syntax rather than input line breaks: %s', expected => {
    const tokens = tokenize(expected).tokens;
    for (const input of [expected, tokens.map(token => token.text).join(' '), tokens.map(token => token.text).join('\n')]) {
      expect(formatQuery(input, spaces)).toBe(`${expected}\n`);
    }
    expect(signature(formatQuery(expected, spaces))).toEqual(signature(expected));
  });

  it('formats the authoritative fixture without moving captures across delimiters', () => {
    const output = formatQuery(fixture, spaces);
    expect(signature(output)).toEqual(signature(fixture));
    expect(output).toContain('(import_statement "type"? @declaration.type source: (string) @module) @statement');
    expect(output).toContain('alias: (identifier)? @alias) @named)\n    ])) @statement');
    expect(output.slice(0, output.indexOf('(import_statement')))
      .toBe(fixture.slice(0, fixture.indexOf('(import_statement')));
  });

  it('formats grouped patterns and keeps predicate arguments intact', () => {
    const input = '((identifier)@name (#eq? @name "a;b") (#match? @name "^[A-Z_]+$") (#set! injection.language "js"))';
    expect(formatQuery(input, spaces)).toBe('(\n  (identifier) @name\n  (#eq? @name "a;b")\n  (#match? @name "^[A-Z_]+$")\n  (#set! injection.language "js"))\n');
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

  it('preserves comments before predicate operators and separates their capture arguments', () => {
    const input = '( ; comparison\n #eq? @first @second "x")';
    const output = '( ; comparison\n  #eq?\n  @first\n  @second\n  "x")\n';
    expect(formatQuery(input, spaces)).toBe(output);
    expect(formatQuery(output, spaces)).toBe(output);
    expect(signature(output)).toEqual(signature(input));
  });

  it('keeps bracket closers and captures outside trailing alternative comments', () => {
    const input = '(node name:[ ; alternatives\n(identifier)\n(string) ; last alternative\n])@node ; whole pattern  ';
    const output = '(node\n  name: [ ; alternatives\n    (identifier)\n    (string) ; last alternative\n  ]) @node ; whole pattern  \n';
    expect(formatQuery(input, spaces)).toBe(output);
    expect(formatQuery(output, spaces)).toBe(output);
    expect(signature(output)).toEqual(signature(input));
  });

  it('respects tabs, space width, and CRLF', () => {
    const input = '(node left:(child (leaf)) right:(leaf))';
    expect(formatQuery(input, { insertSpaces: false, tabSize: 4 }))
      .toBe('(node\n\tleft: (child (leaf))\n\tright: (leaf))\n');
    expect(formatQuery(input, { insertSpaces: true, tabSize: 4, eol: '\r\n' }))
      .toBe('(node\r\n    left: (child (leaf))\r\n    right: (leaf))\r\n');
    expect(formatQuery('(node\r\n (child))\r\n', spaces)).toBe('(node (child))\r\n');
  });

  it('includes captures in the soft 100-column limit', () => {
    const pattern = '(node name: (identifier) @name)';
    const capture = `@${'n'.repeat(100 - pattern.length - 2)}`;
    expect(`${pattern} ${capture}`.length).toBe(100);
    expect(formatQuery(`${pattern} ${capture}`, spaces)).toBe(`${pattern} ${capture}\n`);
    expect(formatQuery(`${pattern} ${capture}n`, spaces))
      .toBe(`(node\n  name: (identifier) @name) ${capture}n\n`);
  });

  it('includes field prefixes, indentation, and closing parentheses in width checks', () => {
    const pattern = '(node name: (identifier) @name)';
    for (const options of [spaces, { insertSpaces: false, tabSize: 4 }, { insertSpaces: true, tabSize: 4 }]) {
      const indent = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
      const capture = `@${'n'.repeat(100 - options.tabSize - 'right: '.length - pattern.length - 3)}`;
      const input = `(parent left: (leaf) right: ${pattern} ${capture})`;
      expect(formatQuery(input, options))
        .toBe(`(parent\n${indent}left: (leaf)\n${indent}right: ${pattern} ${capture})\n`);
      expect(formatQuery(input.replace(capture, `${capture}n`), options))
        .toBe(`(parent\n${indent}left: (leaf)\n${indent}right: (node\n${indent}${indent}name: (identifier) @name) ${capture}n)\n`);
    }
  });

  it('wraps predicate arguments without splitting strings or treating capture arguments as postfixes', () => {
    const text = `"${'x'.repeat(90)}"`;
    const input = `(#any-of? @first @second ${text})`;
    const expected = `(#any-of?\n  @first\n  @second\n  ${text})\n`;
    expect(formatQuery(input, spaces)).toBe(expected);
    expect(formatQuery(expected, spaces)).toBe(expected);
    const longToken = `"${'x'.repeat(120)}"`;
    expect(formatQuery(`(#set! key ${longToken})`, spaces))
      .toBe(`(#set!\n  key\n  ${longToken})\n`);
  });

  it('normalizes blank lines between patterns and removes arbitrary blank lines inside groups', () => {
    const expected = '(node left: (leaf) right: (leaf))';
    const output = '(node\n  left: (leaf)\n  right: (leaf))\n\n(leaf) @leaf\n';
    expect(formatQuery(`${expected}(leaf)@leaf`, spaces)).toBe(output);
    expect(formatQuery('(node\n\nleft:(leaf)\n\nright:(leaf))\n\n\n(leaf) @leaf', spaces)).toBe(output);
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
