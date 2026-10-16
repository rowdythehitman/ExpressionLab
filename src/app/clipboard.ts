// Copy/paste of nodes. The clip travels as JSON text on the system clipboard, so it works across tabs
// and browser windows; it carries the globals the nodes reference so pasting into another project works.
import { customNodesUsed, globalsSubset, nodeLibrary, type Edge, type Globals, type Graph, type NodeDef, type NodeInstance, type Project } from '../core';

export const CLIP_KIND = 'expressionlab/nodes@1';

export interface NodeClip {
  kind: typeof CLIP_KIND;
  nodes: NodeInstance[];
  edges: Edge[];
  globals: Globals;
  /** Custom nodes and macros the clip uses. */
  customNodes?: NodeDef[];
}

/** The selected nodes (minus Output, which a graph has exactly one of) and the wires between them. */
export function copyNodes(project: Project, graph: Graph, ids: Iterable<string>): NodeClip | null {
  const set = new Set(ids);
  const nodes = graph.nodes.filter((n) => set.has(n.id) && nodeLibrary(project).get(n.type)?.special !== 'output');
  if (!nodes.length) return null;
  const kept = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => kept.has(e.from.node) && kept.has(e.to.node));
  const custom = customNodesUsed(project, nodes);
  return {
    kind: CLIP_KIND,
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
    globals: globalsSubset(project.globals, { ...graph, nodes }, custom),
    ...(custom.length ? { customNodes: structuredClone(custom) } : {}),
  };
}

export function parseClip(text: string): NodeClip | null {
  if (!text.includes(CLIP_KIND)) return null;
  try {
    const v = JSON.parse(text) as Partial<NodeClip>;
    return v.kind === CLIP_KIND && Array.isArray(v.nodes) && Array.isArray(v.edges) && v.globals ? (v as NodeClip) : null;
  } catch {
    return null;
  }
}

/**
 * Pastes into `project` (mutating it, so it can run inside an immer recipe). New ids for every node and
 * edge; positions are moved so the clip's top-left lands at `at` (or offset by 40px when not given).
 * Globals merge by id: the project's existing definitions win. Returns the new node ids.
 */
export function pasteNodes(
  project: Project,
  graphId: string,
  clip: NodeClip,
  newId: (prefix: string) => string,
  at?: { x: number; y: number },
): string[] {
  const graph = project.graphs.find((g) => g.id === graphId);
  if (!graph) return [];
  const has = <T extends { id: string }>(xs: T[], id: string) => xs.some((x) => x.id === id);
  for (const l of clip.globals.layers) if (!has(project.globals.layers, l.id)) project.globals.layers.push(l);
  for (const c of clip.globals.controls) if (!has(project.globals.controls, c.id)) project.globals.controls.push(c);
  for (const d of clip.customNodes ?? []) {
    project.customNodes ??= [];
    if (!has(project.customNodes, d.id)) project.customNodes.push(d);
  }

  const minX = Math.min(...clip.nodes.map((n) => n.position.x));
  const minY = Math.min(...clip.nodes.map((n) => n.position.y));
  const dx = at ? at.x - minX : 40;
  const dy = at ? at.y - minY : 40;
  const idMap = new Map<string, string>();
  for (const n of clip.nodes) {
    const id = newId('n');
    idMap.set(n.id, id);
    graph.nodes.push({
      ...structuredClone(n),
      id,
      position: { x: Math.round(n.position.x + dx), y: Math.round(n.position.y + dy) },
    });
  }
  for (const e of clip.edges) {
    const from = idMap.get(e.from.node);
    const to = idMap.get(e.to.node);
    if (from && to) graph.edges.push({ id: newId('e'), from: { node: from, port: e.from.port }, to: { node: to, port: e.to.port } });
  }
  return [...idMap.values()];
}
