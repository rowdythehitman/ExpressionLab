// Quick-add search at the cursor: Tab or double-click on the canvas, or drop a wire into empty space.
// With a wire, only nodes that can take it are listed, and the new node arrives already connected.
import { useMemo, useState } from 'react';
import { NODE_DEFS } from '../../core';
import { compatiblePort, disabledReason, searchDefs } from '../nodeSearch';
import { actions, useGraph, useStore, type PendingWire } from '../store';

export interface QuickAddAt {
  /** Screen position of the popover, relative to the canvas element. */
  x: number;
  y: number;
  /** Flow position for the new node. */
  flow: { x: number; y: number };
  /** Set when opened by dropping a wire into empty canvas. */
  wire?: PendingWire;
}

export function QuickAdd({ at, onClose }: { at: QuickAddAt; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const graph = useGraph();
  const project = useStore((s) => s.project);
  const aeTarget = project.settings.aeTarget;

  // Which port of each node the dangling wire would connect to (computed once per open).
  const ports = useMemo(() => {
    if (!at.wire) return null;
    const m = new Map<string, string>();
    for (const d of NODE_DEFS.values()) {
      if (disabledReason(d, graph, aeTarget)) continue;
      const port = compatiblePort(project, graph, d, at.wire);
      if (port) m.set(d.id, port);
    }
    return m;
  }, [at.wire, project, graph, aeTarget]);

  const results = searchDefs(q).filter((d) => !ports || ports.has(d.id)).slice(0, 12);

  const add = (type: string) => {
    // Inputs sit on a node's left, so a node fed by the wire is placed to the right of the drop point.
    const pos = { x: Math.round(at.flow.x - (at.wire?.side === 'target' ? 200 : 0)), y: Math.round(at.flow.y - 20) };
    const port = ports?.get(type);
    if (at.wire && port) actions.addNodeWired(type, pos, at.wire, port);
    else actions.addNode(type, pos);
    onClose();
  };

  const portLabel = (type: string) => {
    const port = ports?.get(type);
    const d = NODE_DEFS.get(type);
    if (!port || !d) return null;
    return (at.wire?.side === 'source' ? d.inputs.find((p) => p.id === port) : d.outputs.find((o) => o.id === port))?.label;
  };

  return (
    <div className="quick-add" style={{ left: at.x, top: at.y }} role="dialog" aria-label="Add node">
      <input
        autoFocus
        type="search"
        placeholder={at.wire ? 'Add a connected node…' : 'Add node…'}
        value={q}
        aria-activedescendant={`qa-${active}`}
        onChange={(e) => { setQ(e.target.value); setActive(0); }}
        onBlur={() => setTimeout(onClose, 120)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') {
            const d = results[active];
            if (d && !disabledReason(d, graph, aeTarget)) add(d.id);
          }
        }}
      />
      <ul role="listbox">
        {results.map((d, i) => {
          const reason = disabledReason(d, graph, aeTarget);
          const via = portLabel(d.id);
          return (
            <li
              key={d.id}
              id={`qa-${i}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={!!reason}
              className={`${i === active ? 'active' : ''} ${reason ? 'disabled' : ''} cat-${d.category}`}
              title={reason ?? d.description}
              onMouseDown={(e) => { e.preventDefault(); if (!reason) add(d.id); }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{d.label}</span>
              <span className="muted small">{via ? `→ ${via}` : d.category}</span>
            </li>
          );
        })}
        {results.length === 0 && <li className="muted">{at.wire ? 'No node can take this wire' : 'No matching nodes'}</li>}
      </ul>
    </div>
  );
}
