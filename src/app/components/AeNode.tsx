// A node on the canvas: typed ports, inline widgets for unconnected inputs, params, global pickers.
import { Handle, Position, type NodeProps, type Node as RFNode } from '@xyflow/react';
import { memo, useState } from 'react';
import { CONTROLS, NODE_DEFS, PROPERTIES, type Literal, type NodeInstance, type NodeTypes, type ParamDef, type PortDef } from '../../core';
import { actions, useStore, activeGraph } from '../store';
import { portClass } from './ports';

export type AeNodeData = {
  types?: NodeTypes;
  connected: string[];
  status: 'ok' | 'error' | 'warning' | 'unused';
};

const DIMS: Record<string, number> = { vec2: 2, vec3: 3, color: 4 };

function AeNodeImpl({ id, data, selected }: NodeProps<RFNode<AeNodeData>>) {
  const inst = useStore((s) => activeGraph(s.project, s.graphId).nodes.find((n) => n.id === id));
  const globals = useStore((s) => s.project.globals);
  const [advanced, setAdvanced] = useState(false);
  if (!inst) return null;
  const def = NODE_DEFS.get(inst.type);
  if (!def) {
    return <div className="ae-node status-error"><div className="ae-node-head">Unknown: {inst.type}</div></div>;
  }

  const params = def.params ?? [];
  const visibleParams = params.filter((p) => advanced || !p.advanced);
  const control = def.special === 'ref.control' ? globals.controls.find((c) => c.id === inst.ref?.controlId) : undefined;
  const title = inst.name || control?.effectName || def.label;

  return (
    <div className={`ae-node cat-${def.category} status-${data.status} ${selected ? 'selected' : ''}`} title={def.description}>
      <div className="ae-node-head" style={inst.color ? { background: inst.color } : undefined}>
        <span>{title}</span>
        <span className="ae-node-meta">
          {title !== def.label && <span className="ae-node-type">{def.label}</span>}
          {inst.preview && <span className="ae-node-badge" title="Shown in the Output Preview">◉</span>}
        </span>
      </div>

      {def.special === 'ref.control' && (
        <select
          className="nodrag ref-picker"
          aria-label="Control"
          value={inst.ref?.controlId ?? ''}
          onChange={(e) => actions.setRef(id, { controlId: e.target.value })}
        >
          <option value="" disabled>Pick a control…</option>
          {globals.controls.map((c) => <option key={c.id} value={c.id}>{c.effectName} ({CONTROLS[c.type].label})</option>)}
        </select>
      )}
      {def.special === 'ref.layer' && (
        <select className="nodrag ref-picker" aria-label="Layer" value={inst.ref?.layerId ?? ''} onChange={(e) => actions.setRef(id, { layerId: e.target.value })}>
          <option value="" disabled>{globals.layers.length ? 'Pick a layer…' : 'Add a layer in Globals'}</option>
          {globals.layers.map((l) => <option key={l.id} value={l.id}>{l.layerName}</option>)}
        </select>
      )}
      {def.special === 'ref.property' && (
        <select className="nodrag ref-picker" aria-label="Property" value={inst.ref?.propertyPath ?? ''} onChange={(e) => actions.setRef(id, { propertyPath: e.target.value })}>
          <option value="" disabled>Pick a property…</option>
          {[...PROPERTIES.values()].map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}
        </select>
      )}

      {def.inputs.map((port) => {
        const type = data.types?.inputs.get(port.id) ?? port.type;
        const isConnected = data.connected.includes(port.id);
        return (
          <div className="ae-row in" key={port.id}>
            <Handle type="target" position={Position.Left} id={port.id} className={portClass(type)} title={`${port.label}: ${type}`} />
            <span className="ae-label" title={type}>{port.label}</span>
            {!isConnected && <InputWidget inst={inst} port={port} type={type} />}
          </div>
        );
      })}

      {visibleParams.map((p) => <ParamWidget key={p.id} inst={inst} param={p} />)}
      {params.some((p) => p.advanced) && (
        <button className="nodrag link" onClick={() => setAdvanced(!advanced)}>{advanced ? 'Fewer options' : 'More options'}</button>
      )}

      {def.outputs.map((o) => {
        const type = data.types?.outputs.get(o.id) ?? o.type;
        return (
          <div className="ae-row out" key={o.id}>
            <span className="ae-label" title={type}>{o.label}</span>
            <Handle type="source" position={Position.Right} id={o.id} className={portClass(type)} title={`${o.label}: ${type}`} />
          </div>
        );
      })}
    </div>
  );
}

