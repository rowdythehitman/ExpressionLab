# ExpressionLab

A browser-based visual scripting editor for After Effects expressions. You build a node graph and it compiles to a
clean, readable AE expression that you paste into After Effects. Fully client-side.

- Spec: [`docs/SPEC.md`](docs/SPEC.md)
- Decisions log: [`docs/decisions.md`](docs/decisions.md)

## Status

**Phases 0, 1 and 2 are done.**

- **Editor:** a node canvas (React Flow) with typed ports. Each port type has its own colour and shape, and unconnected
  inputs get inline widgets. A wrong-type connection is refused with the reason and a one-click converter quick-fix.
  Press `Tab` or double-click the canvas to quick-add a node.
- **Globals strip:** the pinned CTRLS layer plus layers, controls and comps. Rename once and every expression updates.
- **Expressions:** each one has its own tab and target (with a 3D toggle). Edges that no longer fit after a target change
  stay in place, shown in red.
- **Output panel:**
  - live code, linked both ways to the canvas: select a node to highlight its lines, click a line to select its node;
  - Copy (with the embedded graph) and Copy clean;
  - clickable diagnostics and the setup checklist.
- **Paste-back:** pasting a copied expression into the app restores its graph as a new tab. If the code was edited by
  hand, you get a warning first.
- **Palette and presets:** 72 nodes, including text-selector Stagger, Typewriter and Index Ramp, and six presets.
- **Projects:** `.aenodes.json` open and save, autosave to IndexedDB, undo/redo, and an optional inlining pass.

The compiler (`src/core`) is pure TypeScript with no React or DOM code. Its tests cover:
- the golden output for every node and preset;
- an acorn parse check on everything it emits;
- a fuzz suite of random graphs;
- a mock AE runtime that evaluates the generated code numerically;
- a Playwright e2e smoke suite.

Manual checks for real After Effects are in [`docs/ae-verification.md`](docs/ae-verification.md).

Next: Phase 3 (remaining presets, user-defined nodes, sub-graph macros, AE 26 nodes, `.jsx` setup generator, curve
preview).

## Develop

```sh
npm install
npm run dev        # app at http://localhost:5173
npm test           # vitest (unit, golden, fuzz, mock runtime)
npm run e2e        # Playwright smoke suite (needs `npm run build`; set PW_CHROMIUM_PATH to reuse a local Chromium)
npm run gen:verify # regenerate docs/ae-verification.md
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
