// Output Preview: runs the expression with the mock AE runtime (in a sandbox) so you can scrub time,
// change inputs and watch the result. Nodes with "Add to Previewer" get a row showing their live value
// and a control: time/value use the scrubbers, controls get their preview value, literals edit the
// node, anything else can be overridden.
import { useEffect, useMemo, useRef, useState } from 'react';
import { compile, NODE_DEFS, type NodeInstance } from '../../core';
import { buildContext, defaultPropertyValue, formatValue, parseValue, targetType } from '../preview/context';
import { evaluateInSandbox, type EvalJob, type EvalResult } from '../preview/sandbox';
import { actions, useStore } from '../store';
import { useCompiled } from '../useCompiled';
import { ParamWidget } from './AeNode';
import { CurveChart, type CurvePoint } from './CurveChart';

const SAMPLES = 120;
const FPS = 25;

interface Override { on: boolean; text: string }

export function Preview() {
  const { graph, analysis, result } = useCompiled();
  const project = useStore((s) => s.project);
  const vt = targetType(graph);

  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(5);
  const [playing, setPlaying] = useState(false);
  const [valueText, setValueText] = useState<string | null>(null);
  const [markersText, setMarkersText] = useState('1, 3');
  const [textIndex, setTextIndex] = useState(1);
  const [textTotal, setTextTotal] = useState(10);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});

  const tagged = graph.nodes.filter((n) => n.preview);
  const usesMarkers = graph.nodes.some((n) => NODE_DEFS.get(n.type)?.category === 'marker');
  const usesText = graph.target.id === 'textSelectorAmount';
  const defaultValue = useMemo(() => defaultPropertyValue(graph, vt), [graph, vt]);
  const value = valueText == null ? defaultValue : parseValue(valueText, vt);

  // Instrumented compile: probe tagged nodes, substitute enabled overrides.
  const overrideKeys = useMemo(
    () => new Set(Object.entries(overrides).filter(([, o]) => o.on).map(([k]) => k)),
    [overrides],
  );
  const preview = useMemo(
    () => compile(project, graph.id, { preview: { probes: new Set(tagged.map((n) => n.id)), overrides: overrideKeys } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tagged` derives from project
    [project, graph.id, overrideKeys],
  );
  const overrideValues = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [k, o] of Object.entries(overrides)) {
      if (!o.on) continue;
      const [nodeId, port] = k.split(':');
      out[k] = parseValue(o.text, analysis.types.get(nodeId!)?.outputs.get(port!) ?? 'number');
    }
    return out;
  }, [overrides, analysis]);

  const ctxAt = (t: number) => buildContext(project, {
    time: t,
    value,
    markers: markersText.split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite),
    textIndex,
    textTotal,
  });

  // Evaluate the current frame.
  const [now, setNow] = useState<EvalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctxKey = JSON.stringify([value, markersText, textIndex, textTotal, project.globals, overrideValues]);
  useEffect(() => {
    if (!preview.code) return;
    let live = true;
    const job: EvalJob = { code: preview.code, ctx: ctxAt(time), overrides: overrideValues };
    evaluateInSandbox([job]).then((r) => {
      if (!live) return;
      setNow(r[0]!);
      setError(null);
    }, (e: Error) => live && setError(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctxKey captures the context inputs
  }, [preview.code, time, ctxKey]);

  // Sample the curve when anything but time changes.
  const [curve, setCurve] = useState<CurvePoint[]>([]);
  useEffect(() => {
    if (!preview.code) return;
    let live = true;
    const ts = Array.from({ length: SAMPLES + 1 }, (_, i) => (i / SAMPLES) * duration);
    const jobs = ts.map((t) => ({ code: preview.code, ctx: ctxAt(t), overrides: overrideValues }));
    evaluateInSandbox(jobs).then((rs) => {
      if (!live) return;
      setCurve(rs.map((r, i) => ({ t: ts[i]!, v: r.ok ? toNumbers(r.value) : null })));
    }, () => live && setCurve([]));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctxKey captures the context inputs
  }, [preview.code, duration, ctxKey]);

  // Play: advance time in real time, looping.
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = (ts: number) => {
      const dt = last.current == null ? 0 : (ts - last.current) / 1000;
      last.current = ts;
      setTime((t) => (t + dt) % duration);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); last.current = null; };
  }, [playing, duration]);

  if (!result.code) return <p className="muted">Fix the errors below to preview the expression.</p>;

  return (
    <div className="preview">
      <div className="preview-result" aria-live="polite">
        <span className="muted small">Output at {time.toFixed(2)}s</span>
        <output className="preview-value">
          {error ? '—' : now ? (now.ok ? formatValue(now.value) : '—') : '…'}
        </output>
        {(error || (now && !now.ok)) && (
          <p className="error-text small">Preview can't run this: {error ?? (now as { error: string }).error}</p>
        )}
      </div>

      <div className="preview-row">
        <button className="ghost small" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <label className="grow">
          <span className="sr-only">Time</span>
          <input
            type="range"
            aria-label="Time"
            min={0}
            max={duration}
            step={1 / FPS}
            value={time}
            onChange={(e) => setTime(Number(e.target.value))}
          />
        </label>
        <input className="w-num" type="number" aria-label="Time (seconds)" step={0.04} min={0} value={Number(time.toFixed(2))} onChange={(e) => setTime(Number(e.target.value) || 0)} />
        <span className="muted small">of</span>
        <input className="w-num" type="number" aria-label="Preview duration (seconds)" min={0.5} step={0.5} value={duration} onChange={(e) => setDuration(Math.max(0.5, Number(e.target.value) || 5))} />
        <span className="muted small">s</span>
      </div>

      <CurveChart points={curve} duration={duration} time={time} isColor={vt === 'color'} onScrub={setTime} />

      <div className="preview-grid">
        <label>
          Property value <span className="muted small">(value)</span>
          <input value={valueText ?? formatPlain(defaultValue)} onChange={(e) => setValueText(e.target.value)} />
        </label>
        {usesMarkers && (
          <label>
            Marker times (s)
            <input value={markersText} onChange={(e) => setMarkersText(e.target.value)} />
          </label>
        )}
        {usesText && (
          <>
            <label>textIndex <input type="number" min={1} value={textIndex} onChange={(e) => setTextIndex(Number(e.target.value) || 1)} /></label>
            <label>textTotal <input type="number" min={1} value={textTotal} onChange={(e) => setTextTotal(Number(e.target.value) || 1)} /></label>
          </>
        )}
      </div>

      <h3>Previewed nodes</h3>
      {tagged.length === 0 ? (
        <p className="muted small">Select a node and tick <strong>Add to Previewer</strong> in the inspector to watch its value and adjust it here.</p>
      ) : (
        <ul className="preview-nodes">
          {tagged.map((n) => (
            <PreviewNodeRow
              key={n.id}
              node={n}
              probes={now?.ok ? now.probes : {}}
              live={n.id in result.variables}
              overrides={overrides}
              setOverride={(k, o) => setOverrides({ ...overrides, [k]: o })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PreviewNodeRow({ node, probes, live, overrides, setOverride }: {
  node: NodeInstance;
  probes: Record<string, unknown>;
  live: boolean;
  overrides: Record<string, Override>;
  setOverride: (key: string, o: Override) => void;
}) {
  const project = useStore((s) => s.project);
  const def = NODE_DEFS.get(node.type);
  if (!def) return null;
  const control = def.special === 'ref.control' ? project.globals.controls.find((c) => c.id === node.ref?.controlId) : undefined;
  const title = node.name || control?.effectName || def.label;

  let controlUi: React.ReactNode = null;
  if (def.id === 'ctx.time') controlUi = <span className="muted small">Use the time slider above</span>;
  else if (def.id === 'ctx.value') controlUi = <span className="muted small">Set “Property value” above</span>;
  else if (control) {
    const v = control.previewValue;
    controlUi = (
      <label className="small">
        Preview value
        <input
          aria-label={`${title} preview value`}
          placeholder={formatPlain(probes[`${node.id}:out`] ?? '')}
          defaultValue={v === undefined ? '' : formatPlain(v)}
          onChange={(e) => {
            const parsed = e.target.value.trim() === '' ? undefined : parseValue(e.target.value, Array.isArray(v) ? 'vec' : 'number');
            useStore.getState().update((p) => {
              const c = p.globals.controls.find((x) => x.id === control.id);
              if (!c) return;
              if (parsed === undefined) delete c.previewValue;
              else c.previewValue = parsed as number | number[];
            }, `preview-value:${control.id}`);
          }}
        />
      </label>
    );
  } else if (def.special === 'literal') {
    controlUi = <div className="preview-params">{(def.params ?? []).map((p) => <ParamWidget key={p.id} inst={node} param={p} />)}</div>;
  }

  return (
    <li className="preview-node">
      <div className="preview-node-head">
        <span className="swatch" style={{ background: node.color ?? 'var(--border)' }} aria-hidden />
        <strong>{title}</strong>
        <button className="ghost small" aria-label={`Remove ${title} from the previewer`} onClick={() => actions.setPreview(node.id, false)}>×</button>
      </div>
      {!live ? (
        <p className="muted small">Not connected to the output, so it isn't evaluated.</p>
      ) : (
        def.outputs.map((o) => {
          const key = `${node.id}:${o.id}`;
          const ov = overrides[key] ?? { on: false, text: '' };
          const canOverride = !controlUi && def.id !== 'ctx.time' && def.id !== 'ctx.value';
          return (
            <div className="preview-out" key={o.id}>
              <span className="muted small">{def.outputs.length > 1 ? o.label : 'Value'}</span>
              <code>{formatValue(probes[key])}</code>
              {canOverride && (
                <span className="preview-override">
                  <label className="small">
                    <input
                      type="checkbox"
                      checked={ov.on}
                      onChange={(e) => setOverride(key, { on: e.target.checked, text: ov.text || formatPlain(probes[key] ?? '') })}
                    />
                    Override
                  </label>
                  {ov.on && (
                    <input aria-label={`${title} ${o.label} override`} value={ov.text} onChange={(e) => setOverride(key, { on: true, text: e.target.value })} />
                  )}
                </span>
              )}
            </div>
          );
        })
      )}
      {controlUi}
    </li>
  );
}

function toNumbers(v: unknown): number[] | null {
  if (typeof v === 'number') return [v];
  if (typeof v === 'boolean') return [v ? 1 : 0];
  if (Array.isArray(v) && v.every((x) => typeof x === 'number')) return v as number[];
  return null;
}

function formatPlain(v: unknown): string {
  return Array.isArray(v) ? v.map((x) => formatValue(x)).join(', ') : typeof v === 'string' ? v : formatValue(v);
}
