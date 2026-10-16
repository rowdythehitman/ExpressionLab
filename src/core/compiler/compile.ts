// Compiler pipeline entry point (spec §7). Graph in, string + diagnostics out.
import { PROPERTIES, TARGETS } from '../catalog';
import { CONTROLS } from '../catalog/controls';
import { NODE_DEFS } from '../nodes';
import { projectSchema } from '../schema';
import { paramValue, resolveTypes, type Incoming, type NodeTypes } from '../typing/resolve';
import type {
  CompileResult, ControlGlobal, Edge, Literal, NodeDef, NodeInstance, Project, Settings, SourceMap,
} from '../types';
import { DiagnosticBag } from './diagnostics';
import { camelCase, identifierFor, isValidIdentifier, NameAllocator } from './naming';
import { pickBranch, render, type TemplateScope } from './template';
import { topoSort } from './topo';

export const APP_NAME = 'ExpressionLab';

export interface CompileOptions {
  /** Override the node library (tests, user-defined nodes later). */
  nodeDefs?: ReadonlyMap<string, NodeDef>;
  /**
   * Output Preview instrumentation (never used for the copied code):
   * - overrides: "nodeId:port" outputs replaced by `__in("nodeId:port")`
   * - probes: node ids whose outputs are reported via `__probe("nodeId:port", value)` before the result
   */
  preview?: { overrides?: ReadonlySet<string>; probes?: ReadonlySet<string> };
}