export const AeNode = memo(AeNodeImpl);

export function InputWidget({ inst, port, type }: { inst: NodeInstance; port: PortDef; type: string }) {
  const value = inst.inputs[port.id] ?? port.default;
  const set = (v: Literal | undefined) => actions.setInput(inst.id, port.id, v);

  if (type === 'layer') return <span className="ae-default muted">{typeof value === 'string' ? value : '—'}</span>;
  if (type.startsWith('property<')) return <span className="ae-default muted">{port.optional ? 'this property' : 'connect'}</span>;
  if (value === undefined) return <span className="ae-default muted">{port.optional ? 'optional' : 'connect'}</span>;

  if (type === 'boolean') {
    return <input className="nodrag" type="checkbox" checked={value === true || value === 'true'} onChange={(e) => set(e.target.checked)} />;
  }
  if (type === 'string') {
    return <input className="nodrag w-text" value={String(value)} onChange={(e) => set(e.target.value)} />;
  }
  // Raw code defaults like `time` or `index`: editable as text, number entry replaces it.
  if (typeof value === 'string') {
    return <input className="nodrag w-code" value={value} title="Expression code" onChange={(e) => set(numberOrCode(e.target.value))} />;
  }
  const dims = DIMS[type];
  if (dims) {
    const arr = Array.isArray(value) ? value : Array(dims).fill(value as number);
    if (type === 'color') {
      const hex = '#' + arr.slice(0, 3).map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('');
      return (
        <input
          className="nodrag"
          type="color"
          value={hex}
          onChange={(e) => {
            const h = e.target.value;
            set([1, 3, 5].map((i) => Math.round((parseInt(h.slice(i, i + 2), 16) / 255) * 1000) / 1000).concat(arr[3] ?? 1));
          }}
        />
      );
    }
    return (
      <span className="vec">
        {Array.from({ length: dims }, (_, i) => (
          <input
            key={i}
            className="nodrag w-num"
            type="number"
            value={arr[i] ?? 0}
            onChange={(e) => set(arr.map((v, j) => (j === i ? Number(e.target.value) : v)))}
          />
        ))}
      </span>
    );
  }
  return (
    <input
      className="nodrag w-num"
      type="number"
      step={port.step ?? 'any'}
      min={port.min}
      max={port.max}
      value={value as number}
      onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  );
}

function numberOrCode(s: string): Literal | undefined {
  if (s.trim() === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
}

export function ParamWidget({ inst, param }: { inst: NodeInstance; param: ParamDef }) {
  const value = inst.params[param.id] ?? param.default;
  const set = (v: Literal) => actions.setParam(inst.id, param.id, v);
  let input;
  if (param.kind === 'select') {
    input = (
      <select className="nodrag" value={String(value)} onChange={(e) => set(e.target.value)}>
        {param.options!.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (param.kind === 'checkbox') {
    input = <input className="nodrag" type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} />;
  } else if (param.kind === 'number') {
    input = <input className="nodrag w-num" type="number" step="any" value={value as number} onChange={(e) => set(Number(e.target.value))} />;
  } else {
    input = <input className="nodrag w-text" value={String(value)} onChange={(e) => set(e.target.value)} />;
  }
  return (
    <label className="ae-row param">
      <span className="ae-label">{param.label}</span>
      {input}
    </label>
  );
}
