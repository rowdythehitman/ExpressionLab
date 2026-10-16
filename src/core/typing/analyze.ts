// Graph-level type analysis for the UI: port types, and whether a new connection is allowed.
import { TARGETS } from '../catalog';
import { nodeLibrary } from '../library';
import { expandMacros, hasMacros } from '../macro';
import { topoSort } from '../compiler/topo';
import type { Edge, Graph, NodeDef, Project, ValueType } from '../types';
import { suggestConverter, type ConverterFix } from './converters';
import { resolveTypes, type Incoming, type NodeTypes, type TypeIssue } from './resolve';

export function targetValueType(graph: Graph): ValueType {
  return TARGETS.get(graph.target.id)?.valueType ?? graph.target.valueType ?? 'number';
}

function incomingOf(graph: Graph, defs: ReadonlyMap<string, NodeDef>): Incoming {
  const ids = new Map(graph.nodes.map((n) => [n.id, defs.get(n.type)]));
  const incoming: Incoming = new Map();
  for (const e of graph.edges) {
    const from = ids.get(e.from.node);
    const to = ids.get(e.to.node);
    if (!from?.outputs.some((o) => o.id === e.from.port) || !to?.inputs.some((p) => p.id === e.to.port)) continue;
    const m = incoming.get(e.to.node) ?? new Map<string, Edge>();
    m.set(e.to.port, e);
    incoming.set(e.to.node, m);
  }
  return incoming;
}

export interface GraphAnalysis {
  types: Map<string, NodeTypes>;
  issues: TypeIssue[];
}

export function analyzeGraph(project: Project, graph: Graph, defs: ReadonlyMap<string, NodeDef> = nodeLibrary(project)): GraphAnalysis {
  if (!hasMacros(graph, defs)) return analyzeFlat(project, graph, defs);
  // Analyse the expanded graph, then report each macro instance's ports from the inner ports they map to.
  const exp = expandMacros(graph, defs);
  const flat = analyzeFlat(project, exp.graph, defs);
  const types = new Map(flat.types);
  const typeOf = (key: string, side: 'inputs' | 'outputs') => {
    const i = key.lastIndexOf(':');
    return flat.types.get(key.slice(0, i))?.[side].get(key.slice(i + 1));
  };
  for (const n of graph.nodes) {
    const d = defs.get(n.type);
    if (!d?.macro) continue;
    const inputs = new Map<string, string>();
    for (const p of d.inputs) {
      const first = exp.inputs.get(`${n.id}:${p.id}`)?.[0];
      inputs.set(p.id, (first && typeOf(first, 'inputs')) ?? p.type);
    }
    const outputs = new Map<string, string>();
    for (const o of d.outputs) {
      const inner = exp.outputs.get(`${n.id}:${o.id}`);
      outputs.set(o.id, (inner && typeOf(inner, 'outputs')) ?? o.type);
    }
    types.set(n.id, { bindings: {}, inputs, outputs });
  }
  const issues = flat.issues.map((i) => ({
    ...i,
    nodeId: exp.origin.get(i.nodeId) ?? i.nodeId,
    edgeId: i.edgeId?.includes('/') ? undefined : i.edgeId?.split('>')[0],
  }));
  return { types, issues };
}

function analyzeFlat(project: Project, graph: Graph, defs: ReadonlyMap<string, NodeDef>): GraphAnalysis {
  const incoming = incomingOf(graph, defs);
  const edges = [...incoming.values()].flatMap((m) => [...m.values()]);
  const { order, cycle } = topoSort(graph.nodes, edges);
  // Nodes stuck in a cycle still get best-effort types so the canvas can draw them.
  const all = [...order, ...graph.nodes.filter((n) => cycle.includes(n.id))];
  return resolveTypes(all, incoming, { defs, globals: project.globals, valueType: targetValueType(graph) });
}

export type ConnectionCheck =
  | { ok: true }
  | { ok: false; reason: string; fix?: ConverterFix };

export function checkConnection(
  project: Project,
  graph: Graph,
  from: { node: string; port: string },
  to: { node: string; port: string },
  defs: ReadonlyMap<string, NodeDef> = nodeLibrary(project),
): ConnectionCheck {
  if (from.node === to.node) return { ok: false, reason: "A node can't connect to itself" };
  // Would this edge close a loop? (Is `from` downstream of `to`?)
  const down = new Map<string, string[]>();
  for (const e of graph.edges) down.set(e.from.node, [...(down.get(e.from.node) ?? []), e.to.node]);
  const stack = [to.node];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === from.node) return { ok: false, reason: 'That would create a loop. Expressions are evaluated once per frame, so the graph must flow one way' };
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(down.get(id) ?? []));
  }
  const edge: Edge = { id: '__candidate__', from, to };
  const trial: Graph = {
    ...graph,
    edges: [...graph.edges.filter((e) => !(e.to.node === to.node && e.to.port === to.port)), edge],
  };
  const { issues } = analyzeGraph(project, trial, defs);
  const issue = issues.find((i) => i.edgeId === edge.id || i.edgeId?.startsWith(`${edge.id}>`));
  if (!issue) return { ok: true };
  const fix = issue.actual && issue.expected ? suggestConverter(issue.actual, issue.expected) : undefined;
  return { ok: false, reason: `Expected ${issue.expected}, got ${issue.actual}`, fix };
}
