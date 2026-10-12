const assert = require('node:assert/strict');
const { readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const vscode = require('vscode');

exports.run = async function () {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const original = '(node name:(identifier)?@name value:[(identifier)(string)])@node';
  const expected = '(node\n  name: (identifier)? @name\n  value: [(identifier) (string)]) @node\n';
  const path = join(root, 'format.scm');
  await writeFile(path, original);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
  await vscode.window.showTextDocument(document);
  assert.equal(document.languageId, 'tree-sitter-query', '.scm language registration');

  const extension = vscode.extensions.getExtension('zekumoru.tree-sitter-query');
  assert.ok(extension, 'extension discovered');
  const deadline = Date.now() + 5000;
  while (!extension.isActive && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.ok(extension.isActive, 'extension automatically activated by opening .scm');
  const grammar = extension.packageJSON.contributes.grammars[0];
  assert.equal(grammar.language, document.languageId);
  assert.equal(grammar.scopeName, 'source.tree-sitter-query');

  // VS Code's own workbench tokenizer verifies the contributed grammar in the editor.
  const syntax = await vscode.commands.executeCommand('_workbench.captureSyntaxTokens', document.uri);
  assert.ok(syntax.some(token => token.t.includes('entity.name.type.node.tree-sitter-query')));
  assert.ok(syntax.some(token => token.t.includes('variable.other.property.field.tree-sitter-query')));
  assert.ok(syntax.some(token => token.t.includes('variable.other.constant.capture.tree-sitter-query')));
  const categories = ['node', 'name', '@name'].map(text => syntax.find(token => token.c === text));
  for (const theme of ['dark_plus', 'light_plus', '2026-dark', '2026-light']) {
    if (theme.startsWith('2026') && !categories[0].r[theme]) continue;
    const colors = categories.map(token => token.r[theme]?.match(/#[0-9a-f]{6}/i)?.[0]);
    assert.ok(colors.every(Boolean), `${theme} supplies theme colors`);
    assert.equal(new Set(colors).size, 3, `${theme} distinguishes nodes, fields, and captures`);
  }
  await writeFile(join(root, 'highlighting-tokens.json'), JSON.stringify(syntax, null, 2));

  await vscode.commands.executeCommand('editor.action.formatDocument');
  assert.equal(document.getText(), expected, 'Format Document applies the formatter');
  const edits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', document.uri, {
    insertSpaces: true, tabSize: 2
  });
  assert.equal(edits?.length ?? 0, 0, 'already formatted documents receive no edits');

  const replace = new vscode.WorkspaceEdit();
  replace.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), original);
  assert.ok(await vscode.workspace.applyEdit(replace));
  assert.ok(await document.save());
  assert.equal(await readFile(path, 'utf8'), expected, 'Format on Save writes the formatted query');

  const tabEdits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', document.uri, {
    insertSpaces: false, tabSize: 4
  });
  const tabs = new vscode.WorkspaceEdit();
  tabs.set(document.uri, tabEdits);
  assert.ok(await vscode.workspace.applyEdit(tabs));
  assert.equal(document.getText(), '(node\n\tname: (identifier)? @name\n\tvalue: [(identifier) (string)]) @node\n', 'provider respects tabs');

  const malformed = await vscode.workspace.openTextDocument({ language: 'tree-sitter-query', content: '(unfinished' });
  const malformedEdits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', malformed.uri, {
    insertSpaces: true, tabSize: 2
  });
  assert.equal(malformedEdits?.length ?? 0, 0, 'malformed documents receive no edits');

  const unrelated = await vscode.workspace.openTextDocument({ language: 'plaintext', content: original });
  const unrelatedEdits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', unrelated.uri, {
    insertSpaces: true, tabSize: 2
  });
  assert.equal(unrelatedEdits?.length ?? 0, 0, 'the provider is limited to the dedicated query language');
  console.log('VS Code checks passed: .scm registration, automatic activation, editor highlighting and theme colors, Format Document, idempotence, Format on Save, tabs, malformed input, language isolation.');
};
