// Node canvas (React Flow). The project in the store is the source of truth; React Flow keeps
// local node state only for in-progress drags and measured sizes.
import {
  applyNodeChanges, Background, Controls, MiniMap, ReactFlow, useReactFlow,
  type Connection, type Edge as RFEdge, type EdgeChange, type FinalConnectionState, type Node as RFNode, type NodeChange,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { checkConnection, type NodeTypes } from '../../core';
import { parseClip } from '../clipboard';
import { actions, useStore } from '../store';
import { useCompiled } from '../useCompiled';
import { AeNode, type AeNodeData } from './AeNode';
import { DRAG_MIME } from './Palette';
import { QuickAdd, type QuickAddAt } from './QuickAdd';

const nodeTypes = { ae: AeNode };

export function Canvas() {
  const { graph, result, analysis } = useCompiled();
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const connectError = useStore((s) => s.connectError);
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddAt | null>(null);

  const openQuickAdd = useCallback((clientX: number, clientY: number, wire?: QuickAddAt['wire']) => {
    const r = wrapper.current!.getBoundingClientRect();
    setQuickAdd({ x: clientX - r.left, y: clientY - r.top, flow: rf.screenToFlowPosition({ x: clientX, y: clientY }), wire });
  }, [rf]);

  // Copy / cut / paste / duplicate / select-all for nodes. Text fields and the code view keep their
  // normal clipboard behaviour; the node clip goes through the system clipboard as JSON.
  useEffect(() => {
    const inTextContext = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.closest('.cm-editor, [role=dialog]')) return true;
      return !!window.getSelection()?.toString();
    };
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      if (inTextContext(e.target) || !useStore.getState().selection.length) return;
      const clip = actions.copySelection();
      if (!clip) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', JSON.stringify(clip));
      if (cut) actions.removeNodes(clip.nodes.map((n) => n.id));
    };
    const copy = (e: ClipboardEvent) => onCopy(e, false);
    const cut = (e: ClipboardEvent) => onCopy(e, true);
    const paste = (e: ClipboardEvent) => {
      if (inTextContext(e.target)) return;
      const clip = parseClip(e.clipboardData?.getData('text/plain') ?? '');
      if (!clip) return;
      e.preventDefault();
      const m = mouse.current;
      actions.paste(clip, m ? rf.screenToFlowPosition(m) : undefined);
    };
    const keys = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || inTextContext(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'd') {
        e.preventDefault();
        actions.duplicateSelection();
      } else if (k === 'a') {
        e.preventDefault();
        const { project: p, graphId, setSelection } = useStore.getState();
        setSelection((p.graphs.find((g) => g.id === graphId) ?? p.graphs[0]!).nodes.map((n) => n.id));
      }
    };
    window.addEventListener('copy', copy);
    window.addEventListener('cut', cut);
    window.addEventListener('paste', paste);
    window.addEventListener('keydown', keys);
    return () => {
      window.removeEventListener('copy', copy);
      window.removeEventListener('cut', cut);
      window.removeEventListener('paste', paste);
      window.removeEventListener('keydown', keys);
    };
  }, [rf]);

  // Tab opens quick-add at the cursor (or the canvas centre) when focus isn't in a field or dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY'].includes(el.tagName) || el.closest('[role=dialog]')) return;
      e.preventDefault();
      const r = wrapper.current!.getBoundingClientRect();
      const m = mouse.current;
      openQuickAdd(m?.x ?? r.left + r.width / 2, m?.y ?? r.top + r.height / 2);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openQuickAdd]);

  // Per-node status from diagnostics: errors outline the node, unused nodes are dimmed.
  const status = useMemo(() => {
    const m = new Map<string, AeNodeData['status']>();
    for (const d of result.diagnostics) {
      if (!d.nodeId) continue;
      if (d.severity === 'error') m.set(d.nodeId, 'error');
      else if (d.code === 'UNUSED_NODE' && !m.has(d.nodeId)) m.set(d.nodeId, 'unused');
      else if (d.severity === 'warning' && !m.has(d.nodeId)) m.set(d.nodeId, 'warning');
    }
    return m;
  }, [result]);
  const badEdges = useMemo(
    () => new Set(result.diagnostics.filter((d) => d.edgeId).map((d) => d.edgeId!)),
    [result],
  );

  const derived = useMemo<RFNode<AeNodeData>[]>(() => {
    const connected = new Map<string, string[]>();
    for (const e of graph.edges) connected.set(e.to.node, [...(connected.get(e.to.node) ?? []), e.to.port]);
    return graph.nodes.map((n) => ({
      id: n.id,
      type: 'ae',
      position: n.position,
      selected: selection.includes(n.id),
      data: {
        types: analysis.types.get(n.id) as NodeTypes | undefined,
        connected: connected.get(n.id) ?? [],
        status: status.get(n.id) ?? 'ok',
      },
    }));
  }, [graph, analysis, status, selection]);

  const [nodes, setNodes] = useState(derived);
  const [prevDerived, setPrevDerived] = useState(derived);
  if (derived !== prevDerived) {
    // Re-derive from the store, keeping React Flow's measurements (state adjusted during render).
    setPrevDerived(derived);
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return derived.map((n) => ({ ...old.get(n.id), ...n }));
    });
  }

  const edges = useMemo<RFEdge[]>(
    () => graph.edges.map((e) => ({
      id: e.id,
      source: e.from.node,
      sourceHandle: e.from.port,
      target: e.to.node,
      targetHandle: e.to.port,
      className: badEdges.has(e.id) ? 'edge-bad' : undefined,
    })),
    [graph.edges, badEdges],
  );

  const onNodesChange = useCallback((changes: NodeChange<RFNode<AeNodeData>>[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    const removed: string[] = [];
    const { selection: current, setSelection } = useStore.getState();
    let next = current;
    for (const c of changes) {
      if (c.type === 'position' && c.position && !c.dragging) actions.moveNode(c.id, c.position);
      if (c.type === 'remove') removed.push(c.id);
      if (c.type === 'select') {
        // Keep selection order: the most recently selected node is the inspector's.
        next = next.filter((id) => id !== c.id);
        if (c.selected) next = [...next, c.id];
      }
    }
    if (next !== current) setSelection(next);
    if (removed.length) actions.removeNodes(removed);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
    if (removed.length) actions.removeEdges(removed);
  }, []);

  const onConnect = useCallback((c: Connection) => {
    if (!c.sourceHandle || !c.targetHandle) return;
    const from = { node: c.source, port: c.sourceHandle };
    const to = { node: c.target, port: c.targetHandle };
    const { project: p, graphId } = useStore.getState();
    const g = p.graphs.find((x) => x.id === graphId)!;
    const check = checkConnection(p, g, from, to);
    if (check.ok) {
      actions.connect(from, to);
      useStore.getState().setConnectError(null);
    } else {
      useStore.getState().setConnectError({ reason: check.reason, fix: check.fix, from, to });
    }
  }, []);

  // A wire dropped on empty canvas opens quick-add listing only nodes that can take it.
  const onConnectEnd = useCallback((e: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.toHandle || !state.fromHandle?.id || !state.fromNode) return;
    const point = 'changedTouches' in e ? e.changedTouches[0]! : e;
    openQuickAdd(point.clientX, point.clientY, {
      node: state.fromNode.id,
      port: state.fromHandle.id,
      side: state.fromHandle.type,
    });
  }, [openQuickAdd]);

  const onDrop = useCallback((e: React.DragEvent) => {
    const type = e.dataTransfer.getData(DRAG_MIME);
    if (!type) return;
    e.preventDefault();
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    actions.addNode(type, { x: Math.round(pos.x), y: Math.round(pos.y) });
  }, [rf]);

  return (
    <div
      className="canvas"
      ref={wrapper}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onMouseMove={(e) => { mouse.current = { x: e.clientX, y: e.clientY }; }}
      onMouseLeave={() => { mouse.current = null; }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).classList.contains('react-flow__pane')) openQuickAdd(e.clientX, e.clientY);
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onPaneClick={() => useStore.getState().select(null)}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        zoomOnDoubleClick={false}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={20} />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
      {connectError && (
        <div className="connect-error" role="alert">
          <span>Can't connect: {connectError.reason}.</span>
          {connectError.fix && (
            <button onClick={() => actions.insertConverter(connectError)}>Insert “{connectError.fix.label}”</button>
          )}
          <button className="ghost small" aria-label="Dismiss" onClick={() => useStore.getState().setConnectError(null)}>×</button>
        </div>
      )}
      {quickAdd && <QuickAdd key={`${quickAdd.x},${quickAdd.y}`} at={quickAdd} onClose={() => setQuickAdd(null)} />}
      {project.graphs.length > 0 && graph.nodes.length === 0 && (
        <div className="canvas-empty muted">Add nodes from the palette (or press Tab / double-click here), then wire them into an Output.</div>
      )}
    </div>
  );
}
