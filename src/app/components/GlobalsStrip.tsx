// Globals strip (spec §12): a compact summary. The Globals button (or any chip) opens the editor.
import { useState } from 'react';
import { type ControlType } from '../../core';
import { useStore } from '../store';
import { GlobalsDialog } from './GlobalsDialog';

const CONTROL_ICON: Record<ControlType, string> = {
  slider: '⎯', checkbox: '☑', dropdown: '▾', color: '◐', point: '⌖', point3d: '⌖', angle: '∠', layer: '▤',
};

export function GlobalsStrip() {
  const globals = useStore((s) => s.project.globals);
  const [open, setOpen] = useState<{ focus?: string } | null>(null);

  return (
    <section className="globals" aria-label="Globals">
      <div className="globals-row">
        <button className="ghost small" onClick={() => setOpen({})} aria-haspopup="dialog">⚙ Globals</button>
        <div className="chip-group">
          <button className="chip pinned" onClick={() => setOpen({ focus: 'ctrls' })} title="Controls null (pinned)">
            📌 {globals.ctrls.layerName}
          </button>
        </div>
        <div className="chip-group">
          <span className="group-label">Layers</span>
          {globals.layers.length === 0 && <span className="muted small">none</span>}
          {globals.layers.map((l) => (
            <button key={l.id} className="chip" onClick={() => setOpen({ focus: l.id })} title={`${l.kind}${l.is3D ? ', 3D' : ''}`}>
              {l.layerName}
            </button>
          ))}
        </div>
        <div className="chip-group">
          <span className="group-label">Controls</span>
          {globals.controls.length === 0 && <span className="muted small">none</span>}
          {globals.controls.map((c) => (
            <button key={c.id} className="chip" onClick={() => setOpen({ focus: c.id })}>
              <span aria-hidden>{CONTROL_ICON[c.type]}</span> {c.effectName}
            </button>
          ))}
        </div>
        {globals.comps.length > 0 && (
          <div className="chip-group">
            <span className="group-label">Comps</span>
            {globals.comps.map((c) => (
              <button key={c.id} className="chip" onClick={() => setOpen({ focus: c.id })}>{c.name}</button>
            ))}
          </div>
        )}
      </div>
      {open && <GlobalsDialog focusId={open.focus} onClose={() => setOpen(null)} />}
    </section>
  );
}
