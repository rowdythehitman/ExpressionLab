// Sub-graph macros: a macro NodeDef stores a sub-graph. Graphs are flattened (macros expanded) before
// compiling and type analysis; results map back to the macro instance.
import type { Edge, Graph, NodeDef, NodeInstance, Project } from './types';
import { camelCase } from './compiler/naming';

const MAX_DEPTH = 8;

export interface Expansion {
  graph: Graph;
  /** inner (flattened) node id → the top-level node it came from. Non-macro nodes map to themselves. */
  origin: Map<string, string>;
  /** "instanceId:outputPort" → "innerId:innerPort" for every macro output. */
  outputs: Map<string, string>;
  /** "instanceId:inputPort" → inner input ports it feeds. */
  inputs: Map<string, string[]>;
  /** Macros that couldn't expand (unknown, recursive or too deep), by instance id. */
  errors: Map<string, string>;
}

export function hasMacros(graph: Graph, defs: ReadonlyMap<string, NodeDef>): boolean {
  return graph.nodes.some((n) => defs.get(n.type)?.macro);
}

export function expandMacros(graph: Graph, defs: ReadonlyMap<string, NodeDef>): Expansion {
  const origin = new Map(graph.nodes.map((n) => [n.id, n.id]));
  const outputs = new Map<string, string>();
  const inputs = new Map<string, string[]>();
  const errors = new Map<string, string>();
  let nodes = graph.nodes;
  let edges = graph.edges;

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const macroNodes = nodes.filter((n) => defs.get(n.type)?.macro && !errors.has(origin.get(n.id)!));
    if (!macroNodes.length) break;
    const nextNodes: NodeInstance[] = nodes.filter((n) => !macroNodes.includes(n));
    let nextEdges: Edge[] = edges;
    for (const m of macroNodes) {
      const def = defs.get(m.type)!;
      const body = def.macro!;
      const top = origin.get(m.id)!;
      if (body.nodes.some((x) => x.type === m.type)) {
        errors.set(top, `${def.label} contains itself`);
        nextNodes.push(m);
        continue;
      }
      const inner = (id: string) => `${m.id}/${id}`;
      const title = m.name || def.label;
      for (const x of body.nodes) {
        const xd = defs.get(x.type);
        // Inner variables read "<macro> <node>" so they're traceable; controls keep their effect name instead.
        const name = xd?.special === 'ref.control' && !x.name ? undefined : `${title} ${x.name || xd?.label || x.type}`;
        nextNodes.push({
          ...x,
          id: inner(x.id),
          name,
          inputs: { ...x.inputs },
          params: { ...x.params },
        });
        origin.set(inner(x.id), top);
      }
      // Unconnected macro inputs: the instance's literal value goes onto every inner target.
      for (const mi of body.inputs) {
        const fed = edges.some((e) => e.to.node === m.id && e.to.port === mi.id);
        const lit = m.inputs[mi.id];
        if (!fed && lit !== undefined) {
          for (const t of mi.targets) nextNodes.find((x) => x.id === inner(t.node))!.inputs[t.port] = lit;
        }
        inputs.set(`${m.id}:${mi.id}`, mi.targets.map((t) => `${inner(t.node)}:${t.port}`));
      }
      for (const mo of body.outputs) outputs.set(`${m.id}:${mo.id}`, `${inner(mo.node)}:${mo.port}`);
      const rewired: Edge[] = [];
      for (const e of nextEdges) {
        if (e.to.node === m.id) {
          const mi = body.inputs.find((x) => x.id === e.to.port);
          for (const t of mi?.targets ?? []) rewired.push({ id: `${e.id}>${t.node}.${t.port}`, from: e.from, to: { node: inner(t.node), port: t.port } });
        } else if (e.from.node === m.id) {
          const mo = body.outputs.find((x) => x.id === e.from.port);
          if (mo) rewired.push({ ...e, from: { node: inner(mo.node), port: mo.port } });
        } else rewired.push(e);
      }
      for (const e of body.edges) {
        rewired.push({ id: `${m.id}/${e.id}`, from: { node: inner(e.from.node), port: e.from.port }, to: { node: inner(e.to.node), port: e.to.port } });
      }
      nextEdges = rewired;
    }
    nodes = nextNodes;
    edges = nextEdges;
    if (depth === MAX_DEPTH - 1 && nodes.some((n) => defs.get(n.type)?.macro)) {
      for (const n of nodes) if (defs.get(n.type)?.macro) errors.set(origin.get(n.id)!, 'Macros are nested too deeply');
    }
  }

  // Resolve chains through nested macros, keeping only keys for top-level instances.
  const finalIds = new Set(nodes.map((n) => n.id));
  const topIds = new Set(graph.nodes.map((n) => n.id));
  const resolveOut = (k: string): string => {
    for (let i = 0; i < MAX_DEPTH && !finalIds.has(splitKey(k)[0]) && outputs.has(k); i++) k = outputs.get(k)!;
    return k;
  };
  const resolveIn = (k: string, depth = 0): string[] =>
    finalIds.has(splitKey(k)[0]) || depth > MAX_DEPTH || !inputs.has(k) ? [k] : inputs.get(k)!.flatMap((x) => resolveIn(x, depth + 1));
  for (const k of [...outputs.keys()]) {
    if (topIds.has(splitKey(k)[0])) outputs.set(k, resolveOut(outputs.get(k)!));
    else outputs.delete(k);
  }
  for (const k of [...inputs.keys()]) {
    if (topIds.has(splitKey(k)[0])) inputs.set(k, inputs.get(k)!.flatMap((x) => resolveIn(x)));
    else inputs.delete(k);
  }

  return { graph: { ...graph, nodes, edges }, origin, outputs, inputs, errors };
}

