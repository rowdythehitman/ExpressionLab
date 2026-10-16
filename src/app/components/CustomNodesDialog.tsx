// User-defined nodes: a JSON editor with live validation, stored in the project (Phase 3).
import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, lineNumbers } from '@codemirror/view';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NODE_DEFS, nodeLibrary, validateCustomNode, type NodeDef } from '../../core';
import { actions, useStore } from '../store';

const TEMPLATE: NodeDef = {
  id: 'user.myNode',
  label: 'My Node',
  category: 'math',
  description: 'What the node does (shown as its tooltip).',
  tags: ['custom'],
  inputs: [{ id: 'a', label: 'A', type: 'number', default: 0 }],
  outputs: [{ id: 'out', label: 'Result', type: 'number', expr: '{{in.a}} * 2' }],
};

const pretty = (d: unknown) => JSON.stringify(d, null, 2);

function JsonEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changeRef = useRef(onChange);
  useEffect(() => { changeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          javascript(),
          oneDark,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Node definition (JSON)' }),
          EditorView.updateListener.of((u) => { if (u.docChanged) changeRef.current(u.state.doc.toString()); }),
        ],
      }),
    });
    return () => view.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; content is replaced below
  }, []);
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);
  return <div className="json-editor" ref={host} />;
}

export function CustomNodesDialog({ focusId, onClose }: { focusId?: string; onClose: () => void }) {
  const project = useStore((s) => s.project);
  const custom = useMemo(() => project.customNodes ?? [], [project.customNodes]);
  const [editing, setEditing] = useState<string | null>(focusId ?? custom[0]?.id ?? null);
  const [text, setText] = useState(() => pretty(custom.find((d) => d.id === (focusId ?? custom[0]?.id)) ?? TEMPLATE));
  const isNew = editing === null;

  const open = (id: string | null, def?: unknown) => {
    setEditing(id);
    setText(pretty(def ?? custom.find((d) => d.id === id) ?? TEMPLATE));
  };

  const { parsed, problems } = useMemo(() => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { parsed: null, problems: [`Not valid JSON: ${(e as Error).message}`] };
    }
    const others = nodeLibrary({ customNodes: custom.filter((d) => d.id !== editing) });
    return { parsed, problems: validateCustomNode(parsed, others, editing ?? undefined) };
  }, [text, custom, editing]);

  const usage = (id: string) =>
    project.graphs.reduce((n, g) => n + g.nodes.filter((x) => x.type === id).length, 0)
    + custom.reduce((n, d) => n + (d.macro?.nodes.filter((x) => x.type === id).length ?? 0), 0);

  const save = () => {
    if (problems.length) return;
    const def = parsed as NodeDef;
    actions.saveCustomNode(def, editing ?? undefined);
    setEditing(def.id);
    setText(pretty(def));
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="custom-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="panel-head">
          <h2 id="custom-title">Custom nodes</h2>
          <button className="ghost small" onClick={onClose} aria-label="Close">Done</button>
        </div>
        <div className="custom-layout">
          <nav className="custom-list" aria-label="Custom nodes">
            {custom.map((d) => (
              <button key={d.id} className={`custom-item ${d.id === editing ? 'sel' : ''}`} onClick={() => open(d.id)}>
                <span>{d.label}{d.macro && <span className="chip-cat">macro</span>}</span>
                <span className="muted small">{d.id}</span>
              </button>
            ))}
            {custom.length === 0 && <p className="muted small">No custom nodes yet.</p>}
            <button className="ghost small" onClick={() => open(null)}>+ New node</button>
            <label className="small">
              Start from a built-in
              <select value="" onChange={(e) => {
                const b = NODE_DEFS.get(e.target.value);
                if (b) open(null, { ...structuredClone(b), id: `user.${b.id.replace(/^[^.]*\./, '')}`, label: `${b.label} (custom)` });
              }}>
                <option value="" disabled>Copy…</option>
                {[...NODE_DEFS.values()].filter((d) => !d.special || d.special === 'literal').map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
          </nav>
          <div className="custom-editor">
            <JsonEditor value={text} onChange={setText} />
            {problems.length ? (
              <ul className="custom-problems" role="alert">
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            ) : (
              <p className="small ok-text">Valid. Save to add it to the palette.</p>
            )}
            <div className="modal-actions">
              {!isNew && (
                <button
                  className="danger small"
                  onClick={() => {
                    const n = usage(editing!);
                    if (n && !window.confirm(`${n} node(s) use this. Delete anyway? They'll show as unknown until you restore it (Undo).`)) return;
                    actions.deleteCustomNode(editing!);
                    open(custom.find((d) => d.id !== editing)?.id ?? null);
                  }}
                >
                  Delete
                </button>
              )}
              <button disabled={problems.length > 0} onClick={save}>{isNew ? 'Add node' : 'Save'}</button>
            </div>
            <details className="small muted">
              <summary>How templates work</summary>
              <p>
                <code>{'{{in.id}}'}</code> is an input (its wire, or its default), <code>{'{{param.id}}'}</code> a setting,
                {' '}<code>{'{{local.id}}'}</code> a temporary variable listed in <code>locals</code>. A template can be a list of
                {' '}<code>{'{ "when": …, "text": … }'}</code> branches; the last has no <code>when</code>. Conditions:
                {' '}<code>connected(id)</code>, <code>param.id == "x"</code>, <code>type.T == "vec2"</code>, joined with
                {' '}<code>&amp;&amp;</code> / <code>||</code>. Types: number, vec2, vec3, color, string, boolean, layer, or the generics
                {' '}<code>T</code> (declare it in <code>generics</code>) and <code>V</code> (the target's type).
              </p>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
