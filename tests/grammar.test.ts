import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { Registry, parseRawGrammar, INITIAL } from 'vscode-textmate';
import type { IGrammar, IToken, StateStack } from 'vscode-textmate';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';

let grammar: IGrammar;
const require = createRequire(import.meta.url);

beforeAll(async () => {
  const wasm = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: patterns => new OnigScanner(patterns),
      createOnigString: text => new OnigString(text)
    }),
    loadGrammar: async () => parseRawGrammar(
      readFileSync(new URL('../syntaxes/tree-sitter-query.tmLanguage.json', import.meta.url), 'utf8'),
      'tree-sitter-query.tmLanguage.json'
    )
  });
  grammar = (await registry.loadGrammar('source.tree-sitter-query'))!;
});

function scopesAt(line: string, text: string): string[] {
  const offset = line.indexOf(text);
  expect(offset).toBeGreaterThanOrEqual(0);
  const result = grammar.tokenizeLine(line, INITIAL);
  return result.tokens.find(token => token.startIndex <= offset && token.endIndex > offset)!.scopes;
}

describe('TextMate grammar', () => {
  it.each([
    ['import_statement', 'entity.name.type.node.tree-sitter-query'],
    ['name', 'variable.other.property.field.tree-sitter-query'],
    ['@binding.type', 'variable.other.constant.capture.tree-sitter-query'],
    ['"type"', 'string.quoted.double.tree-sitter-query'],
    ['?', 'keyword.operator.quantifier.tree-sitter-query'],
    ['!', 'keyword.operator.negation.tree-sitter-query'],
    ['absent', 'variable.other.property.field.negated.tree-sitter-query'],
    ['. ', 'keyword.operator.anchor.tree-sitter-query'],
    ['[', 'punctuation.section.brackets.begin.tree-sitter-query'],
    ['(', 'punctuation.section.group.begin.tree-sitter-query']
  ])('scopes %s distinctly as query syntax', (text, scope) => {
    const line = '(import_statement name: [(identifier) "type"? @binding.type] !absent . (string))';
    expect(scopesAt(line, text)).toContain(scope);
  });

  it.each(['#eq?', '#match?', '#set!'])('highlights %s and its arguments', name => {
    const line = `(${name} @name injection.language "js" 2)`;
    expect(scopesAt(line, name)).toContain('keyword.control.predicate.tree-sitter-query');
    expect(scopesAt(line, '@name')).toContain('variable.other.constant.capture.tree-sitter-query');
    expect(scopesAt(line, 'injection.language')).toContain('constant.other.symbol.tree-sitter-query');
    expect(scopesAt(line, '"js"')).toContain('string.quoted.double.tree-sitter-query');
    expect(scopesAt(line, '2')).toContain('constant.numeric.tree-sitter-query');
  });

  it('keeps string syntax and comments from coloring their contents as query operators', () => {
    const line = String.raw`"; [()] @name #eq? \"" ; @value = "(example)"`;
    expect(scopesAt(line, '@name')).toContain('string.quoted.double.tree-sitter-query');
    expect(scopesAt(line, String.raw`\"`)).toContain('constant.character.escape.tree-sitter-query');
    expect(scopesAt(line, '@value')).toContain('comment.line.semicolon.tree-sitter-query');
  });

  it('carries predicate and string state across lines, then returns to node scopes', () => {
    let state: StateStack = INITIAL;
    const rows: IToken[][] = [];
    for (const line of ['(', ' #set!', ' injection.language "first', 'second"', ')', '(identifier)']) {
      const result = grammar.tokenizeLine(line, state);
      rows.push(result.tokens);
      state = result.ruleStack;
    }
    expect(rows[2]!.some(token => token.scopes.includes('constant.other.symbol.tree-sitter-query'))).toBe(true);
    expect(rows[3]![0]!.scopes).toContain('string.quoted.double.tree-sitter-query');
    expect(rows[5]!.some(token => token.scopes.includes('entity.name.type.node.tree-sitter-query'))).toBe(true);
  });

  it('colors the representative fixture, including all capture-example comments', () => {
    const source = readFileSync(new URL('./fixtures/imports.scm', import.meta.url), 'utf8');
    let state = INITIAL;
    const scopes = new Set<string>();
    for (const line of source.split('\n')) {
      const result = grammar.tokenizeLine(line, state);
      state = result.ruleStack;
      for (const token of result.tokens) {
        for (const scope of token.scopes) scopes.add(scope);
        if (line.startsWith(';')) expect(token.scopes).toContain('comment.line.semicolon.tree-sitter-query');
      }
    }
    expect(scopes).toContain('entity.name.type.node.tree-sitter-query');
    expect(scopes).toContain('variable.other.property.field.tree-sitter-query');
    expect(scopes).toContain('variable.other.constant.capture.tree-sitter-query');
  });
});
