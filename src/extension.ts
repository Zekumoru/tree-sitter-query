import * as vscode from 'vscode';
import { formatQuery } from './formatter.js';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider('tree-sitter-query', {
      provideDocumentFormattingEdits(document, options, cancellation) {
        if (cancellation.isCancellationRequested) return [];
        const original = document.getText();
        const formatted = formatQuery(original, {
          insertSpaces: options.insertSpaces,
          tabSize: options.tabSize,
          eol: document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
        });
        if (formatted === original || cancellation.isCancellationRequested) return [];
        return [
          vscode.TextEdit.replace(
            new vscode.Range(document.positionAt(0), document.positionAt(original.length)),
            formatted
          )
        ];
      }
    })
  );
}
