// After Effects actions, shown only inside the AE panel (CEP): apply the expression to the selected
// properties, take the graph target from the selected property, and load a graph back from it.
import { useState } from 'react';
import { TARGETS } from '../../core';
import { getHost, type AeHost } from '../host';
import { targetForProperty } from '../host/target';
import { actions } from '../store';

type Status = { kind: 'ok' | 'error' | 'busy'; text: string } | null;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AeBar({ canApply, getCode }: { canApply: boolean; getCode: () => Promise<string> }) {
  const host = getHost();
  const [status, setStatus] = useState<Status>(null);
  if (!host) return null;

  const run = async (busy: string, fn: (h: AeHost) => Promise<Status>) => {
    setStatus({ kind: 'busy', text: busy });
    try {
      setStatus(await fn(host));
    } catch (e) {
      setStatus({ kind: 'error', text: message(e) });
    }
  };

  const apply = () => run('Applying…', async (h) => {
    const { applied } = await h.applyExpression(await getCode());
    const failed = applied.filter((a) => a.error);
    if (failed.length) return { kind: 'error', text: failed.map((a) => `${a.property}: ${a.error}`).join('\n') };
    return { kind: 'ok', text: `Applied to ${applied.length === 1 ? applied[0]!.property : `${applied.length} properties`}` };
  });

  const takeSelected = () => run('Reading selection…', async (h) => {
    const sel = await h.getSelection();
    if (!sel.comp) return { kind: 'error', text: 'Open a composition first, then select a property in the timeline.' };
    if (!sel.property) return { kind: 'error', text: 'Select a property in the timeline (for example Position) first.' };
    const target = targetForProperty(sel.property);
    if (!target) return { kind: 'error', text: `${sel.property.name} isn't a property ExpressionLab can write expressions for yet.` };
    actions.setTarget(target);
    const label = TARGETS.get(target.id)?.label ?? target.id;
    return { kind: 'ok', text: `Target: ${label}${target.valueType ? ` (${target.valueType})` : ''}, from ${sel.property.layer.name} › ${sel.property.name}` };
  });

  const load = () => run('Reading expression…', async (h) => {
    const { property, expression } = await h.readExpression();
    if (!expression.trim()) return { kind: 'error', text: `${property} has no expression.` };
    actions.openImport(expression);
    return null;
  });

  return (
    <div className="ae-bar">
      <div className="btn-row">
        <button onClick={() => void apply()} disabled={!canApply || status?.kind === 'busy'} title="Set this expression on the selected properties in the timeline (one undo step)">
          Apply to selected
        </button>
        <button className="ghost small" onClick={() => void takeSelected()} title="Set the graph's target from the property selected in the timeline">
          Use selected property
        </button>
        <button className="ghost small" onClick={() => void load()} title="Open the graph embedded in the selected property's expression">
          Load from selected
        </button>
      </div>
      {status && (
        <p className={`small ae-status ${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>
          {status.text}
        </p>
      )}
    </div>
  );
}