function splitKey(k: string): [string, string] {
  const i = k.lastIndexOf(':');
  return [k.slice(0, i), k.slice(i + 1)];
}

export interface MakeMacroResult {
  def: NodeDef;
  /** The graph with the selection replaced by one macro instance. */
  graph: Graph;
  instanceId: string;
}

/**
 * Turns the selected nodes into a macro. Wires coming in from outside become macro inputs (one per distinct
 * upstream output); wires going out become macro outputs (one per distinct inner output). `portTypes` gives the
 * resolved type of each inner port ("node:port" → type) so the macro's ports are concrete.
 */
export function makeMacro(
  project: Project,
  graph: Graph,
  selected: string[],
  name: string,
  defs: ReadonlyMap<string, NodeDef>,
  portTypes: (nodeId: string, port: string, side: 'in' | 'out') => string,
  newId: (prefix: string) => string,
): MakeMacroResult | { error: string } {
  const sel = new Set(selected.filter((id) => defs.get(graph.nodes.find((n) => n.id === id)?.type ?? '')?.special !== 'output'));
  if (sel.size < 1) return { error: 'Select the nodes to turn into a macro (Output can’t be included).' };
  const inside = graph.nodes.filter((n) => sel.has(n.id));
  const innerEdges = graph.edges.filter((e) => sel.has(e.from.node) && sel.has(e.to.node));
  const incoming = graph.edges.filter((e) => !sel.has(e.from.node) && sel.has(e.to.node));
  const outgoing = graph.edges.filter((e) => sel.has(e.from.node) && !sel.has(e.to.node));
  if (!outgoing.length) return { error: 'The selection has to feed something outside it (otherwise the macro has no output).' };

  const label = (nodeId: string, port: string, side: 'in' | 'out') => {
    const n = graph.nodes.find((x) => x.id === nodeId)!;
    const d = defs.get(n.type);
    const p = side === 'in' ? d?.inputs.find((x) => x.id === port) : d?.outputs.find((x) => x.id === port);
    return p?.label ?? port;
  };

  // One macro input per distinct upstream source.
  const inGroups = new Map<string, Edge[]>();
  for (const e of incoming) {
    const k = `${e.from.node}:${e.from.port}`;
    inGroups.set(k, [...(inGroups.get(k) ?? []), e]);
  }
  const macroInputs = [...inGroups.values()].map((es, i) => ({
    id: `in${i + 1}`,
    label: label(es[0]!.to.node, es[0]!.to.port, 'in'),
    type: portTypes(es[0]!.to.node, es[0]!.to.port, 'in'),
    targets: es.map((e) => ({ node: e.to.node, port: e.to.port })),
    source: es[0]!.from,
  }));
  const outGroups = new Map<string, Edge[]>();
  for (const e of outgoing) {
    const k = `${e.from.node}:${e.from.port}`;
    outGroups.set(k, [...(outGroups.get(k) ?? []), e]);
  }
  const macroOutputs = [...outGroups.values()].map((es, i) => ({
    id: `out${i + 1}`,
    label: label(es[0]!.from.node, es[0]!.from.port, 'out'),
    type: portTypes(es[0]!.from.node, es[0]!.from.port, 'out'),
    node: es[0]!.from.node,
    port: es[0]!.from.port,
    consumers: es.map((e) => e.to),
  }));

  const slug = camelCase(name) || 'macro';
  let id = `user.macro.${slug}`;
  for (let i = 2; defs.has(id); i++) id = `user.macro.${slug}${i}`;
  const def: NodeDef = {
    id,
    label: name.trim() || 'Macro',
    category: 'utility',
    description: `Macro of ${inside.length} node${inside.length === 1 ? '' : 's'}: ${inside.map((n) => n.name || defs.get(n.type)?.label || n.type).join(', ')}.`,
    tags: ['macro', 'custom'],
    inputs: macroInputs.map((m) => ({ id: m.id, label: m.label, type: m.type as NodeDef['inputs'][number]['type'] })),
    outputs: macroOutputs.map((m) => ({ id: m.id, label: m.label, type: m.type as NodeDef['outputs'][number]['type'], expr: '' })),
    macro: {
      nodes: structuredClone(inside),
      edges: structuredClone(innerEdges),
      inputs: macroInputs.map((m) => ({ id: m.id, targets: m.targets })),
      outputs: macroOutputs.map((m) => ({ id: m.id, node: m.node, port: m.port })),
    },
  };

  const instanceId = newId('n');
  const cx = Math.round(inside.reduce((s, n) => s + n.position.x, 0) / inside.length);
  const cy = Math.round(inside.reduce((s, n) => s + n.position.y, 0) / inside.length);
  const instance: NodeInstance = { id: instanceId, type: id, position: { x: cx, y: cy }, inputs: {}, params: {} };
  const edges: Edge[] = graph.edges.filter((e) => !sel.has(e.from.node) && !sel.has(e.to.node));
  for (const m of macroInputs) edges.push({ id: newId('e'), from: m.source, to: { node: instanceId, port: m.id } });
  for (const m of macroOutputs) for (const c of m.consumers) edges.push({ id: newId('e'), from: { node: instanceId, port: m.id }, to: c });
  void project;
  return {
    def,
    graph: { ...graph, nodes: [...graph.nodes.filter((n) => !sel.has(n.id)), instance], edges },
    instanceId,
  };
}
