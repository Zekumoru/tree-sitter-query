# Repository Guidelines

## Project Structure & Module Organization

This VS Code extension highlights and formats Tree-sitter queries (`.scm`).

- `src/extension.ts` registers the document formatting provider; `tokenizer.ts` and `formatter.ts` implement in-process query formatting.
- `syntaxes/tree-sitter-query.tmLanguage.json` supplies theme-aware highlighting; `language-configuration.json` defines comments and brackets.
- `tests/*.test.ts` contains unit and grammar tests; `tests/fixtures/` holds query samples. `tests/vscode.cjs` and `tests/run-vscode.mjs` run editor integration checks.
- `.vscode/` supplies development launch/tasks. `.build/`, `dist/`, `.vscode-test/`, and VSIX files are generated; do not edit them.
- `plan.md` records the implementation brief; `README.md` covers packaging and installation.

## Build, Test, and Development Commands

- `pnpm install`: install development dependencies.
- `pnpm build`: compile TypeScript and bundle with Rollup into `dist/extension.cjs`.
- `pnpm dev`: watch source changes and rebuild.
- `pnpm lint` / `pnpm lint:fix`: run Oxlint correctness and type-aware checks; optionally apply automatic fixes.
- `pnpm format` / `pnpm format:check`: apply or verify Prettier formatting.
- `pnpm typecheck`: check TypeScript without emitting files.
- `pnpm test`: run the Vitest suite.
- `pnpm test:vscode`: build and test in an isolated VS Code instance; downloads a test copy unless `VSCODE_EXECUTABLE_PATH` is provided.

Press **F5** with **Run Tree-sitter Query** for manual checks. Reload after rebuilds or grammar changes.

## Coding Style & Naming Conventions

Prettier enforces two-space indentation, single quotes, semicolons, no trailing commas, and a preferred 100-column width. Use camelCase for functions/variables and PascalCase for types/interfaces. Keep explicit types at module boundaries, relative TypeScript imports suffixed with `.js`, and type-only imports separate.

Oxlint uses `oxlint-tsgolint` for type-aware checks and Vitest rules for unit tests. Configure rules in `.oxlintrc.json`; leave formatting to Prettier. `.prettierignore` excludes `.scm` fixtures, generated files, and `plan.md`; preserve fixture contents exactly.

## Testing Guidelines

Use Vitest and name tests `tests/<module>.test.ts`. No coverage threshold is configured. Add focused regression cases to existing tests.

Formatter tests must check layouts, token preservation, idempotence, comments, captures, indentation, LF/CRLF, and incomplete input. Run lint, format checks, typecheck, tests, and build for code changes; run editor integration checks when formatting, highlighting, or registration changes.

## Commit & Pull Request Guidelines

Use imperative subjects without prefixes: `Update README` or `Produce compact and consistent query layout`.

Describe behavior changes, verification results, and related issues in PRs. Include before/after queries for formatting changes or screenshots for highlighting changes.

Keep scope limited to highlighting and formatting; avoid new runtime dependencies, external query formatters, or language servers. Agents must not commit, push, or publish unless explicitly requested.