export function compile(input: Project | unknown, graphId: string, opts: CompileOptions = {}): CompileResult {
  const diag = new DiagnosticBag();
  const result = (code = '', sourceMap: SourceMap = {}, variables: Record<string, string[]> = {}): CompileResult => ({
    code: diag.hasErrors ? '' : code,
    diagnostics: diag.items,
    checklist: diag.checklist,
    sourceMap: diag.hasErrors ? {} : sourceMap,
    variables: diag.hasErrors ? {} : variables,
  });

  // ---- 1. Validate structure ----
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      diag.add('INVALID_PROJECT', `${issue.path.join('.') || 'project'}: ${issue.message}`);
    }
    return result();
  }
  const project = parsed.data as Project;
  const graph = project.graphs.find((g) => g.id === graphId);
  if (!graph) {
    diag.add('INVALID_PROJECT', `No graph with id "${graphId}"`);
    return result();
  }
  const target = TARGETS.get(graph.target.id);
  const valueType = target?.valueType ?? graph.target.valueType;
  if (!target || !valueType) {
    diag.add('INVALID_PROJECT', target ? `Target "${target.label}" needs a value type` : `Unknown target "${graph.target.id}"`);
    return result();
  }

  const defsLib = opts.nodeDefs ?? NODE_DEFS;
  const defs = new Map<string, NodeDef>();
  const seen = new Set<string>();
  for (const n of graph.nodes) {
    if (seen.has(n.id)) diag.add('DUPLICATE_ID', `Duplicate node id "${n.id}"`, { nodeId: n.id });
    seen.add(n.id);
    const def = defsLib.get(n.type);
    if (def) defs.set(n.id, def);
    else diag.add('UNKNOWN_NODE_TYPE', `Unknown node type "${n.type}"`, { nodeId: n.id });
  }
  const edgeIds = new Set<string>();
  const incoming: Incoming = new Map();
  for (const e of graph.edges) {
    if (edgeIds.has(e.id)) diag.add('DUPLICATE_ID', `Duplicate edge id "${e.id}"`, { edgeId: e.id });
    edgeIds.add(e.id);
    const fromDef = defs.get(e.from.node);
    const toDef = defs.get(e.to.node);
    if (!fromDef?.outputs.some((o) => o.id === e.from.port) || !toDef?.inputs.some((p) => p.id === e.to.port)) {
      diag.add('DANGLING_EDGE', `Edge "${e.id}" points at a missing node or port`, { edgeId: e.id });
      continue;
    }
    const ins = incoming.get(e.to.node) ?? new Map<string, Edge>();
    if (ins.has(e.to.port)) {
      diag.add('DANGLING_EDGE', `Input "${e.to.port}" has more than one connection`, { edgeId: e.id, nodeId: e.to.node });
    }
    ins.set(e.to.port, e);
    incoming.set(e.to.node, ins);
  }
  if (diag.hasErrors) return result();

  const edges = [...incoming.values()].flatMap((m) => [...m.values()]);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const def = (n: NodeInstance) => defs.get(n.id)!;
  const edgeInto = (n: NodeInstance, port: string) => incoming.get(n.id)?.get(port);
  const controlFor = (n: NodeInstance): ControlGlobal | undefined =>
    def(n).special === 'ref.control' ? project.globals.controls.find((c) => c.id === n.ref?.controlId) : undefined;
  const labelOf = (n: NodeInstance) => n.name || controlFor(n)?.effectName || def(n).label;

  const outputNodes = graph.nodes.filter((n) => def(n).special === 'output');
  if (outputNodes.length === 0) diag.add('NO_OUTPUT', 'The graph has no Output node');
  for (const extra of outputNodes.slice(1)) {
    diag.add('MULTIPLE_OUTPUTS', 'A graph can only have one Output node', { nodeId: extra.id });
  }

  // ---- 4. Topological sort (needed before type resolution) ----
  const { order, cycle } = topoSort(graph.nodes, edges);
  if (cycle.length) {
    const names = cycle.map((id) => labelOf(nodeById.get(id)!)).join(', ');
    diag.add('CYCLE', `The graph has a cycle involving: ${names}`, { nodeId: cycle[0] });
    return result();
  }

  // ---- 2. Resolve types ----
  const { types, issues } = resolveTypes(order, incoming, { defs: defsLib, globals: project.globals, valueType });
  for (const i of issues) diag.add(i.code, i.message, { nodeId: i.nodeId, edgeId: i.edgeId });
  const typesOf = (n: NodeInstance): NodeTypes => types.get(n.id)!;
  if (outputNodes.length !== 1) return result();
  const outputNode = outputNodes[0]!;

  // ---- 3. Prune: keep what reaches the output, plus hoisted global modifiers ----
  const upstreamOf = (roots: NodeInstance[]) => {
    const reach = new Set<string>();
    const stack = roots.map((r) => r.id);
    while (stack.length) {
      const id = stack.pop()!;
      if (reach.has(id)) continue;
      reach.add(id);
      for (const e of incoming.get(id)?.values() ?? []) stack.push(e.from.node);
    }
    return reach;
  };
  const reached = upstreamOf([outputNode, ...order.filter((n) => def(n).hoist)]);
  for (const n of order) {
    if (!reached.has(n.id)) diag.add('UNUSED_NODE', `${labelOf(n)} is not connected to the output`, { nodeId: n.id });
  }
  const live = order.filter((n) => reached.has(n.id));

  // ---- Hoisting rules (§7.6) ----
  const hoisted: NodeInstance[] = [];
  const hoistKeys = new Set<string>();
  for (const n of live.filter((n) => def(n).hoist)) {
    const key = def(n).hoistKey ?? def(n).id;
    if (hoistKeys.has(key)) {
      diag.add('HOIST_DUPLICATE', `Only one ${def(n).label} node is allowed per expression`, { nodeId: n.id });
      continue;
    }
    hoistKeys.add(key);
    hoisted.push(n);
    for (const id of upstreamOf([n])) {
      const u = nodeById.get(id)!;
      if (u !== n && !isPure(def(u))) {
        diag.add('HOIST_IMPURE_UPSTREAM', `${def(n).label} can only take controls, literals and context values, not ${labelOf(u)}`, { nodeId: n.id });
      }
    }
  }

  // ---- 5. Context check, inputs, requirements ----
  diag.check('apply-to', `Apply to: ${target.applyTo}`);
  for (const n of live) {
    const d = def(n);
    if (d.contexts && !d.contexts.some((c) => target.contexts.includes(c))) {
      diag.add('CONTEXT_UNAVAILABLE', `${d.label} only works on: ${d.contexts.join(', ')}`, { nodeId: n.id });
    }
    if (d.contexts?.includes('textSelectorAmount')) {
      diag.check('based-on', 'Check the Expression Selector\'s "Based On" setting (characters, words or lines)');
    }
    if (d.requires?.minAE && d.requires.minAE > project.settings.aeTarget) {
      diag.add('MIN_AE_VERSION', `${d.label} needs After Effects ${d.requires.minAE}+`, { nodeId: n.id });
    }
    if (d.requires?.keyframes) {
      diag.add('NEEDS_KEYFRAMES', `${d.label} needs keyframes on the property`, { nodeId: n.id });
      diag.check('keyframes', `Property needs keyframes (${d.label})`);
    }
    if (d.requires?.parent) {
      diag.add('NEEDS_PARENT', `${d.label} needs the layer to have a parent`, { nodeId: n.id });
      diag.check('parent', 'Layer needs a parent');
    }
    for (const port of d.inputs) {
      if (!edgeInto(n, port.id) && n.inputs[port.id] === undefined && port.default === undefined && !port.optional) {
        diag.add('MISSING_INPUT', `${labelOf(n)} › ${port.label} needs a connection`, { nodeId: n.id });
      }
    }
  }

  // ---- Globals used → preamble + checklist ----
  const names = new NameAllocator();
  const { globals } = project;
  const liveControls = live.map(controlFor).filter((c): c is ControlGlobal => !!c);
  const usedLayerIds = new Set<string>();
  for (const n of live) {
    if (def(n).special !== 'ref.layer') continue;
    if (n.ref?.layerId) usedLayerIds.add(n.ref.layerId);
    else diag.add('GLOBAL_NOT_FOUND', 'Pick a layer from Globals', { nodeId: n.id });
  }
  for (const c of liveControls) if (typeof c.host === 'object') usedLayerIds.add(c.host.layerId);

  const preamble: string[] = [];
  let ctrlsVar = '';
  if (liveControls.some((c) => c.host === 'ctrls')) {
    ctrlsVar = names.allocate(identifierFor(globals.ctrls.layerName));
    preamble.push(`const ${ctrlsVar} = thisComp.layer(${JSON.stringify(globals.ctrls.layerName)});`);
    diag.check('ctrls', `Layer '${globals.ctrls.layerName}' must exist (a Null is ideal)`);
  }
  const layerVars = new Map<string, string>();
  for (const layer of globals.layers.filter((l) => usedLayerIds.has(l.id))) {
    if (!isValidIdentifier(layer.key)) {
      diag.add('RESERVED_NAME', `Layer key "${layer.key}" is not a usable variable name (try "${camelCase(layer.layerName)}Layer")`);
    }
    const v = names.allocate(isValidIdentifier(layer.key) ? layer.key : camelCase(layer.layerName) + 'Layer');
    layerVars.set(layer.id, v);
    preamble.push(`const ${v} = thisComp.layer(${JSON.stringify(layer.layerName)});`);
    diag.check(`layer:${layer.id}`, `Layer '${layer.layerName}' must exist${layer.kind === 'text' ? ' and be a text layer' : ''}`);
  }
  for (const id of usedLayerIds) {
    if (!layerVars.has(id)) diag.add('GLOBAL_NOT_FOUND', `Layer "${id}" is not defined in Globals`);
  }
  for (const c of liveControls) {
    const host = c.host === 'ctrls' ? `'${globals.ctrls.layerName}'`
      : c.host === 'thisLayer' ? 'this layer'
      : `'${globals.layers.find((l) => typeof c.host === 'object' && l.id === c.host.layerId)?.layerName ?? '?'}'`;
    diag.check(`control:${c.id}`, `Add ${CONTROLS[c.type].label} '${c.effectName}' to ${host}`);
  }
  if (diag.hasErrors) return result();

  // ---- 6. Name variables, in emission order ----
  const hoistSection: NodeInstance[] = [];
  const placed = new Set<string>();
  for (const h of hoisted) {
    const ups = upstreamOf([h]);
    for (const n of live) {
      if (ups.has(n.id) && !placed.has(n.id)) {
        placed.add(n.id);
        hoistSection.push(n);
      }
    }
  }
  const restSection = live.filter((n) => !placed.has(n.id) && def(n).special !== 'output');

  // Inlining pass (Phase 2, opt-in): fold single-use, side-effect-free nodes into their consumer.
  const consumerOf = new Map<string, string>();
  const useCount = new Map<string, number>();
  for (const e of edges) {
    if (!reached.has(e.to.node)) continue;
    useCount.set(e.from.node, (useCount.get(e.from.node) ?? 0) + 1);
    consumerOf.set(e.from.node, e.to.node);
  }
  const folded = new Set<string>();
  if (project.settings.inlineSingleUse) {
    for (const n of restSection) {
      const d = def(n);
      const foldable = !isInlineDef(d) && !d.statements?.length && !d.locals?.length && !d.hoist
        && !d.noInline && d.special !== 'ref.control';
      if (foldable && useCount.get(n.id) === 1) folded.add(n.id);
    }
  }
  const isInline = (n: NodeInstance) => isInlineDef(def(n)) || folded.has(n.id);

  const usedOutputs = new Map<string, string[]>();
  for (const e of edges) {
    if (!reached.has(e.to.node)) continue;
    const list = usedOutputs.get(e.from.node) ?? [];
    if (!list.includes(e.from.port)) list.push(e.from.port);
    usedOutputs.set(e.from.node, list);
  }
  const varNames = new Map<string, Map<string, string>>();
  const localNames = new Map<string, Map<string, string>>();
  for (const n of [...hoistSection, ...restSection]) {
    if (isInline(n)) continue;
    const d = def(n);
    const used = d.outputs.filter((o) => usedOutputs.get(n.id)?.includes(o.id)).map((o) => o.id);
    const multi = d.outputs.length > 1;
    const derived = (b: string) => [
      ...used.map((o) => (multi ? b + o[0]!.toUpperCase() + o.slice(1) : b)),
      ...(d.locals ?? []).map((l) => `${b}_${l}`),
    ];
    const base = names.allocate(camelCase(labelOf(n)), derived);
    varNames.set(n.id, new Map(used.map((o, i) => [o, derived(base)[i]!])));
    localNames.set(n.id, new Map((d.locals ?? []).map((l) => [l, `${base}_${l}`])));
  }

  // ---- 7. Emit ----
  const exprOf = (nodeId: string, port: string): string => {
    const n = nodeById.get(nodeId)!;
    if (!isInline(n)) return varNames.get(nodeId)!.get(port)!;
    return renderOutput(n, port);
  };
  const scopeFor = (n: NodeInstance): TemplateScope => {
    const d = def(n);
    const t = typesOf(n);
    return {
      connected: (id) => !!edgeInto(n, id),
      param: (id) => paramValue(n, d, id),
      type: (name) => t.bindings[name] ?? t.inputs.get(name),
      input: (id) => {
        const e = edgeInto(n, id);
        if (e) return exprOf(e.from.node, e.from.port);
        const port = d.inputs.find((p) => p.id === id);
        const v = n.inputs[id] ?? port?.default;
        return port && v !== undefined ? formatLiteral(v, t.inputs.get(id) ?? port.type) : undefined;
      },
      paramText: (id) => {
        const p = d.params?.find((x) => x.id === id);
        const v = paramValue(n, d, id) as Literal | undefined;
        if (!p || v === undefined) return undefined;
        return p.emit === 'string' ? JSON.stringify(String(v)) : formatLiteral(v, 'raw');
      },
      local: (id) => localNames.get(n.id)?.get(id),
      ref: (id) => (id === 'path' ? PROPERTIES.get(n.ref?.propertyPath ?? '')?.path : undefined),
    };
  };
  const renderTpl = (n: NodeInstance, text: string) => {
    const r = render(text, scopeFor(n));
    for (const u of r.unresolved) {
      diag.add('UNRESOLVED_PLACEHOLDER', `${def(n).label}: cannot resolve ${u}`, { nodeId: n.id });
    }
    return r.text;
  };
  const renderOutput = (n: NodeInstance, port: string): string => {
    const d = def(n);
    const key = `${n.id}:${port}`;
    if (opts.preview?.overrides?.has(key)) return `__in(${JSON.stringify(key)})`;
    if (d.special === 'ref.control') return controlExpr(controlFor(n)!, ctrlsVar, layerVars, project.settings);
    if (d.special === 'ref.layer') return layerVars.get(n.ref!.layerId!)!;
    const o = d.outputs.find((x) => x.id === port)!;
    return renderTpl(n, pickBranch(o.expr, scopeFor(n)));
  };

  const { comments } = project.settings;
  const lines: string[] = [];
  const sourceMap: SourceMap = {};
  if (comments !== 'none') lines.push(`// ${APP_NAME} · ${target.label}`);
  lines.push(...preamble);
  if (preamble.length) lines.push('');

  const emitNode = (n: NodeInstance) => {
    if (isInline(n)) return;
    const d = def(n);
    const start = lines.length + 1;
    const vars = [...varNames.get(n.id)!];
    if (comments === 'verbose' || (comments === 'minimal' && vars.length)) lines.push(`// ${labelOf(n)}`);
    for (const s of d.statements ?? []) lines.push(renderTpl(n, pickBranch(s, scopeFor(n))));
    for (const [port, v] of vars) lines.push(`const ${v} = ${renderOutput(n, port)};`);
    sourceMap[n.id] = [start, lines.length];
  };
  hoistSection.forEach(emitNode);
  if (hoistSection.some((n) => !isInline(n))) lines.push('');
  restSection.forEach(emitNode);
  if (restSection.some((n) => !isInline(n))) lines.push('');

  // Preview probes: report each probed node's outputs just before the result.
  for (const id of opts.preview?.probes ?? []) {
    const n = nodeById.get(id);
    if (!n || !reached.has(id) || def(n).special === 'output') continue;
    for (const o of def(n).outputs) {
      const v = varNames.get(id)?.get(o.id) ?? renderOutput(n, o.id);
      lines.push(`__probe(${JSON.stringify(`${id}:${o.id}`)}, ${v});`);
    }
  }

  const final = edgeInto(outputNode, 'in');
  lines.push(final ? exprOf(final.from.node, final.from.port) : '');
  sourceMap[outputNode.id] = [lines.length, lines.length];
  // Folded nodes live inside their consumer's code.
  for (const id of folded) {
    let c = consumerOf.get(id);
    while (c && !sourceMap[c]) c = consumerOf.get(c);
    if (c) sourceMap[id] = sourceMap[c]!;
  }

  const variables: Record<string, string[]> = {};
  for (const n of live) variables[n.id] = [...(varNames.get(n.id)?.values() ?? [])];
  return result(lines.join('\n'), sourceMap, variables);
}

