// App state: the project, undo/redo history (graph and globals share one history), UI selection.
import { produce } from 'immer';
import { create } from 'zustand';
import type { ConverterFix, DecodedPayload, Graph, Literal, NodeDef, NodeInstance, Project } from '../core';
import { importGraph, NODE_DEFS } from '../core';
import { copyNodes, pasteNodes, type NodeClip } from './clipboard';
import { PRESETS } from '../core/presets';

const HISTORY_LIMIT = 200;
/** Edits with the same coalesce key within this window merge into one undo step (typing, dragging). */
const COALESCE_MS = 800;

export interface ConnectError {
  reason: string;
  fix?: ConverterFix;
  from: { node: string; port: string };
  to: { node: string; port: string };
}

interface State {
  project: Project;
  graphId: string;
  past: Project[];
  future: Project[];
  lastKey: string | null;
  lastAt: number;
  /** The primary (last-selected) node, shown in the inspector. */
  selectedNodeId: string | null;
  /** Every selected node (box-select / Shift-click). */
  selection: string[];
  /** Node whose name is being edited on the canvas. */
  renamingId: string | null;
  connectError: ConnectError | null;

  /** Apply an undoable change. */
  update(recipe: (draft: Project) => void, coalesceKey?: string): void;
  /** Replace the whole project (load, import, preset). Undoable. */
  replaceProject(p: Project): void;
  undo(): void;
  redo(): void;
  select(id: string | null): void;
  setSelection(ids: string[]): void;
  setConnectError(e: ConnectError | null): void;
  setGraph(id: string): void;
}

export const defaultProject = (): Project => structuredClone(PRESETS[0]!.project);

export const useStore = create<State>((set, get) => ({
  project: defaultProject(),
  graphId: PRESETS[0]!.project.graphs[0]!.id,
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,
  selectedNodeId: null,
  selection: [],
  renamingId: null,
  connectError: null,

  update(recipe, coalesceKey) {
    const { project, past, lastKey, lastAt } = get();
    const next = produce(project, recipe);
    if (next === project) return;
    const now = Date.now();
    const merge = coalesceKey != null && coalesceKey === lastKey && now - lastAt < COALESCE_MS;
    set({
      project: next,
      past: merge ? past : [...past.slice(-HISTORY_LIMIT + 1), project],
      future: [],
      lastKey: coalesceKey ?? null,
      lastAt: now,
    });
  },

  replaceProject(p) {
    const { project, past } = get();
    set({
      project: p,
      graphId: p.graphs[0]!.id,
      past: [...past.slice(-HISTORY_LIMIT + 1), project],
      future: [],
      lastKey: null,
      selectedNodeId: null,
      selection: [],
      connectError: null,
    });
  },

  undo() {
    const { past, future, project, graphId } = get();
    const prev = past.at(-1);
    if (!prev) return;
    set({
      project: prev,
      past: past.slice(0, -1),
      future: [project, ...future],
      lastKey: null,
      graphId: prev.graphs.some((g) => g.id === graphId) ? graphId : prev.graphs[0]!.id,
    });
  },

  redo() {
    const { past, future, project, graphId } = get();
    const next = future[0];
    if (!next) return;
    set({
      project: next,
      past: [...past, project],
      future: future.slice(1),
      lastKey: null,
      graphId: next.graphs.some((g) => g.id === graphId) ? graphId : next.graphs[0]!.id,
    });
  },

  select: (id) => set({ selectedNodeId: id, selection: id ? [id] : [] }),
  setSelection: (ids) => set({ selection: ids, selectedNodeId: ids.at(-1) ?? null }),
  setConnectError: (e) => set({ connectError: e }),
  setGraph: (id) => set({ graphId: id, selectedNodeId: null, selection: [], connectError: null }),
}));

// ---- Selectors / helpers ----

export function activeGraph(p: Project, graphId: string): Graph {
  return p.graphs.find((g) => g.id === graphId) ?? p.graphs[0]!;
}

export const useGraph = () => useStore((s) => activeGraph(s.project, s.graphId));

let counter = 0;
export function newId(prefix: string): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

// ---- Graph actions ----

function editGraph(recipe: (g: Graph, p: Project) => void, coalesceKey?: string) {
  const { update, graphId } = useStore.getState();
  update((p) => recipe(activeGraph(p, graphId), p), coalesceKey);
}

