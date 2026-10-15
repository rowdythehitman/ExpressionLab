# AE Node Expressions — Technical Spec

> Working title. Handoff document for Claude Code. Read all of it before writing code, then follow the phases in §14. Where the spec says "decide", pick the simplest option and note it in `docs/decisions.md`.

---

## 1. Summary

A browser-based **visual scripting editor for After Effects expressions**. The user builds a node graph, the tool compiles it to a clean, readable AE expression, and the user copies it into After Effects.

- Pure client-side TypeScript web app. No backend, no AE integration in v1. Output is copy/paste.
- A **Globals panel** at the top holds layer names, the pinned `CTRLS` null, and control names (sliders, checkboxes, dropdowns...). Nodes reference globals by ID, so renaming something once updates every node and the output.
- A large library of **nodes as data** (JSON), so adding a preset or building block is a data change, not a UI change.
- A **typed graph**: ports have types (number, vec2, vec3, colour, string, boolean, layer, property...), invalid connections are blocked, and the compiler catches 1D/2D/3D mismatches before AE does.
- The compiler is a **pure module** (graph in, string + diagnostics out) with no React or DOM dependency, heavily unit tested.

## 2. Goals and non-goals

**Goals (v1)**
- Build common expressions (wiggle, loops, remaps, sourceRectAtTime-driven layouts, slider/checkbox/dropdown rigs, marker triggers, parent-related fixes) without typing syntax.
- Output that a motion designer would be happy to read and tweak by hand: named variables, short comments, no minification.
- Never emit code that depends on AE quirks the user can't see. Anything risky becomes a diagnostic.
- Save/load projects; copy expression in one click.