/** Nodes whose expression is substituted directly where used instead of getting a `const`. */
function isInlineDef(d: NodeDef): boolean {
  if (d.statements?.length || d.locals?.length || d.hoist) return false;
  return d.category === 'context' || d.special === 'literal' || d.special === 'ref.layer' || !!d.inline;
}

/** Hoisted nodes may only depend on values that are the same wherever they are evaluated. */
function isPure(d: NodeDef): boolean {
  if (d.statements?.length) return false;
  return d.category === 'context' || d.special === 'literal' || d.special === 'ref.control' || d.special === 'ref.layer';
}

const DIMS: Record<string, number> = { vec2: 2, vec3: 3, color: 4 };

/**
 * Literal → JS source for a port of the given (resolved) type.
 * - string ports: JSON-escaped text
 * - other ports: strings are raw code (e.g. a default of `index` or `time`)
 * - a number on a vector port is broadcast ([n, n]), since the widget shows one value until edited
 */
export function formatLiteral(v: Literal, type: string): string {
  if (type === 'string') return JSON.stringify(String(v));
  if (Array.isArray(v)) return `[${v.join(', ')}]`;
  if (typeof v === 'number' && DIMS[type]) return `[${Array(DIMS[type]).fill(v).join(', ')}]`;
  return String(v);
}

function controlExpr(c: ControlGlobal, ctrlsVar: string, layerVars: Map<string, string>, settings: Settings): string {
  const info = CONTROLS[c.type];
  const param = JSON.stringify(settings.useMatchNames ? info.matchName : info.paramName);
  const host = c.host === 'ctrls' ? `${ctrlsVar}.` : c.host === 'thisLayer' ? '' : `${layerVars.get(c.host.layerId)}.`;
  return `${host}effect(${JSON.stringify(c.effectName)})(${param})`;
}
