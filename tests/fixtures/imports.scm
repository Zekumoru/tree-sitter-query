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
