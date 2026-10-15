# ExpressionLab

A browser-based visual scripting editor for After Effects expressions. You build a node graph and it compiles to a
clean, readable AE expression that you paste into After Effects. Fully client-side.

- Spec: [`docs/SPEC.md`](docs/SPEC.md)
- Decisions log: [`docs/decisions.md`](docs/decisions.md)

## Status

**Phase 1 (MVP): done.**

- **Editor:** a node canvas (React Flow) with typed ports. Each port type has its own colour and shape, and unconnected
  inputs get inline widgets. A wrong-type connection is refused with the reason and a one-click converter quick-fix.
- **Globals strip:** the pinned CTRLS layer plus layers, controls and comps. Rename once and every expression updates.
- **Target selector:** includes a 3D-layer toggle. Edges that no longer fit after a target change are kept and shown in red.
- **Node palette:** searchable, with 69 nodes. Nodes that don't fit the current target are disabled and say why.
- **Output panel:** live compiled expression, a Copy button (`Ctrl/Cmd+Shift+C`), clickable diagnostics and the setup
  checklist.
- **Project handling:** six presets, `.aenodes.json` import/export, autosave to IndexedDB, and undo/redo.

The compiler (`src/core`) is pure TypeScript with no React or DOM code. It is tested with a golden output for every node
and preset, a fuzz suite of random graphs, and an acorn parse check on everything it emits.

Next: Phase 2 (embedded graph payload and paste-back, source-map highlighting, inlining, multi-graph tabs, mock AE
runtime, `docs/ae-verification.md`, quick-add).

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