/** A new node instance with sensible default references (first control, first layer, Position). */
export function newNodeInstance(def: NodeDef | undefined, type: string, id: string, position: { x: number; y: number }, p: Project): NodeInstance {
  const n: NodeInstance = { id, type, position, inputs: {}, params: {} };
  if (def?.special === 'ref.control') {
    const c = p.globals.controls.find((x) => !def.controlTypes || def.controlTypes.includes(x.type));
    if (c) n.ref = { controlId: c.id };
  }
  if (def?.special === 'ref.layer' && p.globals.layers[0]) n.ref = { layerId: p.globals.layers[0].id };
  if (def?.special === 'ref.property') n.ref = { propertyPath: 'transform.position' };
  return n;
}

export interface PendingWire {
  /** The node and handle the wire was dragged from. */
  node: string;
  port: string;
  /** 'source' = dragged from an output; 'target' = dragged from an input. */
  side: 'source' | 'target';
}

export const actions = {
  addNode(type: string, position: { x: number; y: number }): string {
    const id = newId('n');
    editGraph((g, p) => {
      g.nodes.push(newNodeInstance(NODE_DEFS.get(type), type, id, position, p));
    });
    useStore.getState().select(id);
    return id;
  },

  /** Adds a node and wires it to a dangling connection in one undo step (drag a wire into empty canvas). */
  addNodeWired(type: string, position: { x: number; y: number }, wire: PendingWire, port: string): string {
    const id = newId('n');
    editGraph((g, p) => {
      g.nodes.push(newNodeInstance(NODE_DEFS.get(type), type, id, position, p));
      const from = wire.side === 'source' ? { node: wire.node, port: wire.port } : { node: id, port };
      const to = wire.side === 'source' ? { node: id, port } : { node: wire.node, port: wire.port };
      g.edges = g.edges.filter((e) => !(e.to.node === to.node && e.to.port === to.port));
      g.edges.push({ id: newId('e'), from, to });
    });
    useStore.getState().select(id);
    return id;
  },

  removeNodes(ids: string[]) {
    const set = new Set(ids);
    editGraph((g) => {
      g.nodes = g.nodes.filter((n) => !set.has(n.id));
      g.edges = g.edges.filter((e) => !set.has(e.from.node) && !set.has(e.to.node));
    });
    const { selection, setSelection } = useStore.getState();
    setSelection(selection.filter((id) => !set.has(id)));
  },

  /** The current selection as a clip (Output is never copied). */
  copySelection(): NodeClip | null {
    const { project, graphId, selection } = useStore.getState();
    return copyNodes(project, activeGraph(project, graphId), selection);
  },

  paste(clip: NodeClip, at?: { x: number; y: number }) {
    let ids: string[] = [];
    const { update, graphId } = useStore.getState();
    update((p) => {
      ids = pasteNodes(p, graphId, clip, newId, at);
    });
    useStore.getState().setSelection(ids);
  },

  duplicateSelection() {
    const clip = actions.copySelection();
    if (clip) actions.paste(clip);
  },

  setNodeColor(nodeId: string, color: string | undefined) {
    editGraph((g) => {
      const n = g.nodes.find((x) => x.id === nodeId);
      if (!n) return;
      if (color) n.color = color;
      else delete n.color;
    }, `color:${nodeId}`);
  },

  setPreview(nodeId: string, on: boolean) {
    editGraph((g) => {
      const n = g.nodes.find((x) => x.id === nodeId);
      if (!n) return;
      if (on) n.preview = true;
      else delete n.preview;
    });
  },

  moveNode(id: string, position: { x: number; y: number }) {
    editGraph((g) => {
      const n = g.nodes.find((x) => x.id === id);
      if (n) n.position = { x: Math.round(position.x), y: Math.round(position.y) };
    }, `move:${id}`);
  },

  /** Adds an edge, replacing any existing connection into the same input. */
  connect(from: { node: string; port: string }, to: { node: string; port: string }) {
    editGraph((g) => {
      g.edges = g.edges.filter((e) => !(e.to.node === to.node && e.to.port === to.port));
      g.edges.push({ id: newId('e'), from, to });
    });
  },

  insertConverter(err: ConnectError) {
    const fix = err.fix;
    if (!fix) return;
    const id = newId('n');
    editGraph((g) => {
      const a = g.nodes.find((n) => n.id === err.from.node);
      const b = g.nodes.find((n) => n.id === err.to.node);
      const position = a && b
        ? { x: Math.round((a.position.x + b.position.x) / 2), y: Math.round((a.position.y + b.position.y) / 2) + 40 }
        : { x: 0, y: 0 };
      g.nodes.push({ id, type: fix.type, position, inputs: {}, params: { ...fix.params } });
      g.edges = g.edges.filter((e) => !(e.to.node === err.to.node && e.to.port === err.to.port));
      g.edges.push({ id: newId('e'), from: err.from, to: { node: id, port: fix.inPort } });
      g.edges.push({ id: newId('e'), from: { node: id, port: fix.outPort }, to: err.to });
    });
    useStore.getState().setConnectError(null);
  },

  removeEdges(ids: string[]) {
    const set = new Set(ids);
    editGraph((g) => {
      g.edges = g.edges.filter((e) => !set.has(e.id));
    });
  },

  setInput(nodeId: string, port: string, value: Literal | undefined) {
    editGraph((g) => {
      const n = g.nodes.find((x) => x.id === nodeId);
      if (!n) return;
      if (value === undefined) delete n.inputs[port];
      else n.inputs[port] = value;
    }, `input:${nodeId}:${port}`);
  },

  setParam(nodeId: string, param: string, value: Literal) {
    editGraph((g) => {
      const n = g.nodes.find((x) => x.id === nodeId);
      if (n) n.params[param] = value;
    }, `param:${nodeId}:${param}`);
  },

  setRef(nodeId: string, ref: NodeInstance['ref']) {
    editGraph((g) => {
      const n = g.nodes.find((x) => x.id === nodeId);
      if (n) n.ref = { ...n.ref, ...ref };
    });
  },

  renameNode(nodeId: string, name: string) {
    editGraph((g) => {
      const n = g.nodes.find((x) => x.id === nodeId);
      if (!n) return;
      if (name.trim()) n.name = name;
      else delete n.name;
    }, `name:${nodeId}`);
  },

  setTarget(target: Graph['target']) {
    editGraph((g) => {
      g.target = target;
    });
  },

  addGraph(): string {
    const id = newId('g');
    const { update, setGraph } = useStore.getState();
    update((p) => {
      p.graphs.push({
        id,
        name: `Expression ${p.graphs.length + 1}`,
        target: { id: 'position2D' },
        nodes: [
          { id: newId('n'), type: 'ctx.value', position: { x: 0, y: 0 }, inputs: {}, params: {} },
          { id: newId('n'), type: 'output', position: { x: 300, y: 0 }, inputs: {}, params: {} },
        ],
        edges: [],
      });
      const g = p.graphs.at(-1)!;
      g.edges.push({ id: newId('e'), from: { node: g.nodes[0]!.id, port: 'out' }, to: { node: g.nodes[1]!.id, port: 'in' } });
    });
    setGraph(id);
    return id;
  },

  duplicateGraph(graphId: string) {
    const id = newId('g');
    const { update, setGraph } = useStore.getState();
    update((p) => {
      const src = p.graphs.find((g) => g.id === graphId);
      if (src) p.graphs.push({ ...structuredClone(src), id, name: `${src.name} copy` });
    });
    setGraph(id);
  },

  deleteGraph(graphId: string) {
    const { update, setGraph, project } = useStore.getState();
    if (project.graphs.length < 2) return;
    const next = project.graphs.find((g) => g.id !== graphId)!.id;
    update((p) => {
      p.graphs = p.graphs.filter((g) => g.id !== graphId);
    });
    setGraph(next);
  },

  /** Adds a graph decoded from a pasted expression (spec §8). */
  importDecoded(decoded: DecodedPayload) {
    const { project, update, setGraph } = useStore.getState();
    const { project: merged, graphId } = importGraph(project, decoded, () => newId('g'));
    update((p) => {
      p.globals = merged.globals;
      p.graphs = merged.graphs;
    });
    setGraph(graphId);
  },

  renameGraph(name: string) {
    editGraph((g) => {
      g.name = name;
    }, 'graph-name');
  },
};
