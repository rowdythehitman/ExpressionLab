# ExpressionLab

A browser-based visual scripting editor for After Effects expressions. You build a node graph and it compiles to a
clean, readable AE expression that you paste into After Effects. Fully client-side.

- Spec: [`docs/SPEC.md`](docs/SPEC.md)
- Decisions log: [`docs/decisions.md`](docs/decisions.md)

## Status

**Phase 0 (skeleton): done.** Typed data model and zod schemas, a node library stored as JSON, and a pure compiler
(`src/core`, no React or DOM) that reproduces the spec's golden example
([`tests/compiler/golden/posterized-wiggle.txt`](tests/compiler/golden/posterized-wiggle.txt)). The UI is a placeholder
that shows the compiled preset, its diagnostics and its setup checklist.

Next: Phase 1 (MVP). That means the Globals panel, React Flow canvas, ~25 nodes, typed ports with converter quick-fixes,
autosave, and import/export.

## Develop

```sh
npm install
npm run dev        # app at http://localhost:5173
npm test           # vitest
npm run typecheck
npm run lint
npm run build
```

## Layout

```
src/core/      pure TS: types, schemas, node library (JSON), catalogs, typing, compiler
src/app/       React UI
tests/         vitest suites (compiler, nodes, ...)
docs/          spec, decisions
```
