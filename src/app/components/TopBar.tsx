import { useRef, useState } from 'react';
import { APP_NAME, TARGETS, type Settings, type ValueType } from '../../core';
import { buildGlobalsReport, getHost } from '../host';
import { PRESETS } from '../../core/presets';
import { downloadSetupScript, exportProject, parseProjectFile } from '../persist';
import { actions, useGraph, useStore } from '../store';

/** Targets with 2D/3D variants are shown once, with a 3D toggle (spec §12). */
const BASE_TARGETS = [...TARGETS.values()]
  .filter((t) => !t.id.endsWith('3D'))
  .map((t) => ({ id: t.id.replace(/2D$/, ''), label: t.label.replace(' (2D)', ''), has3D: t.id.endsWith('2D') }));

function splitTarget(id: string) {
  const m = /^(.*)(2D|3D)$/.exec(id);
  return m ? { base: m[1]!, is3D: m[2] === '3D' } : { base: id, is3D: false };
}

export function TopBar() {
  const graph = useGraph();
  const project = useStore((s) => s.project);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileMenu = useRef<HTMLDetailsElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { base, is3D } = splitTarget(graph.target.id);
  const baseDef = BASE_TARGETS.find((t) => t.id === base);
  const targetDef = TARGETS.get(graph.target.id);

  const setBase = (b: string) => {
    const def = BASE_TARGETS.find((t) => t.id === b)!;
    const id = def.has3D ? `${b}${is3D ? '3D' : '2D'}` : b;
    const t = TARGETS.get(id)!;
    actions.setTarget(t.valueType ? { id } : { id, valueType: t.allowedValueTypes![0] });
  };

  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    useStore.getState().update((p) => {
      p.settings[key] = value;
    });

  const host = getHost();
  const buildGlobals = async () => setNotice((await buildGlobalsReport(host!, project)).text);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      useStore.getState().replaceProject(parseProjectFile(await file.text()));
      setNotice(`Imported ${file.name}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <header className="topbar">
      <strong className="brand">{APP_NAME}</strong>
      <input
        className="graph-name"
        aria-label="Expression name"
        value={graph.name}
        onChange={(e) => actions.renameGraph(e.target.value)}
      />

      <label className="target">
        <span className="muted">Apply to</span>
        <select aria-label="Target property" value={base} onChange={(e) => setBase(e.target.value)}>
          {BASE_TARGETS.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </label>
      {baseDef?.has3D && (
        <label className="toggle" title="3D layer: the property has x, y and z">
          <input
            type="checkbox"
            checked={is3D}
            onChange={(e) => actions.setTarget({ id: `${base}${e.target.checked ? '3D' : '2D'}` })}
          />
          3D layer
        </label>
      )}
      {targetDef && !targetDef.valueType && (
        <select
          aria-label="Value type"
          value={graph.target.valueType}
          onChange={(e) => actions.setTarget({ id: graph.target.id, valueType: e.target.value as ValueType })}
        >
          {targetDef.allowedValueTypes!.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      )}

      <div className="spacer" />
      {notice && (
        <button className="notice" onClick={() => setNotice(null)} title="Dismiss">
          {notice} ×
        </button>
      )}

      <button className="ghost" disabled={!canUndo} onClick={() => useStore.getState().undo()} title="Undo (Ctrl/Cmd+Z)">Undo</button>
      <button className="ghost" disabled={!canRedo} onClick={() => useStore.getState().redo()} title="Redo (Ctrl/Cmd+Shift+Z)">Redo</button>

      <select
        aria-label="Presets"
        value=""
        onChange={(e) => {
          const p = PRESETS.find((x) => x.id === e.target.value);
          if (p) useStore.getState().replaceProject(structuredClone(p.project));
        }}
      >
        <option value="" disabled>Presets…</option>
        {[...new Set(PRESETS.map((p) => p.group))].map((g) => (
          <optgroup key={g} label={g}>
            {PRESETS.filter((p) => p.group === g).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </optgroup>
        ))}
      </select>

      <button className="ghost" onClick={() => useStore.setState({ customDialog: {} })} title="Create and edit your own nodes">★ Custom nodes</button>
      <details className="menu" ref={fileMenu}>
        <summary>File</summary>
        <div className="menu-body menu-list" onClick={() => fileMenu.current?.removeAttribute('open')}>
          <button className="ghost" onClick={() => fileRef.current?.click()} title="Open a .aenodes.json project">Open project…</button>
          <button className="ghost" onClick={() => exportProject(project)} title="Save the project as .aenodes.json">Save project</button>
          <button className="ghost" onClick={() => actions.openImport()} title="Paste an expression copied from ExpressionLab to edit its graph">Paste expression…</button>
          {host && (
            <button className="ghost" onClick={() => void buildGlobals()} title="Creates the GLOBALS null, layers and controls in the active comp">
              Build Globals
            </button>
          )}
          <button className="ghost" onClick={() => downloadSetupScript(project)} title="Creates the GLOBALS null, layers and controls in your comp">AE setup script (.jsx)</button>
        </div>
      </details>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => void onImport(e.target.files?.[0])} />

      <details className="menu">
        <summary>Settings</summary>
        <div className="menu-body">
          <label>
            Comments
            <select value={project.settings.comments} onChange={(e) => setSetting('comments', e.target.value as Settings['comments'])}>
              <option value="none">none</option>
              <option value="minimal">minimal</option>
              <option value="verbose">verbose</option>
            </select>
          </label>
          <label title="Use match names like &quot;ADBE Slider Control-0001&quot; so expressions work in non-English AE">
            <input type="checkbox" checked={project.settings.useMatchNames} onChange={(e) => setSetting('useMatchNames', e.target.checked)} />
            Use match names (non-English AE)
          </label>
          <label title="Adds a //@ae-nodes line so the expression can be pasted back into the app and edited">
            <input type="checkbox" checked={project.settings.embedGraph} onChange={(e) => setSetting('embedGraph', e.target.checked)} />
            Embed graph in output
          </label>
          <label title="Fold single-use values into the expression that uses them instead of naming each one">
            <input type="checkbox" checked={!!project.settings.inlineSingleUse} onChange={(e) => setSetting('inlineSingleUse', e.target.checked)} />
            Inline single-use values
          </label>
          <label>
            AE version
            <input
              type="number"
              min={16}
              max={40}
              value={project.settings.aeTarget}
              onChange={(e) => setSetting('aeTarget', Number(e.target.value) || 26)}
            />
          </label>
          <p className="muted small">
            Node patterns partly inspired by <a href="https://aereference.com/expressions" target="_blank" rel="noreferrer">aereference.com</a>.
          </p>
        </div>
      </details>
    </header>
  );
}
