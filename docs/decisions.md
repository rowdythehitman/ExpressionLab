# Decisions

Choices made where the spec (docs/SPEC.md) said "decide" or was ambiguous. Newest at the bottom.

## Phase 0

1. **Repo layout.** The spec's `ae-nodes/` tree lives at the repo root (`src/core`, `src/app`, `tests`, `docs`).
2. **Product name = ExpressionLab** (from the repo name; answers open question §15.1 provisionally). It appears in the
   output header comment (`// ExpressionLab · Position (2D)`) and comes from one constant, `APP_NAME`, in
   `src/core/compiler/compile.ts`. The golden file was adapted to match. The embed prefix stays `//@ae-nodes:` as specced.
3. **Control refs get a `const`** even though §7.2 says global refs are inlined, because the golden example (§7.4) gives
   each control its own `const`. Layer refs go into the preamble. Context nodes (`time`, `value`, ...) and literals are
   inlined.
4. **The `CTRLS` variable** keeps the layer name as-is when it is a valid, non-reserved identifier (`CTRLS`, `Controls`);
   otherwise it is camelCased (`Title "Main"` → `titleMain`).
5. **Name dedupe.** A reserved base starts at 1 (`wiggle` → `wiggle1`); a base that's merely taken starts at 2
   (`shake`, `shake2`). Multi-output nodes name each used output `base + OutputId`; locals are `base_local`.
6. **Comments in `minimal` mode** go on nodes that declare a variable. A statement-only node such as Posterize Time gets
   no comment of its own, which matches the golden example. `verbose` comments every emitted node.
7. **Hoisted nodes are always kept**, even though they have no output that reaches the Output node.
8. **Hoist purity.** Upstream of a hoisted node may only be context nodes, literals, control refs and layer refs.
9. **String literals on non-string ports are raw code.** This allows defaults such as `index` (e.g. `math.random` seed).
   On `string` ports they're `JSON.stringify`'d.
10. **Errors blank the code.** When any error diagnostic exists, `code` is `''` and the source map is empty.
11. **`output` lives in `nodes/utility.json`** (the spec's file list had no home for it).
12. **Type compatibility:** after generic resolution, types must match exactly. An unbound generic on either side is
    accepted for now. The `vecN * number` exception arrives with `math.op` in Phase 1.
13. **More diagnostic codes:** `INVALID_PROJECT`, `UNKNOWN_NODE_TYPE`, `DANGLING_EDGE` (also used for a second edge
    into the same input) and `DUPLICATE_ID`, for the zod and structure checks in §7.1 step 1.
14. **Tooling:** TypeScript is pinned to 5.9 (typescript-eslint support). React Flow, Zustand and CodeMirror will be
    installed in Phase 1, when the UI that needs them is built.

## Phase 1

15. **Vector maths uses AE's functions.** `add()`, `sub()`, `mul(vec, n)` and `div(vec, n)` are used, and element-wise ops
    use `.map(...)`. We don't rely on `+`/`-` working on arrays in the JS engine. Number maths keeps plain operators. To
    allow this, templates can branch on resolved types. **Verify in AE** that the `.map` forms evaluate as expected.
16. **Extensions to the NodeDef format**:
    - The `when` grammar gains `&&`, `||` and `type.X == "..."`, where X is a generic (`T`, `V`) or an input id (its
      resolved type).
    - `PortDef.acceptsScalar` is a `when` condition under which a `number` may feed a generic vector port (`math.op`
      mul/div, spec §6 rule 1).
    - `NodeDef.inline` substitutes the expression where it's used instead of emitting a `const`. Used by `thisLayer`,
      `parent`, `hasParent` and `ref.property`.
    - `special: 'ref.property'` plus a `{{ref.path}}` placeholder, resolved from `catalog/properties.json`.
17. **Generic fallback.** An unbound generic resolves from a literal array's length (2 → vec2, 3 → vec3, 4 → color). If
    that fails, it uses the first type in the node's `generics` list (usually `number`). `V` falls back to the target
    type. A number literal on a vector port is broadcast (`0` → `[0, 0]`).
18. **Broadcast is two nodes** (`vec.broadcast2` / `vec.broadcast3`). A node's output type can't depend on a param.
19. **Trig in degrees** emits `Math.sin(degreesToRadians(a))`. The spec's `sinDeg` isn't documented AE API, so we avoid it.
20. **Remap, unclamped** extrapolates linearly whatever the mode, because the AE ease functions always clamp.
21. **`ref.property` catalog** covers the transform properties and Source Text. Paths are emitted in dot notation
    (`thisLayer.transform.position`). Match names are recorded in the catalog but not emitted yet. Position, scale and
    anchor are vec3 when the wired layer global is 3D, or when there's no layer and the target is 3D.
22. **Checkbox controls output `number`** (0/1), as the spec says. Use Checkbox Gate to multiply, or Compare (`== 1`) to
    get a boolean.
23. **Presets are full project files.** Loading one replaces the current project; it can be undone.
24. **Undo coalescing.** Edits with the same key within 800 ms (typing in a widget, one drag) count as one undo step.
25. **Moved to Phase 2:** `Tab` quick-add (listed in Phase 2 in §14) and "Copy clean" (only meaningful once the embedded
    payload exists).
26. **To verify in AE:** that `toComp`/`fromComp`/`toWorld`/`fromWorld` keep the input point's dimensions (they're typed
    `T` → `T`).

