// Globals editor (pop-up): the pinned GLOBALS null, "this layer", other layers, each with its controls,
// and comps. Everything nodes reference by id, so renaming here updates every expression.
import { useEffect, useRef } from 'react';
import {
  CONTROLS, camelCase, isValidIdentifier,
  type ControlGlobal, type ControlHost, type ControlType, type LayerGlobal, type Project,
} from '../../core';
import { downloadSetupScript } from '../persist';
import { newId, useStore } from '../store';

const edit = (recipe: (p: Project) => void, key?: string) => useStore.getState().update(recipe, key);
const CONTROL_TYPES = Object.keys(CONTROLS) as ControlType[];

type HostKey = 'ctrls' | 'thisLayer' | string; // string = layer id
const hostKey = (h: ControlHost): HostKey => (typeof h === 'object' ? h.layerId : h);
const hostFrom = (k: HostKey): ControlHost => (k === 'ctrls' || k === 'thisLayer' ? k : { layerId: k });

export function GlobalsDialog({ focusId, onClose }: { focusId?: string; onClose: () => void }) {
  const globals = useStore((s) => s.project.globals);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusId) body.current?.querySelector<HTMLElement>(`[data-gid="${focusId}"] input`)?.focus();
  }, [focusId]);

  const addLayer = () => {
    const id = newId('l');
    const n = globals.layers.length + 1;
    edit((p) => {
      p.globals.layers.push({ id, key: `layer${n}Layer`, layerName: `Layer ${n}`, is3D: false, kind: 'other' });
    });
    setTimeout(() => body.current?.querySelector<HTMLElement>(`[data-gid="${id}"] input`)?.focus());
  };
  const addComp = () => edit((p) => { p.globals.comps.push({ id: newId('comp'), name: `Comp ${p.globals.comps.length + 1}` }); });

  const controlsOn = (k: HostKey) => globals.controls.filter((c) => hostKey(c.host) === k);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="globals-title"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="panel-head">
          <h2 id="globals-title">Globals</h2>
          <div className="btn-row">
            <button
              className="ghost small"
              onClick={() => downloadSetupScript(useStore.getState().project)}
              title="A script that creates the GLOBALS null, null layers and every control below in your comp"
            >
              ⬇ AE setup script (.jsx)
            </button>
            <button className="ghost small" onClick={onClose} aria-label="Close">Done</button>
          </div>
        </div>
        <p className="small muted">
          Layers and expression controls your nodes refer to. Rename anything here and every expression updates.
        </p>

        <div className="globals-body" ref={body}>
          <section className="gcard pinned" data-gid="ctrls" aria-label="Globals null">
            <div className="gcard-head">
              <span className="gcard-kind">📌 Controls null</span>
              <label>
                Layer name
                <input
                  value={globals.ctrls.layerName}
                  onChange={(e) => edit((p) => { p.globals.ctrls.layerName = e.target.value; }, 'ctrls-name')}
                />
              </label>
              <span className="small muted">Add a Null with this name and put your shared controls on it.</span>
            </div>
            <ControlList hostK="ctrls" controls={controlsOn('ctrls')} />
          </section>

          <section className="gcard" data-gid="thisLayer" aria-label="This layer">
            <div className="gcard-head">
              <span className="gcard-kind">This layer</span>
              <span className="small muted">Controls on the layer the expression is applied to.</span>
            </div>
            <ControlList hostK="thisLayer" controls={controlsOn('thisLayer')} />
          </section>

          {globals.layers.map((l) => (
            <LayerCard key={l.id} layer={l} controls={controlsOn(l.id)} />
          ))}
          <button className="ghost" onClick={addLayer}>+ Add layer</button>

          <section className="gcard" aria-label="Comps">
            <div className="gcard-head">
              <span className="gcard-kind">Comps</span>
              <span className="small muted">Compositions you refer to by name.</span>
            </div>
            {globals.comps.map((c) => (
              <div className="grow-row" key={c.id} data-gid={c.id}>
                <input
                  aria-label="Comp name"
                  value={c.name}
                  onChange={(e) => edit((p) => { p.globals.comps.find((x) => x.id === c.id)!.name = e.target.value; }, `comp-name:${c.id}`)}
                />
                <button className="ghost small" aria-label={`Delete comp ${c.name}`} onClick={() => edit((p) => { p.globals.comps = p.globals.comps.filter((x) => x.id !== c.id); })}>×</button>
              </div>
            ))}
            <button className="ghost small" onClick={addComp}>+ Add comp</button>
          </section>
        </div>
      </div>
    </div>
  );
}

