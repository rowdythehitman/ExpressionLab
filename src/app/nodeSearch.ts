// Shared by the palette and the quick-add popover.
import { checkConnection, NODE_DEFS, TARGETS, type Graph, type NodeDef, type Project } from '../core';
import { CATEGORY_ORDER } from './components/ports';
import { newNodeInstance, type PendingWire } from './store';

export function disabledReason(d: NodeDef, graph: Graph, aeTarget: number): string | null {
  const target = TARGETS.get(graph.target.id);
  if (d.contexts && !d.contexts.some((c) => target?.contexts.includes(c))) {
    return `Only available when applying to: ${d.contexts.map((c) => TARGETS.get(c)?.label ?? c).join(', ')}`;
  }
  if (d.requires?.minAE && d.requires.minAE > aeTarget) return `Needs After Effects ${d.requires.minAE}+`;
  if (d.special === 'output' && graph.nodes.some((n) => NODE_DEFS.get(n.type)?.special === 'output')) {
    return 'A graph has exactly one Output';
  }
  return null;
}

/** Defs matching `q` (label, id, description, tags), in palette order. Label matches rank first. */
export function searchDefs(q: string): NodeDef[] {
  const needle = q.trim().toLowerCase();
  const all = [...NODE_DEFS.values()].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );
  if (!needle) return all;
  const score = (d: NodeDef) =>
    d.label.toLowerCase().startsWith(needle) ? 0
    : d.label.toLowerCase().includes(needle) ? 1
    : [d.id, ...d.tags].some((s) => s.toLowerCase().includes(needle)) ? 2
    : d.description.toLowerCase().includes(needle) ? 3
    : -1;
  return all.filter((d) => score(d) >= 0).sort((a, b) => score(a) - score(b));
}

/**
 * For a wire dragged into empty canvas: the first port of `def` that the wire could connect to
 * (an input when dragging from an output, an output when dragging from an input), or null.
 */
export function compatiblePort(project: Project, graph: Graph, def: NodeDef, wire: PendingWire): string | null {
  const temp = newNodeInstance(def, def.id, '__quickadd__', { x: 0, y: 0 }, project);
  const trial: Graph = { ...graph, nodes: [...graph.nodes, temp] };
  const ports = wire.side === 'source' ? def.inputs.map((p) => p.id) : def.outputs.map((o) => o.id);
  for (const port of ports) {
    const from = wire.side === 'source' ? { node: wire.node, port: wire.port } : { node: temp.id, port };
    const to = wire.side === 'source' ? { node: temp.id, port } : { node: wire.node, port: wire.port };
    if (checkConnection(project, trial, from, to).ok) return port;
  }
  return null;
}
