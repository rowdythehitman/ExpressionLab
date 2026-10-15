// Phase 0 shell: compiles the golden preset and shows output, diagnostics and the setup checklist.
// The node canvas, Globals strip and palette arrive in Phase 1 (spec §12).
import { useMemo, useState } from 'react';
import { APP_NAME, compile, type Project } from '../core';
import preset from '../core/presets/posterized-wiggle.json';

const project = preset as Project;

export function App() {
  const [graphId] = useState(project.graphs[0]!.id);
  const result = useMemo(() => compile(project, graphId), [graphId]);
  const [copied, setCopied] = useState(false);
  const hasErrors = result.diagnostics.some((d) => d.severity === 'error');

  const copy = async () => {
    await navigator.clipboard.writeText(result.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="app">
      <header className="topbar">
        <strong>{APP_NAME}</strong>
        <span className="muted">Preset: {project.graphs[0]!.name}</span>
      </header>
      <main className="panes">
        <section className="pane">
          <div className="pane-head">
            <h2>Output</h2>
            <button onClick={copy} disabled={hasErrors || !result.code}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="code">{result.code || '// Fix the errors to see output'}</pre>
        </section>
        <aside className="pane side">
          <h2>Diagnostics</h2>
          {result.diagnostics.length === 0 ? (
            <p className="muted">No problems.</p>
          ) : (
            <ul>
              {result.diagnostics.map((d, i) => (
                <li key={i} className={`diag ${d.severity}`}>
                  <code>{d.code}</code> {d.message}
                </li>
              ))}
            </ul>
          )}
          <h2>Setup checklist</h2>
          <ul className="checklist">
            {result.checklist.map((c) => (
              <li key={c.id}>
                <label>
                  <input type="checkbox" /> {c.text}
                </label>
              </li>
            ))}
          </ul>
        </aside>
      </main>
    </div>
  );
}
