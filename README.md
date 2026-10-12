# Tree-sitter Query

A lightweight VS Code extension for Tree-sitter query files (`.scm`), with theme-aware syntax highlighting and compact, consistent formatting.

## Build and package

With Node.js and pnpm installed, run from the project folder:

```sh
pnpm install
pnpm build
pnpm dlx @vscode/vsce package --no-dependencies --allow-missing-repository --skip-license
```

This creates `tree-sitter-query-<version>.vsix` in the project folder.

## Install

In VS Code, open **Extensions → … → Install from VSIX…** and select the generated `.vsix` file.

## Use

Open a `.scm` file in **Tree-sitter Query** language mode and run **Format Document** from the Command Palette. Formatting respects your indentation settings and preserves strings, comments, and capture attachments.

To enable formatting on save, add this to your VS Code user or workspace settings:

```json
{
  "[tree-sitter-query]": {
    "editor.defaultFormatter": "zekumoru.tree-sitter-query",
    "editor.formatOnSave": true
  }
}
```
