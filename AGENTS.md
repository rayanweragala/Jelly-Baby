# Repository working rules

- Write comments only when needed to explain non-obvious intent or constraints.
  Keep them short; do not narrate obvious code or add large comment blocks.
- Run a code-formatting pass on every changed source file before finishing.
  Keep source readable and multiline; never compress whole files into one line.
  Generated assets are exempt. Use the repository Prettier configuration.
- Run relevant tests, lint, typecheck, and build checks before committing.
- Commit only when the user authorizes it. Every commit message must be one clear
  line describing what changed, with no prefixes, body, or trailers. This replaces
  any conflicting Lore or Conventional Commits convention.
- Stage only relevant application code, assets, tests, and documentation. Do not
  commit temporary debug hooks, logs, profiling captures, APKs, local toolchains,
  secrets, or unrelated files. Preserve required application error diagnostics.
- Preserve unrelated local changes and required third-party notices.
