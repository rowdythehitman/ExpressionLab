// Searchable node palette (spec §12). Click to add at the canvas centre, or drag onto the canvas.
import { useReactFlow } from '@xyflow/react';
import { useMemo, useState } from 'react';
import { type NodeDef } from '../../core';
import { disabledReason as reasonFor } from '../nodeSearch';
import { actions, useDefs, useGraph, useStore } from '../store';
import { CATEGORY_LABEL, CATEGORY_ORDER } from './ports';

export const DRAG_MIME = 'application/x-expressionlab-node';

export function Palette() {
  const [q, setQ] = useState('');
  const graph = useGraph();
  const aeTarget = useStore((s) => s.project.settings.aeTarget);
  const rf = useReactFlow();
  const defs = useDefs();
  const disabledReason = (d: NodeDef) => reasonFor(d, graph, aeTarget, defs);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (d: NodeDef) =>
      !needle || [d.label, d.id, d.description, ...d.tags].some((s) => s.toLowerCase().includes(needle));
    return CATEGORY_ORDER.map((c) => ({ c, defs: [...defs.values()].filter((d) => d.category === c && match(d)) }))
      .filter((g) => g.defs.length);
  }, [q, defs]);

  const addAtCenter = (type: string) => {
    const el = document.querySelector('.canvas');
    const r = el?.getBoundingClientRect();
    const pos = r ? rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
    actions.addNode(type, { x: Math.round(pos.x - 90), y: Math.round(pos.y - 40) });
  };

  return (
    <nav className="palette" aria-label="Node palette">
      <input
        className="search"
        type="search"
        placeholder="Search nodes…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          const first = groups.flatMap((g) => g.defs).find((d) => !disabledReason(d));
          if (first) addAtCenter(first.id);
        }}
      />
      <div className="palette-list">
        {groups.map(({ c, defs }) => (
          <section key={c}>
            <h3>{CATEGORY_LABEL[c]}</h3>
            {defs.map((d) => {
              const reason = disabledReason(d);
              return (
                <button
                  key={d.id}
                  className={`palette-item cat-${d.category}`}
                  disabled={!!reason}
                  title={reason ?? d.description}
                  draggable={!reason}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, d.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => addAtCenter(d.id)}
                >
                  {d.label}{d.id.startsWith('user.') && <span className="custom-mark" title="Custom node"> ★</span>}
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </nav>
  );
}