## Phase 2

27. **Payload hash** is FNV-1a (32-bit) over the body with normalised line endings and trailing whitespace, so a
    copy-paste round trip through AE (CRLF, trailing spaces) doesn't count as an edit. It detects edits; it isn't
    security.
28. **Payload globals** hold only what the graph references: CTRLS plus the layers and controls it uses. On import,
    globals merge by id and **the project's existing definitions win**. Missing ones are added. A graph whose id or name
    already exists gets a new id and an " (imported)" suffix.
29. **Payload size** is reported in the UI (the compressed line is built asynchronously, after `compile()`).
    `PAYLOAD_TOO_LARGE` is added there, not by the compiler.
30. **Parenthesisation** happens in the template engine. A substituted input is wrapped in `( )` when it isn't atomic
    (an operator, space or comma at depth 0, outside strings) and its slot isn't an argument, array element, ternary
    branch or right-hand side. This also fixes raw-code literals such as `time - 1`.
31. **Inlining is opt-in** (`settings.inlineSingleUse`, default off). This keeps the golden output and named variables,
    which suit hand tweaking. When on, it folds single-use nodes that have no statements, locals or hoisting. Control
    refs (named globals read better) and nodes marked `noInline` (`wiggle`, `loopWiggle`, which depend on random-seed
    order) are never folded. A folded node's source-map range is its consumer's. A fuzz test checks, with the mock
    runtime, that inlining never changes the result.
32. **Mock AE runtime** (`tests/runtime/mockAE.ts`) models the API our nodes emit, with deterministic smooth noise
    for wiggle and noise. It checks behaviour (endpoints, seams, gating), not AE's exact numbers.
33. **`docs/ae-verification.md` is generated** from node `verify` strings, preset `verify` strings and spec-level
    items. A test fails when it's stale; `npm run gen:verify` regenerates it.
34. **Text-animator nodes:** Stagger, Typewriter (100 = not yet typed; pair with an Opacity 0% animator) and Index Ramp.
    All are limited to the Text Selector Amount context.
35. **E2E:** Playwright runs against `vite preview` of the production build. Locally, `PW_CHROMIUM_PATH` can point at a
    preinstalled Chromium. In CI, the e2e job installs the Playwright browser.
36. **UI labels:** "Import/Export" became "Open/Save" (project files), with a separate "Paste expression" for
    paste-back. Pasting an ExpressionLab expression anywhere outside a text field also offers to import it.

## Feedback round 1 (UX + Output Preview)

