# Tree-sitter Query (`.scm`) VS Code Extension — Implementation Brief

## Goal

Build a lightweight, self-maintained Visual Studio Code extension dedicated to **Tree-sitter's query language** (`.scm` files). It must provide:

1. **Clear, attractive, theme-aware syntax highlighting** for Tree-sitter queries.
2. **Reliable, syntax-aware document formatting**, available through VS Code's **Format Document** and **Format on Save**.

This is for **Tree-sitter query syntax**, not a general-purpose Scheme language extension. Keep the project small, fast, and maintainable. Implement the extension rather than merely drafting a plan.

## Agreed technology stack

| Component | Choice | Responsibility |
|---|---|---|
| Language | **TypeScript 7** | Extension and formatter code |
| Editor integration | **VS Code Extension API** | Language registration and formatting provider |
| Highlighting | **TextMate grammar** | Theme-aware syntax coloring without a language server |
| Formatter | **Our own TypeScript tokenizer and formatter** | Understand and format query syntax safely |
| Bundler | **Rollup** | Bundle the extension (not esbuild) |
| Package manager | **pnpm** | Dependencies and scripts |
| Tests | **Vitest** | Focused formatter and tokenizer tests |

Use the standard VS Code extension manifest and language configuration files as necessary. Choose appropriately maintained official/ecosystem tooling for the above stack and minimize dependencies.

**Do not depend on a third-party `.scm` formatter or another small/unmaintained extension or repository.** We want to own and maintain the tokenizer, formatting logic, and highlighting grammar. No Rust binaries, subprocess-based formatter, language server, or external runtime service.

## Feature 1: Tree-sitter query syntax highlighting

Register a dedicated Tree-sitter Query language for `.scm` files, distinct from Scheme. Supply our own TextMate grammar with meaningful scopes so existing VS Code themes can render syntax clearly.

Distinguish at least:

- Named node types such as `import_statement`, `identifier`, and `string`.
- Grammar field names such as `name:` and `source:`.
- Captures such as `@statement`, `@module`, `@binding.type`, and `@name`.
- Query predicates/directives and their arguments, e.g. `#eq?`, `#match?`, `#set!`.
- Quoted anonymous nodes or strings, e.g. `"type"`.
- Alternations (`[ ... ]`), group parentheses, quantifiers (`?`, `*`, `+`), anchors (`.`), and negated fields (`!field`).
- Semicolon comments (`; ...`).

Make adjacent categories visually distinguishable without imposing hardcoded editor colors. Provide basic language configuration for comments/brackets/auto-closing where appropriate. Avoid overriding unrelated Scheme language settings.

## Feature 2: Our own query formatter

Implement a **syntax-aware** formatter in TypeScript, backed by a lightweight tokenizer we maintain. Do not rely on a sequence of regex substitutions that can mistake strings/comments for syntax.

The formatter must:

- Format nested node patterns and alternation groups readably, with consistent indentation.
- Handle fields, captures, predicates, quantifiers, anchors, anonymous tokens, and comments.
- Respect VS Code indentation options (tabs/spaces and tab width) where practical.
- Preserve syntax and behavior: node names, capture positions, predicate arguments, strings, and comments must remain meaningful and unchanged.
- Preserve user-written comment contents, including comments showing examples and captured values.
- Be **idempotent**: formatting an already formatted document should produce no further changes.
- Be conservative with incomplete or malformed input; never silently discard text or fabricate query syntax.
- Execute in-process and remain responsive on ordinary `.scm` files.

Use VS Code's document formatting provider so **Format Document** works and **Format on Save** works through the normal `editor.formatOnSave` setting. Do not change global VS Code settings or install another formatter. Explain the one-time language-specific format-on-save setting if it is required.

### Representative query fixture

Use examples like this to verify coloring and formatting, including the comments and the positional relationship of captures to matched nodes:

```scheme
; Captures:
;   `import type { User } from './types.js';`
;     @statement = `import type { User } from './types.js';`
;     @declaration.type = `type`
;     @module = `'./types.js'`
(import_statement
  "type"? @declaration.type
  source: (string) @module) @statement

(import_statement
  (import_clause
    [
      (identifier) @default
      (namespace_import
        (identifier) @namespace)
      (named_imports
        (import_specifier
          "type"? @binding.type
          name: [(identifier) (string)] @name
          alias: (identifier)? @alias) @named)
    ])) @statement
```

This is a **test fixture**, not a mandated formatting style. Choose a coherent and stable layout; validate that formatting does not alter which node a capture applies to.

## Development and verification

- Set up a normal, **single-project** VS Code extension, not a monorepo.
- Use **Rollup** for bundling and **pnpm** scripts for build, typecheck, test, and development.
- Use **Vitest** to test the tokenizer and formatter, particularly nested patterns, captures, strings, escaped strings, comments, optional operators, predicates, and idempotence.
- Verify that the extension activates for a Tree-sitter query file, highlighting appears, **Format Document** works, and the formatter participates correctly in VS Code's **Format on Save**.
- Provide brief instructions for running the extension locally in VS Code and enabling format-on-save if required.
- Summarize actual verification results and any known limitations; do not claim unrun tests or checks passed.

## Scope boundaries

- Implement **only** Tree-sitter query syntax highlighting and document formatting, plus the minimal project setup, configuration, and tests needed for them.
- Do **not** add autocomplete, diagnostics, query execution, hover information, refactoring commands, a language server, publishing workflows, theme packages, or other features unless requested.
- Do **not** import another third-party `.scm` formatter as a shortcut.
- Do **not** introduce unnecessary abstraction layers, dependencies, files, or reorganizations.
- Do **not** commit, push, or publish.
- If you encounter a decision that would materially expand scope, **ask before proceeding**. Otherwise use reasonable implementation defaults within the agreed requirements.

Deliver a working local extension and a compact summary of what was implemented, how it was verified, and how to run it.
