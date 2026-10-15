// Shared by the palette and the quick-add popover.
import { NODE_DEFS, TARGETS, type Graph, type NodeDef } from '../core';
import { CATEGORY_ORDER } from './components/ports';

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
