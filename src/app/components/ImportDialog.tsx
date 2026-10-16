// Paste-back (spec §8): import an expression's embedded graph as a new tab.
import { useEffect, useRef, useState } from 'react';
import { decodePayload, hasPayload, type DecodedPayload } from '../../core';
import { actions, useStore } from '../store';

type State =
  | { step: 'closed' }
  | { step: 'paste'; text: string; error?: string }
  | { step: 'confirm'; decoded: DecodedPayload };

async function decodeInto(text: string, setState: (s: State) => void): Promise<void> {
  try {
    const decoded = await decodePayload(text);
    if (!decoded) {
      setState({ step: 'paste', text, error: 'No embedded graph found. Only expressions copied from ExpressionLab (with the //@ae-nodes line) can be imported.' });
    } else if (decoded.bodyEdited) {
      setState({ step: 'confirm', decoded });
    } else {
      actions.importDecoded(decoded);
      setState({ step: 'closed' });
    }
  } catch (e) {
    setState({ step: 'paste', text, error: e instanceof Error ? e.message : String(e) });
  }
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/** Renders the Import Expression dialog and listens for pasted expressions anywhere in the app. */
export function ImportDialog() {
  const [state, setState] = useState<State>({ step: 'closed' });
  const textRef = useRef<HTMLTextAreaElement>(null);
  const request = useStore((s) => s.importRequest);
  const [lastRequest, setLastRequest] = useState(request);
  if (request !== lastRequest) {
    setLastRequest(request);
    setState({ step: 'paste', text: request.text ?? '' });
  }

  // Text handed over with the request (Load from selected) is decoded right away.
  useEffect(() => {
    if (request.text) void decodeInto(request.text, setState);
  }, [request]);

  const tryDecode = (text: string) => decodeInto(text, setState);

  // Global paste handler: an expression with a payload pasted anywhere (outside a text field) offers import.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!hasPayload(text)) return;
      e.preventDefault();
      void decodeInto(text, setState);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => {
    if (state.step === 'paste') textRef.current?.focus();
  }, [state.step]);

  if (state.step === 'closed') return null;
  const close = () => setState({ step: 'closed' });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onKeyDown={(e) => e.key === 'Escape' && close()}>
        {state.step === 'paste' ? (
          <>
            <h2 id="import-title">Import expression</h2>
            <p className="small muted">Paste an expression copied from ExpressionLab. Its graph opens as a new tab.</p>
            <textarea
              ref={textRef}
              rows={10}
              value={state.text}
              placeholder="// ExpressionLab · …&#10;…&#10;//@ae-nodes:v1:…"
              onChange={(e) => setState({ step: 'paste', text: e.target.value })}
            />
            {state.error && <p className="error-text" role="alert">{state.error}</p>}
            <div className="modal-actions">
              <button className="ghost" onClick={close}>Cancel</button>
              <button disabled={!state.text.trim()} onClick={() => void tryDecode(state.text)}>Import</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="import-title">This expression was edited by hand</h2>
            <p>
              The code no longer matches the graph embedded in it. Loading the graph discards manual edits:
              you get <strong>{state.decoded.graph.name}</strong> ({state.decoded.graph.nodes.length} nodes) as it was generated.
            </p>
            <div className="modal-actions">
              <button className="ghost" onClick={close}>Cancel</button>
              <button onClick={() => { actions.importDecoded(state.decoded); close(); }}>Load graph anyway</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
