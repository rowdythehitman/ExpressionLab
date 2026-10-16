# ExpressionLab

A browser-based visual scripting editor for After Effects expressions. You build a node graph and it compiles to a
clean, readable AE expression that you paste into After Effects. Fully client-side.

**Open the app:** https://rowdythehitman.github.io/ExpressionLab/ (nothing to install).

- Spec: [`docs/SPEC.md`](docs/SPEC.md)
- Decisions log: [`docs/decisions.md`](docs/decisions.md)

## Status

**Phases 0–3 are done.**

- **Editor:** a node canvas (React Flow) with typed ports. Each port type has its own colour and shape, and unconnected
  inputs get inline widgets. A wrong-type connection is refused with the reason and a one-click converter quick-fix.
  Press `Tab` or double-click the canvas to quick-add a node, or drop a wire on empty canvas to add a node that's
  already connected. Copy, cut, paste and duplicate nodes (`Ctrl/Cmd+C/X/V/D`), including between tabs and windows.
- **Inspector:** variable name (showing the identifier actually emitted), node colour, every input and setting, and
  "Add to Previewer".
- **Globals:** a pinned `GLOBALS` null, "this layer" and your own layers, each with its controls, plus comps. They're
  edited in a dialog (the Globals button). Rename once and every expression updates.
- **Nodes:** headers read `[Type] Name`. Double-click (or F2) to rename; the ○ circle adds or removes the node in the
  Output Preview.
- **Expressions:** each one has its own tab and target (with a 3D toggle). Edges that no longer fit after a target change
  stay in place, shown in red.
- **Output panel:**
  - **Preview** view: runs the expression live (sandboxed mock AE runtime) with a time scrubber and play button, the
    property value, a curve of the output over time, and the nodes you added to the previewer (live values, control
    preview values, overrides);
  - live code, linked both ways to the canvas: select a node to highlight its lines, click a line to select its node;
  - Copy (with the embedded graph) and Copy clean;
  - clickable diagnostics and the setup checklist.
- **Paste-back:** pasting a copied expression into the app restores its graph as a new tab. If the code was edited by
  hand, you get a warning first.
- **Palette and presets:** 86 nodes, including parent-fix, layout, marker, date and AE 26 nodes, and 24 grouped presets
  covering the §11 library.
- **Custom nodes and macros:** write your own nodes as JSON (validated live), or select nodes and **Make macro**
  to get a reusable node; **Ungroup** puts them back. Both travel with copy/paste and the embedded payload.
- **AE setup script:** download a `.jsx` that creates the GLOBALS null, null layers and every control in your comp.
- **Projects:** `.aenodes.json` open and save, autosave to IndexedDB, undo/redo, and an optional inlining pass.

The compiler (`src/core`) is pure TypeScript with no React or DOM code. Its tests cover:
- the golden output for every node and preset;
- an acorn parse check on everything it emits;
- a fuzz suite of random graphs;
- a mock AE runtime that evaluates the generated code numerically;
- a Playwright e2e smoke suite.

Manual checks for real After Effects are in [`docs/ae-verification.md`](docs/ae-verification.md).

Next: the After Effects panel (CEP/ZXP).

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

## Deploy

Every push to `main` builds the app and publishes it to GitHub Pages (`.github/workflows/pages.yml`). The build runs the
unit tests first, so a red `main` doesn't deploy. One-time setup: in the repo's **Settings → Pages**, set **Source** to
**GitHub Actions**.

## Layout

```
src/core/      pure TS: types, schemas, node library (JSON), catalogs, typing, compiler
src/app/       React UI
tests/         vitest suites (compiler, nodes, ...)
docs/          spec, decisions
```
