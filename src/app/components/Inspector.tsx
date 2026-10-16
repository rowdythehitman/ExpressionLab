// Inspector for the selected node(s): variable name (with the identifier actually emitted), colour,
// Output Preview toggle, every input and setting at full size, and node actions.
import { CONTROLS, camelCase, type ControlGlobal, type NodeDef, type NodeInstance } from '../../core';
import { actions, useDefs, useStore } from '../store';
import { useCompiled } from '../useCompiled';
import { useState } from 'react';
import { InputWidget, ParamWidget } from './AeNode';
import { CATEGORY_LABEL } from './ports';

/** Header colours that keep the light title text readable. */
const COLOURS = ['#7a2e3a', '#8a4b1f', '#6b5a1e', '#2d5a32', '#1f5a5e', '#2f4b7e', '#4f3d7e', '#6e3a6b'];

export function Inspector() {
  const selection = useStore((s) => s.selection);
  const selectedId = useStore((s) => s.selectedNodeId);
  const { graph, result, analysis } = useCompiled();
  const controls = useStore((s) => s.project.globals.controls);
  const defs = useDefs();

  if (selection.length > 1) {
    return (
      <section className="panel inspector" aria-label="Inspector">
        <div className="panel-head">
          <h2>{selection.length} nodes selected</h2>
        </div>
        <p className="small muted">
          Copy <kbd>Ctrl/Cmd+C</kbd>, cut <kbd>Ctrl/Cmd+X</kbd>, paste <kbd>Ctrl/Cmd+V</kbd> (at the mouse), duplicate <kbd>Ctrl/Cmd+D</kbd>.
        </p>
        <div className="btn-row">
          <button className="ghost small" onClick={() => actions.duplicateSelection()}>Duplicate</button>
          <button className="danger small" onClick={() => actions.removeNodes(selection)}>Delete</button>
        </div>
        <MakeMacro />
      </section>
    );
  }

  const inst = graph.nodes.find((n) => n.id === selectedId);
  if (!inst) return null;
  const def = defs.get(inst.type);
  if (!def) return null;
  const isOutput = def.special === 'output';
  const control = def.special === 'ref.control' ? controls.find((c) => c.id === inst.ref?.controlId) : undefined;
  const types = analysis.types.get(inst.id);
  const makesVariable = !isOutput && !def.inline && def.category !== 'context';
  const emitted = result.variables[inst.id];
  const live = inst.id in result.variables;
  const typed = inst.name || control?.effectName || def.label;
  const adjusted = emitted?.length === 1 && emitted[0] !== camelCase(typed);

  return (
    <section className="panel inspector" aria-label="Inspector">
      <div className="panel-head">
        <h2>
          {def.label} <span className="chip-cat">{CATEGORY_LABEL[def.category]}</span>
        </h2>
        <div className="btn-row">
          {!isOutput && <button className="ghost small" onClick={() => actions.duplicateSelection()} title="Ctrl/Cmd+D">Duplicate</button>}
          <button className="danger small" onClick={() => actions.removeNodes([inst.id])}>Delete</button>
        </div>
      </div>
      <p className="small">{def.description}</p>
      {def.id.startsWith('user.') && (
        <div className="btn-row">
          {def.macro && <button className="ghost small" onClick={() => actions.ungroupMacro(inst.id)} title="Put the macro's nodes back on the canvas">Ungroup</button>}
          <button className="ghost small" onClick={() => useStore.setState({ customDialog: { focusId: def.id } })}>
            Edit {def.macro ? 'macro' : 'node'} definition
          </button>
        </div>
      )}

      {!isOutput && (
        <div className="field">
          <label htmlFor="node-name-field">Name</label>
          <input
            id="node-name-field"
            value={inst.name ?? ''}
            placeholder={control?.effectName || def.label}
            onChange={(e) => actions.renameNode(inst.id, e.target.value)}
            aria-describedby="var-help"
          />
          <span id="var-help" className="small muted">
            {!makesVariable ? 'Shown on the node. This node is written inline, so the name doesn\'t appear in the code.'
              : !live ? 'Shown on the node, and used as the variable name once it\'s connected to the output.'
              : !emitted?.length ? 'Shown on the node. It\'s folded into the expression that uses it (no variable).'
              : <>Shown on the node and used as the variable name: {emitted.map((v) => <code key={v}>{v}</code>)}{adjusted && ' (adjusted: reserved word or already taken)'}.</>}
          </span>
        </div>
      )}

      {!isOutput && (
        <div className="field">
          <span>Colour</span>
          <div className="swatches" role="radiogroup" aria-label="Node colour">
            <button
              role="radio"
              aria-checked={!inst.color}
              className={`swatch-btn default cat-${def.category}`}
              title="Category colour"
              onClick={() => actions.setNodeColor(inst.id, undefined)}
            />
            {COLOURS.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={inst.color === c}
                aria-label={c}
                className="swatch-btn"
                style={{ background: c }}
                onClick={() => actions.setNodeColor(inst.id, c)}
              />
            ))}
            <input
              type="color"
              aria-label="Custom colour"
              value={inst.color && /^#[0-9a-f]{6}$/i.test(inst.color) ? inst.color : '#444a58'}
              onChange={(e) => actions.setNodeColor(inst.id, e.target.value)}
            />
          </div>
        </div>
      )}

      {!isOutput && (
        <label className="toggle field-inline">
          <input type="checkbox" checked={!!inst.preview} onChange={(e) => actions.setPreview(inst.id, e.target.checked)} />
          Add to Previewer
          <span className="small muted">(watch and adjust its value in Output → Preview)</span>
        </label>
      )}

      {def.inputs.length > 0 && <h3>Inputs</h3>}
      {def.inputs.map((port) => {
        const type = types?.inputs.get(port.id) ?? port.type;
        const edge = graph.edges.find((e) => e.to.node === inst.id && e.to.port === port.id);
        return (
          <div className="insp-row" key={port.id}>
            <span>{port.label} <span className="type-chip">{type}</span></span>
            {edge ? <span className="small muted">← {sourceLabel(defs, graph.nodes, controls, edge.from.node, edge.from.port)}</span> : <InputWidget inst={inst} port={port} type={type} />}
          </div>
        );
      })}
      {(def.params ?? []).length > 0 && <h3>Settings</h3>}
      {(def.params ?? []).map((p) => <ParamWidget key={p.id} inst={inst} param={p} />)}

      {def.outputs.length > 0 && (
        <>
          <h3>Outputs</h3>
          {def.outputs.map((o) => (
            <div className="insp-row" key={o.id}>
              <span>{o.label}</span>
              <span className="type-chip">{types?.outputs.get(o.id) ?? o.type}</span>
            </div>
          ))}
        </>
      )}
      {control && <p className="small muted">Reads {CONTROLS[control.type].label} “{control.effectName}”.</p>}
      {def.verify && <p className="small muted">Check in AE: {def.verify}</p>}
    </section>
  );
}

/** Selected nodes → one reusable macro node. */
function MakeMacro() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="make-macro"
      onSubmit={(e) => {
        e.preventDefault();
        setError(actions.makeMacroFromSelection(name.trim() || 'Macro'));
      }}
    >
      <label htmlFor="macro-name" className="small">Make a reusable node from the selection</label>
      <div className="btn-row">
        <input id="macro-name" placeholder="Macro name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="small">Make macro</button>
      </div>
      {error && <p className="error-text small" role="alert">{error}</p>}
    </form>
  );
}

/** "Wiggle Freq" for a control, "Text Box › Center" for a multi-output node. */
function sourceLabel(defs: ReadonlyMap<string, NodeDef>, nodes: NodeInstance[], controls: ControlGlobal[], nodeId: string, port: string): string {
  const n = nodes.find((x) => x.id === nodeId);
  const d = n && defs.get(n.type);
  if (!n || !d) return nodeId;
  const control = d.special === 'ref.control' ? controls.find((c) => c.id === n.ref?.controlId) : undefined;
  const out = d.outputs.length > 1 ? ` › ${d.outputs.find((o) => o.id === port)?.label ?? port}` : '';
  return `${n.name || control?.effectName || d.label}${out}`;
}
