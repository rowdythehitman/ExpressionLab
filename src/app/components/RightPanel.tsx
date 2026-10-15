// Inspector + output pane, diagnostics and setup checklist (spec §12).
import { useReactFlow } from '@xyflow/react';
import { useCallback, useEffect, useState } from 'react';
import { NODE_DEFS } from '../../core';
import { actions, useStore } from '../store';
import { useCompiled } from '../useCompiled';
import { CodeView } from './CodeView';

export function RightPanel() {
  const { graph, result } = useCompiled();
  const rf = useReactFlow();
  const [copied, setCopied] = useState(false);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  const canCopy = errors.length === 0 && !!result.code;

  const copy = useCallback(async () => {
    if (!canCopy) return;
    await navigator.clipboard.writeText(result.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [canCopy, result.code]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        void copy();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copy]);

  const focusNode = (nodeId: string) => {
    useStore.getState().select(nodeId);
    const n = rf.getNode(nodeId);
    if (n) rf.setCenter(n.position.x + (n.measured?.width ?? 180) / 2, n.position.y + (n.measured?.height ?? 80) / 2, { zoom: 1.1, duration: 300 });
  };

  return (
    <aside className="right">
      <Inspector />

      <section className="panel output">
        <div className="panel-head">
          <h2>Output</h2>
          <button onClick={() => void copy()} disabled={!canCopy} title="Copy expression (Ctrl/Cmd+Shift+C)">
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
        {canCopy ? <CodeView code={result.code} /> : <p className="muted">Fix the errors below to get an expression.</p>}
      </section>

      <section className="panel">
        <h2>Diagnostics</h2>
        {result.diagnostics.length === 0 ? (
          <p className="muted">No problems.</p>
        ) : (
          <ul className="diags">
            {result.diagnostics.map((d, i) => (
              <li key={i}>
                <button className={`diag ${d.severity}`} disabled={!d.nodeId} onClick={() => d.nodeId && focusNode(d.nodeId)}>
                  <code>{d.code}</code> {d.message}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Setup checklist</h2>
        <ul className="checklist">
          {result.checklist.map((c) => (
            <li key={`${graph.id}:${c.id}`}>
              <label>
                <input type="checkbox" checked={!!ticked[c.text]} onChange={(e) => setTicked({ ...ticked, [c.text]: e.target.checked })} />
                <span>{c.text}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function Inspector() {
  const selectedId = useStore((s) => s.selectedNodeId);
  const { graph } = useCompiled();
  const inst = graph.nodes.find((n) => n.id === selectedId);
  if (!inst) return null;
  const def = NODE_DEFS.get(inst.type);
  return (
    <section className="panel inspector">
      <div className="panel-head">
        <h2>{def?.label ?? inst.type}</h2>
        <button className="danger small" onClick={() => actions.removeNodes([inst.id])}>Delete</button>
      </div>
      {def && def.special !== 'output' && !def.inline && def.category !== 'context' && (
        <label className="field">
          Name <span className="muted small">(sets the variable name)</span>
          <input value={inst.name ?? ''} placeholder={def.label} onChange={(e) => actions.renameNode(inst.id, e.target.value)} />
        </label>
      )}
      {def && <p className="small">{def.description}</p>}
      {def?.verify && <p className="small muted">Check in AE: {def.verify}</p>}
    </section>
  );
}