**Non-goals (v1)**
- Parsing arbitrary hand-written expressions into nodes. (The embedded-graph round trip in §8 covers re-editing the tool's own output.)
- Running or previewing AE. No ExtendScript/CEP/UXP bridge in v1.
- Keyframe editing, state across frames (AE expressions are stateless per frame; the graph must be a DAG).
- Legacy ExtendScript expression engine. **JavaScript engine only.**

## 3. Core concepts

| Concept | Meaning |
|---|---|
| **Project** | Globals + one or more graphs + settings. Saved as `.aenodes.json`. |
| **Globals** | Shared definitions: the `CTRLS` layer name, other layers, controls (effects) and their types, comps. |
| **Graph** | One expression: a **target** (which property it's applied to), nodes, edges. |
| **Target** | The property the expression is pasted onto (Position 2D, Opacity, Text Selector Amount...). Sets the output type and which context variables exist. |
| **Node** | An instance of a `NodeDef` with literal input values, params and position. |
| **Diagnostics** | Errors (block copy), warnings (allow copy), and a **setup checklist** (e.g. "CTRLS needs a Slider named 'Delay'", "Property needs keyframes"). |

## 4. Tech stack and repo layout

- **Vite + React + TypeScript (strict)**
- **@xyflow/react** (React Flow) for the canvas
- **Zustand** for app state; **zod** for schemas (project files, node defs)
- **CodeMirror 6** for the read-only output pane (lighter than Monaco)
- **Vitest** for unit tests, **Playwright** for a small e2e smoke suite (Phase 2)
- Styling: plain CSS variables or Tailwind, Claude Code's choice. No heavy component kits.
- Static build; deployable to any static host.

```
ae-nodes/
  src/
    core/                      # PURE TS. No React, no DOM. Everything here is unit tested.
      types.ts                 # ValueType, PortType, NodeDef, Graph, Globals, Project
      schema.ts                # zod schemas for project files and node defs
      nodes/                   # node library as JSON, one file per category
        context.json  globals.json  math.json  vector.json
        animation.json  logic.json  space.json  text.json  marker.json
      catalog/
        targets.json           # target property catalog (type, dims, context vars)
        properties.json        # property paths + match names for ref.property
        reserved.json          # reserved identifiers (AE + JS)
      typing/                  # generic resolution, coercion table, converter suggestions
      compiler/
        compile.ts             # pipeline entry point
        topo.ts                # Kahn's algorithm, deterministic tie-break
        template.ts            # {{placeholder}} engine + `when` conditions
        naming.ts              # variable naming + collision handling
        diagnostics.ts
        embed.ts               # graph payload encode/decode (§8)
      presets/                 # example graphs as JSON (§11)
    app/                       # React UI (§12)
  tests/
    compiler/  typing/  nodes/  presets/  roundtrip/
  docs/
    decisions.md
    ae-verification.md         # generated: manual AE test checklist per node (§13)
```

## 5. Data model

```ts
type ValueType = 'number' | 'vec2' | 'vec3' | 'color' | 'string' | 'boolean'
               | 'path' | 'layer' | 'rect';

// Port types are strings in JSON. 'T' = generic from NodeDef.generics.
// 'V' = reserved generic bound to the graph target's value type.
// 'property<X>' = a property object (not its value), e.g. 'property<vec2>' or 'property<V>'.
type PortType = ValueType | 'T' | 'V' | `property<${ValueType | 'T' | 'V'}>`;

type Literal = number | string | boolean | number[];

// A template is a string, or an ordered list of branches (first matching `when` wins).
// `when` grammar (deliberately tiny): connected(inputId) | !connected(inputId) | param.id == "value"
type Tpl = string | Array<{ when?: string; text: string }>;

interface PortDef {
  id: string; label: string; type: PortType;
  default?: Literal;           // shown as an inline widget when the input is unconnected
  optional?: boolean;          // may be left unconnected with no default
  widget?: 'number' | 'slider' | 'angle' | 'color' | 'text' | 'checkbox';
  min?: number; max?: number; step?: number;
}

interface ParamDef {           // non-socket UI choice; cannot be wired
  id: string; label: string;
  kind: 'select' | 'number' | 'text' | 'checkbox';
  options?: string[]; default: Literal;
  emit?: 'raw' | 'string';     // 'string' => JSON.stringify'd when substituted (default 'raw')
  advanced?: boolean;          // hidden behind a disclosure on the node
}

interface NodeDef {
  id: string;                  // 'anim.wiggle'
  label: string;
  category: 'context' | 'globals' | 'math' | 'vector' | 'animation'
          | 'logic' | 'space' | 'text' | 'marker' | 'output' | 'utility';
  description: string;
  tags: string[];              // search keywords
  generics?: Record<string, ValueType[]>;   // e.g. { "T": ["number","vec2","vec3","color"] }
  inputs: PortDef[];
  params?: ParamDef[];
  outputs: Array<{ id: string; label: string; type: PortType; expr: Tpl }>;
  locals?: string[];           // temp variable names; auto-prefixed per node instance
  statements?: Tpl[];          // emitted before outputs, in order
  hoist?: 'top';               // global modifier (e.g. posterizeTime); see §7.6
  hoistKey?: string;           // at most one hoisted node per key per graph
  contexts?: string[];         // allowed target contexts (e.g. ['textSelectorAmount'])
  requires?: { keyframes?: boolean; minAE?: number; parent?: boolean };
  special?: 'ref.control' | 'ref.layer' | 'literal' | 'output' | 'reroute' | 'comment';
  source?: string;             // inspiration/attribution, e.g. 'aereference.com'
  verify?: string;             // one-line manual AE check, feeds docs/ae-verification.md
}
```

**Placeholders in templates**

| Placeholder | Renders as |
|---|---|
| `{{in.<id>}}` | Upstream variable/expression if connected, otherwise the input's literal default |
| `{{param.<id>}}` | Param value (quoted if `emit: 'string'`) |
| `{{local.<id>}}` | Per-instance unique variable name, e.g. `loopWiggle1_t` |

Anything the template engine can't resolve is a **compile error**, never silently blank.

**Instances, graphs, projects**

```ts
interface NodeInstance {
  id: string; type: string; position: { x: number; y: number };
  name?: string;                           // user label; drives the emitted variable name
  inputs: Record<string, Literal>;         // literal values for unconnected inputs
  params: Record<string, Literal>;
  ref?: { controlId?: string; layerId?: string; propertyPath?: string };
}
interface Edge { id: string; from: { node: string; port: string }; to: { node: string; port: string } }
interface Graph { id: string; name: string; target: TargetSpec; nodes: NodeInstance[]; edges: Edge[] }

type ControlType = 'slider' | 'checkbox' | 'dropdown' | 'color' | 'point' | 'point3d' | 'angle' | 'layer';
interface Globals {
  ctrls: { layerName: string };            // default "CTRLS"; pinned, cannot be deleted, rename allowed
  layers: Array<{ id: string; key: string; layerName: string; is3D: boolean;
                  kind: 'null' | 'text' | 'shape' | 'solid' | 'precomp' | 'other' }>;
  controls: Array<{ id: string; effectName: string; type: ControlType;
                    host: 'ctrls' | 'thisLayer' | { layerId: string };
                    dropdownItems?: string[] }>;
  comps: Array<{ id: string; name: string }>;
}
interface Settings {
  aeTarget: number;                        // default 26; gates nodes via requires.minAE
  useMatchNames: boolean;                  // default false (see §9)
  comments: 'none' | 'minimal' | 'verbose';  // default 'minimal'
  embedGraph: boolean;                     // default true
}
interface Project { version: 1; globals: Globals; graphs: Graph[]; settings: Settings }
```

A node references a global by **ID**, never by name. That is the mechanism behind "rename once, everything updates".

## 6. Type system

**Targets** (`catalog/targets.json`) define: output `ValueType`, dimension rules, and which context variables exist. Initial set:

| Target id | Value type | Notes |
|---|---|---|
| `position2D` / `position3D` | vec2 / vec3 | 3D when the layer is 3D |
| `scale2D` / `scale3D` | vec2 / vec3 | AE scale is in percent |
| `anchorPoint2D` / `anchorPoint3D` | vec2 / vec3 | |
| `rotation`, `opacity` | number | |
| `sourceText` | string | |
| `textSelectorAmount` | number | **Only** context where `textIndex`, `textTotal`, `selectorValue` exist |
| `textAnimatorProperty` | number / vec2 / color | user picks the type |
| `effectNumber`, `effectColor` | number / color | slider, angle, colour params |
| `shapePath`, `maskPath` | path | |
| `shapeStrokeWidth`, `shapeFillColor` | number / color | |
| `custom` | user-selected `ValueType` | escape hatch for anything else |

**Rules**

1. **Ports connect only when types match exactly**, after generic resolution. Exceptions, which are native AE behaviour: `vecN * number` and `vecN / number` (math node `mul` / `div`).
2. **Generics resolve by propagation**: the first connected input binds `T`; the rest must agree. `V` is bound to the target type (or to a connected `prop`'s type).
3. **No implicit dimension coercion.** When a connection is rejected, the UI offers a **converter quick-fix** that inserts a node:
   - number → vec2/vec3: *Broadcast* (`[n, n]`)
   - vecN → number: *Pick component* (`v[i]`)
   - vec3 → vec2: *Drop Z*, vec2 → vec3: *Add Z* (default 0)
   - color → vec3: *Drop alpha*
4. Context nodes are **disabled in the palette** (not hidden) when the target doesn't support them, with a tooltip saying why.
5. Edges that become invalid after a type change (e.g. switching target 2D → 3D) are kept but flagged red, not silently deleted.

## 7. Compiler

`compile(project, graphId) → { code: string, diagnostics: Diagnostic[], checklist: ChecklistItem[], sourceMap: SourceMap }`

### 7.1 Pipeline

1. **Validate** structure with zod (unknown node types, dangling edges, duplicate IDs).
2. **Resolve types**: propagate generics, check edges, check the single `output` node's input type against the target.
3. **Prune**: keep only nodes that reach the output. Unreached nodes get an info diagnostic (UI dims them).
4. **Topological sort** (Kahn). Ties broken by node position (x, then y, then ID) so output is **deterministic and diff-friendly**. A cycle is an error naming the nodes involved.
5. **Context check**: node `contexts`, `requires.minAE`, `requires.parent`.
6. **Name variables** (§7.3).
7. **Emit** (§7.4).
8. **Collect diagnostics and checklist.**

### 7.2 Emission rules

- Every non-literal node output used downstream is emitted as `const <name> = <expr>;` in v1. Literals and global refs are inlined. (An **inlining pass** for single-use, side-effect-free nodes comes in Phase 2, with correct parenthesisation.)
- Nodes with `statements`, `hoist`, or `locals` are **never inlined**.
- Unused outputs of multi-output nodes are not emitted.
- The final line is the **bare output expression** (AE returns the last evaluated expression).
- All string literals (layer names, effect names) are emitted via `JSON.stringify`, so a layer called `Title "Main"` can't break the expression.

### 7.3 Naming

- Variable name = camelCase of `node.name` or the node's label (control and layer refs use the effect/layer name). Sanitise to a valid identifier; prefix `_` if it starts with a digit.
- Dedupe with numeric suffixes (`wiggle1`, `wiggle2`).
- **Never collide with reserved identifiers.** `catalog/reserved.json` must include at least: all JS reserved words, plus AE expression globals: `time value index thisComp thisLayer thisProperty thisProject parent hasParent inPoint outPoint startTime name text transform effect mask marker key numKeys width height wiggle linear ease easeIn easeOut clamp random seedRandom noise length add sub mul div loopIn loopOut valueAtTime posterizeTime degreesToRadians radiansToDegrees timeToFrames framesToTime comp footage layer`. A node called "Wiggle" must become `wiggle1`, never `wiggle`.
- Layer globals have a user-editable `key`; validate it against the same rules and show suggestions (`titleLayer`).

### 7.4 Output layout

```js
// AE Node Expressions · Position (2D)          <- header comment (settings.comments != 'none')
const CTRLS = thisComp.layer("CTRLS");          <- preamble: only layers/ctrls actually used
const titleLayer = thisComp.layer("Title");

// Stop Motion FPS                              <- hoisted nodes + their upstream first (§7.6)
const stopMotionFps = CTRLS.effect("Stop Motion FPS")("Slider");
posterizeTime(stopMotionFps);

// Wiggle Freq                                  <- remaining nodes in topo order
const wiggleFreq = CTRLS.effect("Wiggle Freq")("Slider");
// Wiggle Amp
const wiggleAmp = CTRLS.effect("Wiggle Amp")("Slider");
// Wiggle
const wiggle1 = wiggle(wiggleFreq, wiggleAmp, 1, 0.5);

wiggle1                                         <- final expression
//@ae-nodes:v1:<payload>                        <- embedded graph (§8), if enabled
```

This is the **golden example**; commit it as `tests/compiler/golden/posterized-wiggle.txt`.

### 7.5 Source map

Return `nodeId → [startLine, endLine]` so the UI can highlight a node's code and vice versa (Phase 2). Build this into the emitter from day one; retrofitting is painful.

### 7.6 Hoisted (global modifier) nodes

`posterizeTime(fps)` affects everything evaluated after it, so it can't sit mid-graph. Nodes with `hoist: 'top'`:
- are emitted after the preamble and **after their own upstream nodes**, before every other node;
- their upstream must be pure (literals, controls, context nodes). Otherwise error `HOIST_IMPURE_UPSTREAM`;
- at most one per `hoistKey`. A second is error `HOIST_DUPLICATE`.

### 7.7 Diagnostic codes (initial)

`CYCLE`, `TYPE_MISMATCH`, `DIM_MISMATCH`, `MISSING_INPUT`, `NO_OUTPUT`, `MULTIPLE_OUTPUTS`, `CONTEXT_UNAVAILABLE`, `UNRESOLVED_PLACEHOLDER`, `HOIST_IMPURE_UPSTREAM`, `HOIST_DUPLICATE`, `RESERVED_NAME`, `GLOBAL_NOT_FOUND` (error); `NEEDS_KEYFRAMES`, `NEEDS_PARENT`, `MIN_AE_VERSION`, `UNUSED_NODE`, `PAYLOAD_TOO_LARGE` (warning/info).

**Setup checklist** is derived from what the graph uses, e.g. *"Add Slider Control 'Wiggle Freq' to CTRLS"*, *"Apply to: Position"*, *"Property needs keyframes (loopOut)"*, *"Layer 'Title' must exist and be a text layer"*. This is a headline feature: it turns "why is my expression red" into a to-do list.

## 8. Embedded graph and paste-back

Goal: the user pastes the expression back into the tool later and gets the **full graph back**, with no expression parser needed.

- Last line of output: `//@ae-nodes:v1:<payload>`
- Payload = base64url( deflate-raw( JSON{ graph, globalsSubset, bodyHash } ) ), using `CompressionStream` / `DecompressionStream`.
- `bodyHash` = hash of everything **above** the payload line. On import, if it doesn't match, the expression was edited by hand: warn *"Loading the graph discards manual edits"* and offer to continue.
- A global paste handler detects the `//@ae-nodes:` prefix anywhere in the app and offers to import it as a new graph. Also an explicit **Import** button.
- Budget: warn at 8 KB. The `embedGraph` setting toggles it. Copy button has "Copy clean (no payload)" as an alternative.
- Version the payload (`v1`). Never break old payloads; add a migration function per version.

## 9. After Effects rules the compiler must respect

Non-negotiable. Several are the most common ways generated AE code breaks.

1. **JavaScript engine only.** `const`, `let`, arrow functions, template literals are fine. camelCase API names only (`thisComp`, `toWorld`).
2. **Braces on every `if`/`else`**, or use ternaries.
3. **Effect access uses double parens:** `effect("Name")("Slider")`. Never `.Slider`.
   - The **second** name is the parameter's display name, which is **localised** in non-English AE. With `settings.useMatchNames` on, emit match names instead (e.g. `"ADBE Slider Control-0001"`). Defaults to off for readability. *Verify these match names in AE before shipping:* Slider `ADBE Slider Control-0001`, Checkbox `ADBE Checkbox Control-0001`, Dropdown `ADBE Dropdown Control-0001`, Color `ADBE Color Control-0001`, Point `ADBE Point Control-0001`, 3D Point `ADBE Point3D Control-0001`, Angle `ADBE Angle Control-0001`, Layer `ADBE Layer Control-0001`.
   - Control property names: Slider → `Slider`, Checkbox → `Checkbox`, Dropdown → `Menu`, Color → `Color`, Point → `Point`, 3D Point → `3D Point`, Angle → `Angle`, Layer → `Layer`.
4. **Transform uses dot notation:** `transform.position`. Never `transform("position")`.
5. **Shape content is a full chain:** `content("Shape 1").content("Path 1").path`.
6. **Index after the call:** `scale.valueAtTime(t)[0]`, never `scale[0].valueAtTime(t)`.
7. **Layer indices are 1-based**; `thisComp.layer(0)` is invalid.
8. **`textIndex`, `textTotal`, `selectorValue` exist only in a text Expression Selector's Amount.** `textIndex` is 1-based (use `arr[textIndex - 1]`). Its meaning follows the selector's "Based On" setting, so add a checklist note.
9. **Expressions are stateless per frame.** No `console`, `alert`, `fetch`, `setTimeout`, DOM, file access. The graph is a DAG.
10. **`loopIn`/`loopOut` need keyframes** on the property: `requires.keyframes` → `NEEDS_KEYFRAMES` checklist item.
11. **Avoid cascading references** like `thisComp.layer(index - 1).transform.position`: cost grows with every layer. Delay/offset nodes must reference a fixed layer with `valueAtTime(time - offset)`. If a user builds the cascading pattern, emit a performance warning.
12. **3D-ness decides dimensions.** `position` is vec3 on a 3D layer. Layer globals carry `is3D`.
13. **AE 26+ features** (`previousKey(time)`, `nextKey(time)`, dropdown `.text` / `.items`) are separate nodes with `requires.minAE: 26`, gated by `settings.aeTarget`.
14. **Reserved identifiers** (§7.3).

## 10. Starter node library

Each node below is a `NodeDef`. `T` = generic (number | vec2 | vec3 | color). `V` = target value type. IDs are suggestions.

### 10.1 Context (inline, no statements)

| ID | Out | Template | Notes |
|---|---|---|---|
| `ctx.value` | V | `value` | the property's own value |
| `ctx.time` | number | `time` | |
| `ctx.index` | number | `index` | |
| `ctx.inPoint` / `ctx.outPoint` | number | `inPoint` / `outPoint` | |
| `ctx.frameDuration` | number | `thisComp.frameDuration` | |
| `ctx.fps` | number | `(1 / thisComp.frameDuration)` | |
| `ctx.compSize` | vec2 | `[thisComp.width, thisComp.height]` | |
| `ctx.compCenter` | vec2 | `[thisComp.width / 2, thisComp.height / 2]` | |
| `ctx.layerSize` | vec2 | `[thisLayer.width, thisLayer.height]` | |
| `ctx.textIndex` / `ctx.textTotal` / `ctx.selectorValue` | number | as named | `contexts: ['textSelectorAmount']` |
| `lit.number/vec2/vec3/color/string/boolean` | per type | JS literal | `special: 'literal'` |

### 10.2 Globals

- **`ref.control`**: picks a control from Globals. Output type from `ControlType` (slider → number, checkbox → boolean-as-number, dropdown → number, color → color, point → vec2, point3d → vec3, angle → number, layer → layer). Emits `<host>.effect("<effectName>")("<paramName>")`. `special: 'ref.control'`, handled in compiler code.
- **`ref.layer`**: picks a layer global. Output `layer`. Emits `thisComp.layer("<layerName>")` (hoisted to a preamble `const`).
- **`ref.thisLayer`** (`thisLayer`), **`ref.parent`** (`parent`, `requires.parent`), **`ref.hasParent`** (`hasParent`, boolean).
- **`ref.property`**: layer + property path chosen from `catalog/properties.json`. Two outputs: `prop` (`property<X>`) and `value` (X, emits `.value`).

### 10.3 Math

| ID | Ports | Template |
|---|---|---|
| `math.op` | `a:T`, `b:T` (`b:number` allowed for mul/div); param `op` = add/sub/mul/div/mod/pow/min/max | add/sub/mul/div → `a <op> b`; mod → `a % b`; pow → `Math.pow(a, b)`; min/max → `Math.min/max(a, b)` |
| `math.unary` | `a:number`; param `fn` = abs/floor/ceil/round/sqrt/neg | `Math.abs(a)` etc. |
| `math.trig` | `a:number`; params `fn` = sin/cos/tan, `unit` = deg/rad | deg → `sinDeg(a)`; rad → `Math.sin(a)` |
| `math.clamp` | `v:T`, `min:number`, `max:number` | `clamp(v, min, max)` |
| `math.remap` | `t:number`, `inMin`, `inMax`, `outMin:T`, `outMax:T`; params `mode` = linear/ease/easeIn/easeOut, `clamp` (checkbox, default on) | clamped → `linear(t, inMin, inMax, outMin, outMax)` (or `ease…`); unclamped → `outMin + (outMax - outMin) * ((t - inMin) / (inMax - inMin))` |
| `math.random` | `min`, `max`, `seed:number` (default `index`); param `timeless` | statements: `seedRandom(seed, timeless);` then `random(min, max)` |
| `math.noise` | `a:number` | `noise(a)` |

### 10.4 Vector

`vec.make2` `[x, y]` · `vec.make3` `[x, y, z]` · `vec.makeColor` `[r, g, b, a]` · `vec.split2/3/color` (one output per component: `v[0]`...) · `vec.pick` (param `index`) · `vec.broadcast` (`[n, n]` / `[n, n, n]`) · `vec.length` (`length(a, b)`; one input = magnitude) · `vec.distance`.

### 10.5 Animation

```json
{
  "id": "anim.wiggle",
  "label": "Wiggle",
  "category": "animation",
  "description": "Random wiggle of the target property, or of another property if wired.",
  "tags": ["wiggle", "random", "shake", "noise"],
  "inputs": [
    { "id": "freq", "label": "Freq /s", "type": "number", "default": 2 },
    { "id": "amp", "label": "Amount", "type": "number", "default": 50 },
    { "id": "prop", "label": "Property", "type": "property<V>", "optional": true }
  ],
  "params": [
    { "id": "octaves", "label": "Octaves", "kind": "number", "default": 1, "advanced": true },
    { "id": "ampMult", "label": "Amp multiplier", "kind": "number", "default": 0.5, "advanced": true }
  ],
  "outputs": [{
    "id": "out", "label": "Value", "type": "V",
    "expr": [
      { "when": "connected(prop)", "text": "{{in.prop}}.wiggle({{in.freq}}, {{in.amp}}, {{param.octaves}}, {{param.ampMult}})" },
      { "text": "wiggle({{in.freq}}, {{in.amp}}, {{param.octaves}}, {{param.ampMult}})" }
    ]
  }],
  "verify": "Position wiggles around its base value; changing the freq control changes speed."
}
```

```json
{
  "id": "anim.loopWiggle",
  "label": "Looping Wiggle",
  "category": "animation",
  "description": "Wiggle that seamlessly loops every N seconds.",
  "tags": ["wiggle", "loop", "seamless"],
  "inputs": [
    { "id": "freq", "label": "Freq /s", "type": "number", "default": 2 },
    { "id": "amp", "label": "Amount", "type": "number", "default": 40 },
    { "id": "loopSeconds", "label": "Loop (s)", "type": "number", "default": 3 }
  ],
  "locals": ["t"],
  "statements": [
    "const {{local.t}} = time % {{in.loopSeconds}};"
  ],
  "outputs": [{
    "id": "out", "label": "Value", "type": "V",
    "expr": "linear({{local.t}}, 0, {{in.loopSeconds}}, wiggle({{in.freq}}, {{in.amp}}, 1, 0.5, {{local.t}}), wiggle({{in.freq}}, {{in.amp}}, 1, 0.5, {{local.t}} - {{in.loopSeconds}}))"
  }],
  "source": "aereference.com (pattern); reimplemented",
  "verify": "Frame at t and t + loopSeconds are identical."
}
```

Others (same card format; Claude Code writes the JSON):

| ID | Ports / params | Template idea |
|---|---|---|
| `anim.loop` | param `mode` = cycle/pingpong/offset/continue; param `dir` = out/in/both; optional `prop:property<V>` | out → `loopOut("cycle")`; in → `loopIn("cycle")`; both → `loopIn("cycle") + loopOut("cycle") - value`. `requires.keyframes` |
| `anim.valueAtTime` | `prop:property<T>`, `t:number` | `{{prop}}.valueAtTime({{t}})` |
| `anim.delayByIndex` | `frames:number` | `{{frames}} * thisComp.frameDuration * (index - 1)` → outputs seconds. Pair with `valueAtTime(time - offset)` on a **fixed** layer. |
| `anim.posterize` | `fps:number`; `hoist: 'top'`, `hoistKey: 'posterizeTime'` | statement `posterizeTime({{in.fps}});`, no output (pass-through of a `V` value is optional) |
| `anim.wiggleRange` | `min`, `max`, `freq`; target must be `number` | `wiggle(freq, (max - min) / 2) - value + (max + min) / 2` — see §11 note |
| `anim.loopPath` | target `path`; `requires.keyframes` | cycle loop for path properties (wrap `valueAtTime(t1 + delta % span)`) |

### 10.6 Logic

`logic.compare` (`> < >= <= == !=` → boolean) · `logic.and` / `logic.or` / `logic.not` · `logic.select` (`T`; `(cond) ? a : b`) · `logic.checkboxGate` (`value * checkbox`, convenience).

### 10.7 Space and layers

| ID | Ports | Template |
|---|---|---|
| `space.toComp` | `layer` (default thisLayer), `p:vecN` | `{{layer}}.toComp({{p}})` |
| `space.fromComp` | `layer`, `p:vecN` | `{{layer}}.fromComp({{p}})` |
| `space.toWorld` / `space.fromWorld` | same | |
| `layer.sourceRect` | `layer`, `time` (default `time`); param `includeExtents` | statements: `const {{local.r}} = {{layer}}.sourceRectAtTime({{time}}, {{param.includeExtents}});`; outputs `rect`, `width`, `height`, `top`, `left`, `center` (`[r.left + r.width / 2, r.top + r.height / 2]`) |
| `layer.nameNumber` | `layer` (default thisLayer) | `parseInt({{layer}}.name, 10)` — improvement over `name[0]`, which breaks past 9 |
| `xform.ignoreParentRotation` | | `hasParent ? value - parent.transform.rotation : value` |
| `xform.ignoreParentScale` | param `chain` (walk all ancestors) | loop over `parent` chain dividing by ancestor scale; **guard divide-by-zero** |
| `xform.inheritParentOpacity` | param `editable` | `hasParent ? parent.opacity [* value / 100] : value` |
| `xform.scaleToWidth` | `w:number` | `[100 * w / thisLayer.width, 100 * w / thisLayer.width]` via a local |
| `xform.maxWidthScale` | `maxW:number`, `layer` | uses `sourceRectAtTime(time, true).width`; scales down only |
| `xform.maintainStrokeWidth` | target `shapeStrokeWidth` | `value / length(toComp([0,0]), toComp([0.7071,0.7071])) \|\| 0.001` |

### 10.8 Markers

```json
{
  "id": "marker.sinceLast",
  "label": "Time Since Marker",
  "category": "marker",
  "description": "Seconds since the most recent marker on this layer. Use to trigger animations.",
  "tags": ["marker", "trigger", "timing"],
  "inputs": [],
  "locals": ["n"],
  "statements": [
    "let {{local.n}} = 0;",
    "if (marker.numKeys > 0) {",
    "  {{local.n}} = marker.nearestKey(time).index;",
    "  if (marker.key({{local.n}}).time > time) { {{local.n}}--; }",
    "}"
  ],
  "outputs": [
    { "id": "since", "label": "Seconds", "type": "number",
      "expr": "({{local.n}} > 0 ? time - marker.key({{local.n}}).time : 0)" },
    { "id": "active", "label": "Passed any", "type": "boolean", "expr": "({{local.n}} > 0)" }
  ],
  "verify": "Before the first marker 'since' is 0 and 'active' is false."
}
```

Also `marker.current`: outputs `time`, `duration`, `comment` of the nearest-previous marker (for the marker-driven fade). AE 26 variants using `previousKey`/`nextKey` come in Phase 3.

### 10.9 Text and misc

`text.sourceText` (`layer.text.sourceText`, string) · `text.length` · `string.concat` · `util.comment` / `util.reroute` (no code) · `output` (exactly one per graph; one input of the target type).

## 11. Presets (aereference.com inspiration)

Reviewed the library at https://aereference.com/expressions (27 entries). **Treat it as inspiration, not a source to paste from:** reimplement each as nodes/templates from first principles, put `source: "aereference.com"` on derived defs, credit the site on an About screen, and check their terms before bundling any text or code verbatim.

Preset = a saved graph in `core/presets/`, loadable from a **Presets** menu. "N" = buildable from the nodes above; "NEW" = needs a node noted.

| Library entry | How to build | |
|---|---|---|
| 2D to 3D Null | `ref.layer`(3D null) → `space.toComp` with `[0,0,0]` | N |
| Auto Fade In & Out by Marker Duration | `marker.current` + `math.remap` + `logic.select` | NEW `marker.current` |
| Center Anchor Point Vertically on Text | `layer.sourceRect` + `vec.make2` + `math.op` | N |
| Control Property with Checkbox | `ref.control`(checkbox) × `ctx.value` | N |
| Control Shape Layer Position with Null | `ref.layer` → `space.toComp` → `space.fromComp` | N |
| Delay / Delay Keyframes With Slider | `anim.delayByIndex` or slider → `anim.valueAtTime(time - delay)` | N |
| Dropdown Menu Select / Show-Hide With Dropdown | `ref.control`(dropdown) == `layer.nameNumber` → `logic.select` | N |
| Frozen Random Number | `math.random` (seed = `ctx.index`, timeless) | N |
| Get Center & Scale of Comp | `ctx.compSize` × 0.5 | N |
| Get Current Date and Format | Phase 3 `date.format` node (`new Date(Date(0))`) | NEW |
| Ignore Parent Rotation / Scale (+ chained) / Inherit Parent Opacity (+ editable) | the `xform.*` nodes | NEW |
| Invert Opacity | `ref.property` → `math.remap` (flip range) | N |
| Loop a Wiggle | `anim.loopWiggle` | N |
| Loop In and Out | `anim.loop` (both) | N |
| Loop Path Keyframes | `anim.loopPath` | NEW |
| Maintain Stroke Width | `xform.maintainStrokeWidth` | NEW |
| Max Width Scale of Text Layer | `xform.maxWidthScale` or `layer.sourceRect` + `math.remap` + `logic.select` | N |
| Posterize Time + Wiggle | `anim.posterize` + `anim.wiggle` | N |
| Scale Layer to a Certain Width | `xform.scaleToWidth` | NEW |
| Trigger Expression on Marker | `marker.sinceLast` | N |
| Wiggle Between Two Values | `anim.wiggleRange` | NEW |
| Wiggle on One Dimension | `anim.wiggle` → `vec.split2` → `vec.make2` with `ctx.value` | N |

**Known problems in the library's snippets. Do not copy them blindly:**
- *Wiggle Between Two Values* uses `f` and `a`, which are never defined (the variables are `freq`/`amp`), and it doesn't subtract `value`, so the result isn't actually bounded by min/max. Our `anim.wiggleRange` subtracts `value` and adds the midpoint. **Verify in AE.**
- The *Dropdown* variants read `name[0]` / `charAt(0)`, which only handles layer names starting with a single digit. We use `parseInt(name, 10)`.
- Several snippets (e.g. *Ignore Parent Scale*) assume the parent exists. Our versions guard with `hasParent` or emit a `NEEDS_PARENT` checklist item.

**Beyond the library (Phase 3 ideas):** overshoot/bounce after keyframes, spring/elastic, text-selector stagger and typewriter (`textIndex`), counter with thousands separators, time → timecode, audio-amplitude drivers, per-character colour/style (AE 25+ `text.sourceText.style.*`), AE 26 `previousKey`/`nextKey` and dropdown `.text` nodes.

## 12. UI spec

**Layout:** top bar → Globals strip → three panes.

- **Top bar:** project name, graph tabs (Phase 2), **Target selector** ("Apply to: Position (2D) ▾" with a layer-3D toggle), Presets menu, Import/Export, Settings.
- **Globals strip (collapsible):** chips grouped as *CTRLS* (pinned, always first, rename-able but not deletable), *Layers*, *Controls* (icon by type), *Comps*. Click a chip to edit; `+` to add. Controls show their host. Warn on duplicate names/keys.
- **Left, palette:** searchable node list by category; click or drag to add. **`Tab` (or double-click canvas) opens a quick-add search at the cursor.** Disabled nodes explain why on hover.
- **Centre, canvas (React Flow):** typed, colour-coded and shape-coded ports (don't rely on colour alone). Unconnected inputs show inline widgets. Hover a port to see its type. Dropping a bad connection shows the reason and the converter quick-fix. Mini-map and fit-to-view.
- **Right, inspector + output:**
  - **Output pane:** live-compiled code, syntax highlighted, **Copy** button (`Ctrl/Cmd+Shift+C`), "Copy clean" option, line numbers.
  - **Diagnostics list:** click a diagnostic to select the offending node.
  - **Setup checklist:** per-item tick boxes (UI-only convenience).
- **Phase 2:** selecting a node highlights its lines in the output pane and vice versa (source map).
- **Persistence:** autosave to IndexedDB; export/import `.aenodes.json`; undo/redo (graph and globals share one history).
- Dark theme by default, keyboard-navigable palette, respect `prefers-reduced-motion`.

## 13. Testing

Claude Code **cannot run After Effects**, so correctness is layered:

1. **Template tests:** each `NodeDef` has a golden-output test with default inputs (`tests/nodes/`).
2. **Syntax validity:** compile every preset and a **property-based/fuzz set of random valid graphs**, wrap in `function(){ ... }`, and parse with `acorn`. Must always parse.
3. **Compiler tests:** topo order determinism, cycle detection, naming collisions with reserved words, string escaping (quotes and unicode in layer names), hoisting rules, generic resolution, converter suggestions.
4. **Round trip:** `graph → code → decode payload → graph` is deep-equal; tampered body triggers the hash warning.
5. **Mock AE runtime (Phase 2):** small JS implementation of `linear`, `ease`, `clamp`, `random`/`seedRandom`, `length`, etc. so pure-numeric graphs can be **evaluated** in tests and checked numerically (e.g. remap endpoints, loop seam equality).
6. **`docs/ae-verification.md` (generated from each node's `verify` string):** a checklist Ed can run in real AE for each node: *apply this preset, expect that behaviour*. Anything flagged "verify in AE" in this spec must be ticked before a release.

CI: typecheck, lint, vitest on every push.

## 14. Phases and acceptance criteria

**Phase 0: skeleton.** Repo, zod schemas, types, `compile()` with `ctx.value`, `ref.control`, `anim.wiggle`, `output`; golden test from §7.4. *Done when* the golden test passes and `compile` has no React imports.

**Phase 1: MVP.**
- Globals panel (CTRLS pinned, layers, controls, comps), target selector, typed ports + converter quick-fix.
- ~25 nodes from §10 (context, refs, math, vector, wiggle, loop, valueAtTime, sourceRect, select/compare, marker.sinceLast, output).
- Live output pane, copy button, diagnostics + setup checklist, autosave, export/import JSON.
- *Done when* presets for **Loop a Wiggle, Control Property with Checkbox, Wiggle on One Dimension, Trigger Expression on Marker, Center Anchor Point on Text** build as graphs, compile to golden outputs, and pass the acorn parse test.

**Phase 2: round trip and polish.** Embedded payload + paste-back + hash warning; source-map highlighting; inlining pass; multi-graph tabs; text-animator targets and nodes; mock AE runtime tests; `ae-verification.md` generation; palette quick-add.

**Phase 3: library and extensibility.** Remaining presets from §11 + Presets menu; **user-defined nodes** (JSON editor with live validation, stored in the project); **sub-graph macros** (select nodes → "make node"); AE 26 nodes; `date.format`; optional **ExtendScript setup generator** that emits a `.jsx` to create the `CTRLS` null and all required controls from Globals; scalar **curve preview** using the mock runtime.

**Later:** companion AE panel that applies expressions directly (`prop.expression = ...`) from the tool.

## 15. Open questions for Ed

1. **Name** for the tool?
2. **Target AE version.** Assumed 26 with JS engine; should anything older be supported (affects gating)?
3. **Comments in output:** default `minimal` (one comment per block). Prefer `verbose` or `none`?
4. **`CTRLS` name:** pinned as `CTRLS` by default but renameable. Fine, or should it be fixed?
5. **Hosting:** static web app assumed. Any reason to want a desktop wrapper?
6. **Attribution:** happy to credit aereference.com on an About screen? Worth contacting the author before shipping their patterns as presets?
