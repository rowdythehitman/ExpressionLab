// Node canvas (React Flow). The project in the store is the source of truth; React Flow keeps
// local node state only for in-progress drags and measured sizes.
import {
  applyNodeChanges, Background, Controls, MiniMap, ReactFlow, useReactFlow,
  type Connection, type Edge as RFEdge, type EdgeChange, type Node as RFNode, type NodeChange,
} from '@xyflow/react';
import { useCallback, useMemo, useState } from 'react';
import { checkConnection, type NodeTypes } from '../../core';
import { actions, useStore } from '../store';
import { useCompiled } from '../useCompiled';
import { AeNode, type AeNodeData } from './AeNode';
import { DRAG_MIME } from './Palette';

const nodeTypes = { ae: AeNode };

export function Canvas() {
  const { graph, result, analysis } = useCompiled();
  const project = useStore((s) => s.project);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const connectError = useStore((s) => s.connectError);
  const rf = useReactFlow();

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
      selected: n.id === selectedNodeId,
      data: {
        types: analysis.types.get(n.id) as NodeTypes | undefined,
        connected: connected.get(n.id) ?? [],
        status: status.get(n.id) ?? 'ok',
      },
    }));
  }, [graph, analysis, status, selectedNodeId]);

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
    for (const c of changes) {
      if (c.type === 'position' && c.position && !c.dragging) actions.moveNode(c.id, c.position);
      if (c.type === 'remove') removed.push(c.id);
      if (c.type === 'select' && c.selected) useStore.getState().select(c.id);
    }
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

  const onDrop = useCallback((e: React.DragEvent) => {
    const type = e.dataTransfer.getData(DRAG_MIME);
    if (!type) return;
    e.preventDefault();
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    actions.addNode(type, { x: Math.round(pos.x), y: Math.round(pos.y) });
  }, [rf]);

  return (
    <div className="canvas" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={() => useStore.getState().select(null)}
        deleteKeyCode={['Backspace', 'Delete']}
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
      {project.graphs.length > 0 && graph.nodes.length === 0 && (
        <div className="canvas-empty muted">Add nodes from the palette, then wire them into an Output.</div>
      )}
    </div>
  );
}
