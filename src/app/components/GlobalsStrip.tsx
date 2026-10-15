// Globals strip (spec §12): CTRLS (pinned), layers, controls, comps.
import { useState } from 'react';
import { CONTROLS, camelCase, isValidIdentifier, type ControlGlobal, type ControlType, type LayerGlobal, type Project } from '../../core';
import { newId, useStore } from '../store';

type Sel = { kind: 'ctrls' } | { kind: 'layer'; id: string } | { kind: 'control'; id: string } | { kind: 'comp'; id: string } | null;

const CONTROL_ICON: Record<ControlType, string> = {
  slider: '⎯', checkbox: '☑', dropdown: '▾', color: '◐', point: '⌖', point3d: '⌖', angle: '∠', layer: '▤',
};

const edit = (recipe: (p: Project) => void, key?: string) => useStore.getState().update(recipe, key);

function dupes<T>(items: T[], key: (t: T) => string): Set<string> {
  const seen = new Map<string, number>();
  for (const i of items) seen.set(key(i), (seen.get(key(i)) ?? 0) + 1);
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
}

const hostKey = (c: ControlGlobal) => (typeof c.host === 'object' ? c.host.layerId : c.host);

export function GlobalsStrip() {
  const globals = useStore((s) => s.project.globals);
  const [open, setOpen] = useState(true);
  const [sel, setSel] = useState<Sel>(null);

  const dupLayerKeys = dupes(globals.layers, (l) => l.key);
  const dupControls = dupes(globals.controls, (c) => `${hostKey(c)}/${c.effectName}`);

  const addLayer = () => {
    const id = newId('l');
    const n = globals.layers.length + 1;
    edit((p) => {
      p.globals.layers.push({ id, key: `layer${n}`, layerName: `Layer ${n}`, is3D: false, kind: 'other' });
    });
    setSel({ kind: 'layer', id });
  };
  const addControl = () => {
    const id = newId('c');
    edit((p) => {
      p.globals.controls.push({ id, effectName: `Slider ${p.globals.controls.length + 1}`, type: 'slider', host: 'ctrls' });
    });
    setSel({ kind: 'control', id });
  };
  const addComp = () => {
    const id = newId('comp');
    edit((p) => {
      p.globals.comps.push({ id, name: `Comp ${p.globals.comps.length + 1}` });
    });
    setSel({ kind: 'comp', id });
  };

  const isSel = (kind: string, id?: string) => sel?.kind === kind && (!id || ('id' in sel && sel.id === id));

  return (
    <section className={`globals ${open ? '' : 'collapsed'}`} aria-label="Globals">
      <div className="globals-row">
        <button className="ghost small" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? '▾' : '▸'} Globals
        </button>
        {open && (
          <>
            <div className="chip-group">
              <button className={`chip pinned ${isSel('ctrls') ? 'sel' : ''}`} onClick={() => setSel(isSel('ctrls') ? null : { kind: 'ctrls' })} title="Controls layer (pinned)">
                📌 {globals.ctrls.layerName}
              </button>
            </div>
            <div className="chip-group">
              <span className="group-label">Layers</span>
              {globals.layers.map((l) => (
                <button
                  key={l.id}
                  className={`chip ${isSel('layer', l.id) ? 'sel' : ''} ${dupLayerKeys.has(l.key) || !isValidIdentifier(l.key) ? 'warn' : ''}`}
                  onClick={() => setSel(isSel('layer', l.id) ? null : { kind: 'layer', id: l.id })}
                  title={dupLayerKeys.has(l.key) ? 'Duplicate key' : `${l.kind}${l.is3D ? ', 3D' : ''}`}
                >
                  {l.layerName}
                </button>
              ))}
              <button className="chip add" onClick={addLayer} aria-label="Add layer">+</button>
            </div>
            <div className="chip-group">
              <span className="group-label">Controls</span>
              {globals.controls.map((c) => (
                <button
                  key={c.id}
                  className={`chip ${isSel('control', c.id) ? 'sel' : ''} ${dupControls.has(`${hostKey(c)}/${c.effectName}`) ? 'warn' : ''}`}
                  onClick={() => setSel(isSel('control', c.id) ? null : { kind: 'control', id: c.id })}
                  title={`${CONTROLS[c.type].label} on ${c.host === 'ctrls' ? globals.ctrls.layerName : c.host === 'thisLayer' ? 'this layer' : globals.layers.find((l) => typeof c.host === 'object' && l.id === c.host.layerId)?.layerName}${dupControls.has(`${hostKey(c)}/${c.effectName}`) ? ' (duplicate name on the same layer)' : ''}`}
                >
                  <span aria-hidden>{CONTROL_ICON[c.type]}</span> {c.effectName}
                </button>
              ))}
              <button className="chip add" onClick={addControl} aria-label="Add control">+</button>
            </div>
            <div className="chip-group">
              <span className="group-label">Comps</span>
              {globals.comps.map((c) => (
                <button key={c.id} className={`chip ${isSel('comp', c.id) ? 'sel' : ''}`} onClick={() => setSel(isSel('comp', c.id) ? null : { kind: 'comp', id: c.id })}>
                  {c.name}
                </button>
              ))}
              <button className="chip add" onClick={addComp} aria-label="Add comp">+</button>
            </div>
          </>
        )}
      </div>
      {open && sel && <GlobalEditor sel={sel} onClose={() => setSel(null)} />}
    </section>
  );
}

