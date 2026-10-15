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
