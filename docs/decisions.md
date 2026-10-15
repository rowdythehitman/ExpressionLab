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