37. **Clipboard:** nodes are copied as JSON on the system clipboard (`expressionlab/nodes@1`), so copy and paste work
    across tabs and windows. The clip carries the controls and layers its nodes reference, merged by id on paste (the
    project's existing definitions win). Output is never copied. Paste lands at the mouse when it's over the canvas;
    `Ctrl/Cmd+D` duplicates with a 40px offset. Text fields, the code view and dialogs keep normal text copy and paste.
38. **Multi-selection:** the store keeps `selection` (ordered). The last-selected node is the inspector's. Shift-drag
    box-selects; Shift or Ctrl/Cmd-click adds to the selection.
39. **Wire-drop quick-add** lists only nodes that can take the wire. It uses the real connection check, so generics
    and the vecN × number rule apply. The node is created and wired in one undo step.
40. **Node colour and previewer flag** are optional `NodeInstance` fields (`color`, `preview`). Old files stay valid.
    The inspector's "Variable name" shows the identifier actually emitted (from `CompileResult.variables`).
41. **Output Preview** compiles a separate, instrumented copy of the expression. `__probe` lines report tagged nodes and
    `__in` substitutes overridden outputs. The copied code is never instrumented. `time` and `value` are driven by the
    preview's scrubber and value field. Controls use a new optional `ControlGlobal.previewValue`, defaulting per type.
42. **Preview sandbox:** previewed code (which can include raw code from a pasted expression) runs in an
    `<iframe sandbox="allow-scripts">` with a CSP that blocks all network access. It has an opaque origin, so it can't
    read this page's IndexedDB projects. The runtime is `src/core/runtime/mockAE.js` (plain JS, shared with the tests),
    loaded into the iframe as text. Each evaluation times out after 3s.
43. **Curve chart:** the series colours (x/y/z/w) were checked with the dataviz palette validator against the dark
    surface, and all checks pass. Lines are 2px, with a legend plus direct labels and a hover crosshair and tooltip.
    Click or drag on the chart to scrub.

## Feedback round 2

44. **The controls null is called `GLOBALS` by default** (the spec said `CTRLS`). New projects and every preset use it;
    saved projects keep whatever name they have. The golden example in §7.4 now reads `const GLOBALS = …`.
45. **Node headers read `[Type] Name`.** The name defaults to the node type (a control's effect name for Control
    nodes). Rename it by double-clicking it, pressing F2 on the selected node, or in the inspector. Clearing the name
    restores the default. For nodes that become a variable, the name is also the variable name. For inline nodes
    (Time, Value, This Layer…) it's only a label.
46. **The ○/◉ circle on each node header toggles "Add to Previewer".** The inspector checkbox does the same.
47. **Globals are edited in a dialog** opened from the Globals button or any chip. It has a card for the GLOBALS null,
    one for "this layer", and one per layer, each listing its controls with add/rename/retype/move/delete, plus comps.
    Deleting a layer moves its controls onto the GLOBALS null instead of dropping them.

## Phase 3a

48. **New nodes** (all with golden outputs, ES-parse checks and mock-runtime tests):
    - Ignore Parent Rotation / Scale (optional whole-chain walk; a 0% parent axis is skipped rather than dividing by
      zero) and Inherit Parent Opacity;
    - Scale to Width, Max Width Scale and Maintain Stroke Width;
    - Wiggle Between (`wiggle(f, (max-min)/2, 1) - value + mid`, which fixes the library snippet's undefined
      `f`/`a` and missing `- value`);
    - Loop Path Keyframes (cycle via `valueAtTime`, because `loopOut` doesn't work on paths);
    - Current Marker (time, duration, comment, passed);
    - Current Date (five formats; render-time date);
    - AE 26 nodes, gated by Settings › AE version: Previous/Next Keyframe, Previous Marker and Dropdown Text.
49. **NodeDef extensions:** a statement template may span several lines or render empty (an optional branch).
    `{{ref.control}}` gives the control's expression inside a template. `controlTypes` limits which controls a
    `ref.control` node accepts, and filters its picker.
50. **Presets:** there are now 24, covering the §11 library, in six menu groups. Their metadata (group and AE
    expectation) lives in `presets/index.ts`, and the files are loaded with `import.meta.glob`.
51. **Setup script:** `generateSetupScript(project)` emits ES3 ExtendScript, parse-checked with acorn at
    `ecmaVersion: 3` for every preset. It creates the GLOBALS null and missing null layers, warns about other missing
    layers instead of guessing their content, and adds every control by effect match name, with dropdown items
    (`setPropertyParameters`, AE 17.0.1+) and preview values. Controls on "this layer" go on the selected layers.
    Existing ones are skipped, everything is one undo group, and it ends with a report. Download it from the Globals
    dialog or the setup checklist.
52. **Mock runtime** now models AE's property coercion (a property used in arithmetic, or as the final result, gives
    its value), `toComp` and friends as globals, `previousKey`/`nextKey`, and markers with duration and comment.

## Phase 3b

53. **User-defined nodes** live in `Project.customNodes` (an optional field, so old files stay valid). Ids must
    start with `user.`, and a custom node can never replace a built-in. `nodeLibrary(project)` merges them;
    compile, analysis, connection checks, the palette, quick-add and the inspector all use it.
    `validateCustomNode` adds checks the schema can't express: every `{{in/param/local}}` placeholder must refer to
    something declared, `when` conditions must parse, the last branch must be the fallback, and select defaults
    must be valid. The editor shows these problems live.
54. **Macros** are custom nodes with a `macro` body (inner nodes and edges, input fan-out targets, output
    mappings).
    - **Compiling:** macros are expanded before compiling and type analysis, nested up to 8 levels deep; a macro
      containing itself is an error. Diagnostics, source lines, variables and preview probes and overrides are all
      mapped back to the instance.
    - **Naming:** inner variables are prefixed with the macro's name (`shakerWiggle`); control refs keep their
      effect name.
    - **Making one:** "Make macro" creates one input per distinct upstream source and one output per distinct inner
      output, using the resolved port types. Wrapping a whole preset in a macro gives the same evaluated result;
      the tests check this for every preset.
    - **Ungroup:** puts the nodes back, carrying any literal values from the instance.
55. **Portability:** the embedded payload and the node clipboard carry the custom nodes a graph uses (including
    those inside macros), with globals from macro bodies. On import they merge by id, and existing definitions win.
56. **Top bar:** Open, Save, Paste expression and the setup script moved into a **File** menu so the bar fits on one
    line next to the new **★ Custom nodes** button.

## AE panel (CEP), part 1

57. **CEP first, not UXP:** UXP for After Effects is still in beta, while CEP panels run in every AE from 2022 on. The
    panel is the same app built with `--mode panel`. A host adapter (`src/app/host`) is the only code that knows
    about AE. When there's no `window.__adobe_cep__` the app is the web app, unchanged.
58. **Host script contract:** `cep/host/host.jsx` (ES3) exposes `ExpressionLab.*` functions that always return JSON
    text, `{ok: true, ...}` or `{ok: false, error}`. Arguments are passed as ES3-safe string literals
    (`jsxString`, shared with the setup script). Applying the expression is one undo group. Per-property failures,
    including AE's `expressionError`, are reported instead of stopping the run. Only properties with
    `canSetExpression` count as selected.
59. **Targets from the selection:** match names map to targets (`ADBE Position` → position2D/3D by the layer's 3D
    switch, `ADBE Text Expressible Amount` → textSelectorAmount, and so on). Properties under a text animator or an
    effect use their value type. Anything else becomes Custom with its value type. Markers and other unsupported
    types are refused.
60. **Old Chromium:** CEP 11 runs Chromium 88. The build targets chrome88 syntax. `panel.ts` polyfills
    `structuredClone` (a JSON clone; projects are plain JSON) and `Array.prototype.at`, and swaps the payload codec
    for Node's zlib when `deflate-raw` streams are missing (`setRawDeflate`; same bytes, tested both ways). The
    sandbox runtime avoids `.at()` because it runs unpolyfilled in the iframe.
61. **Files in the panel:** downloads don't exist in CEP, so `downloadText` goes through `cep.fs` save dialogs. Copy
    falls back to `execCommand` when the async clipboard is refused.
