# Tree-sitter Query

A small local VS Code extension for Tree-sitter query files (`.scm`). It supplies a TextMate grammar and an in-process tokenizer and formatter, with no runtime dependencies.

## Run locally

Use Node.js 22.12+, 24, or 26+ and pnpm. From this folder:

```sh
pnpm install
pnpm build
```

Open this folder in VS Code and press **F5** using **Run Tree-sitter Query**. In the Extension Development Host, open `tests/fixtures/imports.scm` or another `.scm` file. The language mode should be **Tree-sitter Query**. Run **Format Document** from the Command Palette.

For development, run `pnpm dev` to rebuild on changes, then reload the Extension Development Host after changing code. Grammar changes also require reloading the host.

## Format on save

Add these language-specific settings to your own VS Code user or workspace settings:

```json
{
  "[tree-sitter-query]": {
    "editor.defaultFormatter": "zekumoru.tree-sitter-query",
    "editor.formatOnSave": true
  }
}
```

The extension does not change your settings. It uses the indentation options VS Code supplies, including tabs and space width, and preserves the document's LF or CRLF line endings. If another extension also claims `.scm`, select **Tree-sitter Query** in the language picker.

## Formatting behavior

Leaf patterns and predicates stay compact. Nested patterns and alternations use one child pattern per line; fields stay with their patterns, and captures and quantifiers stay after the same syntax tokens. Closing delimiters align with their opening patterns. Comment text, strings, escape sequences, and token order are preserved. Formatting ends nonempty documents with a newline and retains a single blank line where patterns or comments were separated by blank lines.

Unclosed strings, mismatched brackets, and unrecognized characters leave the entire document unchanged. The formatter checks structural syntax and preserves tokens; it does not validate node or field names against a target language's grammar, resolve captures, or interpret predicates. Theme colors come from standard TextMate scopes, so the precise palette depends on your theme.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:vscode
```

`pnpm test` runs Vitest tests for tokenization, formatting, token preservation, idempotence, and TextMate scopes using VS Code's TextMate and Oniguruma libraries. `pnpm test:vscode` launches an isolated VS Code test workspace and checks automatic activation, editor highlighting and theme colors, Format Document, Format on Save, indentation, and conservative handling of malformed input. It downloads a test copy of VS Code unless `VSCODE_EXECUTABLE_PATH` points to an existing executable, for example:

```sh
VSCODE_EXECUTABLE_PATH="/Applications/Visual Studio Code.app/Contents/MacOS/Code" pnpm test:vscode
```

TypeScript 7 compiles the sources through its CLI; Rollup bundles the resulting JavaScript and leaves `vscode` external. Only development tooling is installed. No external formatter, language server, subprocess, or service runs in the extension.