function LayerCard({ layer: l, controls }: { layer: LayerGlobal; controls: ControlGlobal[] }) {
  const layers = useStore((s) => s.project.globals.layers);
  const set = (patch: Partial<LayerGlobal>, key?: string) =>
    edit((p) => { Object.assign(p.globals.layers.find((x) => x.id === l.id)!, patch); }, key);
  const keyOk = isValidIdentifier(l.key);
  const dupKey = layers.some((x) => x.id !== l.id && x.key === l.key);
  const remove = () =>
    edit((p) => {
      p.globals.layers = p.globals.layers.filter((x) => x.id !== l.id);
      // Controls hosted on the layer move to the GLOBALS null rather than disappearing.
      for (const c of p.globals.controls) if (typeof c.host === 'object' && c.host.layerId === l.id) c.host = 'ctrls';
    });

  return (
    <section className="gcard" data-gid={l.id} aria-label={`Layer ${l.layerName}`}>
      <div className="gcard-head">
        <span className="gcard-kind">Layer</span>
        <label>
          Name in AE
          <input value={l.layerName} onChange={(e) => set({ layerName: e.target.value }, `layer-name:${l.id}`)} />
        </label>
        <label>
          Variable
          <input
            className={keyOk && !dupKey ? '' : 'invalid'}
            value={l.key}
            onChange={(e) => set({ key: e.target.value }, `layer-key:${l.id}`)}
            title={!keyOk ? 'Not a usable variable name' : dupKey ? 'Another layer uses this variable' : undefined}
          />
        </label>
        {(!keyOk || dupKey) && (
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
        <button className="danger small" onClick={remove}>Delete layer</button>
      </div>
      <ControlList hostK={l.id} controls={controls} />
    </section>
  );
}

function ControlList({ hostK, controls }: { hostK: HostKey; controls: ControlGlobal[] }) {
  const globals = useStore((s) => s.project.globals);
  const add = (type: ControlType) =>
    edit((p) => {
      const n = p.globals.controls.filter((c) => c.type === type).length + 1;
      p.globals.controls.push({ id: newId('c'), effectName: `${CONTROLS[type].label.replace(' Control', '')} ${n}`, type, host: hostFrom(hostK) });
    });

  return (
    <div className="gcontrols">
      {controls.length === 0 && <p className="small muted">No controls yet.</p>}
      {controls.map((c) => {
        const set = (patch: Partial<ControlGlobal>, key?: string) =>
          edit((p) => { Object.assign(p.globals.controls.find((x) => x.id === c.id)!, patch); }, key);
        const dup = controls.some((x) => x.id !== c.id && x.effectName === c.effectName);
        return (
          <div className="gcontrol" key={c.id} data-gid={c.id}>
            <input
              aria-label="Effect name"
              className={dup ? 'invalid' : ''}
              title={dup ? 'Another control on this layer has the same name' : undefined}
              value={c.effectName}
              onChange={(e) => set({ effectName: e.target.value }, `control-name:${c.id}`)}
            />
            <select aria-label="Control type" value={c.type} onChange={(e) => set({ type: e.target.value as ControlType })}>
              {CONTROL_TYPES.map((t) => <option key={t} value={t}>{CONTROLS[t].label}</option>)}
            </select>
            <select aria-label="Move to layer" value={hostK} onChange={(e) => set({ host: hostFrom(e.target.value) })}>
              <option value="ctrls">on {globals.ctrls.layerName}</option>
              <option value="thisLayer">on this layer</option>
              {globals.layers.map((l) => <option key={l.id} value={l.id}>on {l.layerName}</option>)}
            </select>
            {c.type === 'dropdown' && (
              <input
                aria-label="Dropdown items"
                placeholder="Items, comma-separated"
                value={(c.dropdownItems ?? []).join(', ')}
                onChange={(e) => set({ dropdownItems: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }, `control-items:${c.id}`)}
              />
            )}
            <button className="ghost small" aria-label={`Delete control ${c.effectName}`} onClick={() => edit((p) => { p.globals.controls = p.globals.controls.filter((x) => x.id !== c.id); })}>×</button>
          </div>
        );
      })}
      <div className="gadd">
        <span className="small muted">Add control:</span>
        {CONTROL_TYPES.map((t) => (
          <button key={t} className="ghost small" onClick={() => add(t)}>{CONTROLS[t].label.replace(' Control', '')}</button>
        ))}
      </div>
    </div>
  );
}
