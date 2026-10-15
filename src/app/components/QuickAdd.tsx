// Quick-add search at the cursor: Tab or double-click on the canvas (Phase 2).
import { useState } from 'react';
import { searchDefs, disabledReason } from '../nodeSearch';
import { actions, useGraph, useStore } from '../store';

export interface QuickAddAt {
  /** Screen position of the popover, relative to the canvas element. */
  x: number;
  y: number;
  /** Flow position for the new node. */
  flow: { x: number; y: number };
}

export function QuickAdd({ at, onClose }: { at: QuickAddAt; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const graph = useGraph();
  const aeTarget = useStore((s) => s.project.settings.aeTarget);
  const results = searchDefs(q).slice(0, 12);

  const add = (type: string) => {
    actions.addNode(type, { x: Math.round(at.flow.x), y: Math.round(at.flow.y) });
    onClose();
  };

  return (
    <div className="quick-add" style={{ left: at.x, top: at.y }} role="dialog" aria-label="Add node">
      <input
        autoFocus
        type="search"
        placeholder="Add node…"
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
              <span className="muted small">{d.category}</span>
            </li>
          );
        })}
        {results.length === 0 && <li className="muted">No matching nodes</li>}
      </ul>
    </div>
  );
}