function GlobalEditor({ sel, onClose }: { sel: NonNullable<Sel>; onClose: () => void }) {
  const globals = useStore((s) => s.project.globals);

  if (sel.kind === 'ctrls') {
    return (
      <div className="global-editor">
        <label>
          Layer name
          <input
            value={globals.ctrls.layerName}
            onChange={(e) => edit((p) => { p.globals.ctrls.layerName = e.target.value; }, 'ctrls-name')}
          />
        </label>
        <span className="muted small">The pinned controls layer (a Null works best). Rename it here and every expression updates.</span>
        <button className="ghost small" onClick={onClose}>Done</button>
      </div>
    );
  }

  if (sel.kind === 'layer') {
    const l = globals.layers.find((x) => x.id === sel.id);
    if (!l) return null;
    const set = (patch: Partial<LayerGlobal>, key?: string) =>
      edit((p) => { Object.assign(p.globals.layers.find((x) => x.id === sel.id)!, patch); }, key);
    const keyOk = isValidIdentifier(l.key);
    return (
      <div className="global-editor">
        <label>
          Layer name in AE
          <input value={l.layerName} onChange={(e) => set({ layerName: e.target.value }, `layer-name:${l.id}`)} />
        </label>
        <label>
          Variable
          <input className={keyOk ? '' : 'invalid'} value={l.key} onChange={(e) => set({ key: e.target.value }, `layer-key:${l.id}`)} />
        </label>
        {!keyOk && (
          <button className="ghost small" onClick={() => set({ key: `${camelCase(l.layerName)}Layer` })}>
            Use “{camelCase(l.layerName)}Layer”
          </button>
        )}
        <label>
          Kind
          <select value={l.kind} onChange={(e) => set({ kind: e.target.value as LayerGlobal['kind'] })}>
            {['null', 'text', 'shape', 'solid', 'precomp', 'other'].map((k) => <option key={k}>{k}</option>)}
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={l.is3D} onChange={(e) => set({ is3D: e.target.checked })} /> 3D
        </label>
        <button className="danger small" onClick={() => { edit((p) => { p.globals.layers = p.globals.layers.filter((x) => x.id !== l.id); }); onClose(); }}>
          Delete
        </button>
        <button className="ghost small" onClick={onClose}>Done</button>
      </div>
    );
  }

  if (sel.kind === 'control') {
    const c = globals.controls.find((x) => x.id === sel.id);
    if (!c) return null;
    const set = (patch: Partial<ControlGlobal>, key?: string) =>
      edit((p) => { Object.assign(p.globals.controls.find((x) => x.id === sel.id)!, patch); }, key);
    const hostValue = typeof c.host === 'object' ? `layer:${c.host.layerId}` : c.host;
    return (
      <div className="global-editor">
        <label>
          Effect name
          <input value={c.effectName} onChange={(e) => set({ effectName: e.target.value }, `control-name:${c.id}`)} />
        </label>
        <label>
          Type
          <select value={c.type} onChange={(e) => set({ type: e.target.value as ControlType })}>
            {(Object.keys(CONTROLS) as ControlType[]).map((t) => <option key={t} value={t}>{CONTROLS[t].label}</option>)}
          </select>
        </label>
        <label>
          On layer
          <select
            value={hostValue}
            onChange={(e) => {
              const v = e.target.value;
              set({ host: v === 'ctrls' || v === 'thisLayer' ? v : { layerId: v.slice('layer:'.length) } });
            }}
          >
            <option value="ctrls">{globals.ctrls.layerName}</option>
            <option value="thisLayer">this layer</option>
            {globals.layers.map((l) => <option key={l.id} value={`layer:${l.id}`}>{l.layerName}</option>)}
          </select>
        </label>
        {c.type === 'dropdown' && (
          <label>
            Items (comma-separated)
            <input
              value={(c.dropdownItems ?? []).join(', ')}
              onChange={(e) => set({ dropdownItems: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }, `control-items:${c.id}`)}
            />
          </label>
        )}
        <button className="danger small" onClick={() => { edit((p) => { p.globals.controls = p.globals.controls.filter((x) => x.id !== c.id); }); onClose(); }}>
          Delete
        </button>
        <button className="ghost small" onClick={onClose}>Done</button>
      </div>
    );
  }

  const comp = globals.comps.find((x) => x.id === sel.id);
  if (!comp) return null;
  return (
    <div className="global-editor">
      <label>
        Comp name
        <input value={comp.name} onChange={(e) => edit((p) => { p.globals.comps.find((x) => x.id === comp.id)!.name = e.target.value; }, `comp-name:${comp.id}`)} />
      </label>
      <button className="danger small" onClick={() => { edit((p) => { p.globals.comps = p.globals.comps.filter((x) => x.id !== comp.id); }); onClose(); }}>
        Delete
      </button>
      <button className="ghost small" onClick={onClose}>Done</button>
    </div>
  );
}
