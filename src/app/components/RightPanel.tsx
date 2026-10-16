// Inspector + output pane, diagnostics and setup checklist (spec §12).
import { useReactFlow } from '@xyflow/react';
import { useCallback, useEffect, useState } from 'react';
import { embedGraph, PAYLOAD_WARN_BYTES, type Diagnostic, type EmbedResult } from '../../core';
import { downloadSetupScript } from '../persist';
import { useStore } from '../store';
import { useCompiled } from '../useCompiled';
import { CodeView } from './CodeView';
import { Inspector } from './Inspector';
import { Preview } from './Preview';

export function RightPanel() {
  const { graph, result } = useCompiled();
  const project = useStore((s) => s.project);
  const selectedId = useStore((s) => s.selectedNodeId);
  const rf = useReactFlow();
  const [copied, setCopied] = useState<'full' | 'clean' | null>(null);
  const [view, setView] = useState<'code' | 'preview'>('code');
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [embedded, setEmbedded] = useState<{ source: string; result: EmbedResult } | null>(null);
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  const canCopy = errors.length === 0 && !!result.code;
  const embedOn = project.settings.embedGraph;

  // The payload is compressed asynchronously; keep the last one that matches the current code.
  useEffect(() => {
    if (!embedOn || !result.code) return;
    let live = true;
    void embedGraph(project, graph, result.code).then((r) => {
      if (live) setEmbedded({ source: result.code, result: r });
    });
    return () => {
      live = false;
    };
  }, [embedOn, project, graph, result.code]);
  const payload = embedOn && embedded?.source === result.code ? embedded.result : null;

  const diagnostics: Diagnostic[] = payload?.tooLarge
    ? [...result.diagnostics, {
        code: 'PAYLOAD_TOO_LARGE', severity: 'warning',
        message: `Embedded graph is ${(payload.payloadBytes / 1024).toFixed(1)} KB (over ${PAYLOAD_WARN_BYTES / 1024} KB). Consider "Copy clean".`,
      }]
    : result.diagnostics;

  const copy = useCallback(async (clean: boolean) => {
    if (!canCopy) return;
    const text = !clean && embedOn ? (await embedGraph(project, graph, result.code)).code : result.code;
    await navigator.clipboard.writeText(text);
    setCopied(clean ? 'clean' : 'full');
    setTimeout(() => setCopied(null), 1200);
  }, [canCopy, embedOn, project, graph, result.code]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        void copy(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copy]);

  const focusNode = useCallback((nodeId: string) => {
    useStore.getState().select(nodeId);
    const n = rf.getNode(nodeId);
    if (n) rf.setCenter(n.position.x + (n.measured?.width ?? 180) / 2, n.position.y + (n.measured?.height ?? 80) / 2, { zoom: rf.getZoom(), duration: 300 });
  }, [rf]);

  // Source map, both ways: selected node → its lines; clicked line → the node that emitted it.
  const highlight = selectedId ? result.sourceMap[selectedId] ?? null : null;
  const onLineClick = useCallback((line: number) => {
    let best: [string, number] | null = null;
    for (const [id, [a, b]] of Object.entries(result.sourceMap)) {
      if (line >= a && line <= b && (!best || b - a < best[1])) best = [id, b - a];
    }
    if (best) focusNode(best[0]);
  }, [result.sourceMap, focusNode]);

  return (
    <aside className="right">
      <Inspector />

      <section className="panel output">
        <div className="panel-head">
          <div className="segmented" role="tablist" aria-label="Output view">
            <button role="tab" aria-selected={view === 'code'} onClick={() => setView('code')}>Code</button>
            <button role="tab" aria-selected={view === 'preview'} onClick={() => setView('preview')}>Preview</button>
          </div>
          <div className="btn-row">
            <button className="ghost small" onClick={() => void copy(true)} disabled={!canCopy} title="Copy without the embedded graph">
              {copied === 'clean' ? 'Copied ✓' : 'Copy clean'}
            </button>
            <button onClick={() => void copy(false)} disabled={!canCopy} title="Copy expression (Ctrl/Cmd+Shift+C)">
              {copied === 'full' ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        </div>
        {view === 'preview' ? (
          <Preview />
        ) : canCopy ? (
          <>
            <CodeView code={result.code} highlight={highlight} onLineClick={onLineClick} />
            {embedOn && (
              <p className="small muted payload-note">
                {payload
                  ? `+ embedded graph (${(payload.payloadBytes / 1024).toFixed(1)} KB) so you can paste this back to edit it`
                  : '+ embedded graph'}
              </p>
            )}
          </>
        ) : (
          <p className="muted">Fix the errors below to get an expression.</p>
        )}
      </section>

      <section className="panel">
        <h2>Diagnostics</h2>
        {diagnostics.length === 0 ? (
          <p className="muted">No problems.</p>
        ) : (
          <ul className="diags">
            {diagnostics.map((d, i) => (
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
        <div className="panel-head">
          <h2>Setup checklist</h2>
          <button
            className="ghost small"
            onClick={() => downloadSetupScript(project)}
            title="Run in AE (File › Scripts › Run Script File…) to create the null, layers and controls"
          >
            ⬇ Setup script
          </button>
        </div>
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
