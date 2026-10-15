// Kahn's algorithm with a deterministic tie-break: x, then y, then id (spec §7.1).
import type { Edge, NodeInstance } from '../types';

export function compareNodes(a: NodeInstance, b: NodeInstance): number {
  return a.position.x - b.position.x || a.position.y - b.position.y || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export interface TopoResult {
  order: NodeInstance[];
  /** Ids of nodes that sit on or downstream of a cycle; empty when the graph is a DAG. */
  cycle: string[];
}

export function topoSort(nodes: NodeInstance[], edges: Edge[]): TopoResult {
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const out = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!indeg.has(e.from.node) || !indeg.has(e.to.node)) continue;
    indeg.set(e.to.node, indeg.get(e.to.node)! + 1);
    out.get(e.from.node)!.push(e.to.node);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ready = nodes.filter((n) => indeg.get(n.id) === 0);
  const order: NodeInstance[] = [];
  while (ready.length) {
    ready.sort(compareNodes);
    const n = ready.shift()!;
    order.push(n);
    for (const m of out.get(n.id)!) {
      const d = indeg.get(m)! - 1;
      indeg.set(m, d);
      if (d === 0) ready.push(byId.get(m)!);
    }
  }
  const done = new Set(order.map((n) => n.id));
  return { order, cycle: nodes.filter((n) => !done.has(n.id)).map((n) => n.id) };
}
