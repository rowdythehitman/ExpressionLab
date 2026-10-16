// Runs previewed expressions in a sandboxed iframe (opaque origin, no network) so code from a pasted
// expression can never reach this page's storage. The runtime is the same mockAE.js the tests use.
import runtimeSource from '../../core/runtime/mockAE.js?raw';
import type { MockContext } from '../../core/runtime/mockAE.js';

export interface EvalJob {
  code: string;
  ctx: MockContext;
  overrides?: Record<string, unknown>;
}

export type EvalResult =
  | { ok: true; value: unknown; probes: Record<string, unknown> }
  | { ok: false; error: string };

const SRCDOC = `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'">
<script>
${runtimeSource.replace(/^export /gm, '')}
const safe = (v) => {
  if (Array.isArray(v)) return v.map(safe);
  if (typeof v === 'function') return '[function]';
  if (v !== null && typeof v === 'object') return '[object]';
  return v;
};
addEventListener('message', (e) => {
  const { id, jobs } = e.data || {};
  if (!Array.isArray(jobs)) return;
  const results = jobs.map((j) => {
    try {
      const r = evaluateDetailed(j.code, j.ctx, j.overrides || {});
      const probes = {};
      for (const k in r.probes) probes[k] = safe(r.probes[k]);
      return { ok: true, value: safe(r.value), probes };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });
  parent.postMessage({ id, results }, '*');
});
parent.postMessage({ ready: true }, '*');
</script>`;

let frame: HTMLIFrameElement | null = null;
let ready: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, (r: EvalResult[]) => void>();

function ensureFrame(): Promise<void> {
  if (ready) return ready;
  ready = new Promise((resolve) => {
    frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.display = 'none';
    frame.srcdoc = SRCDOC;
    window.addEventListener('message', (e) => {
      if (!frame || e.source !== frame.contentWindow) return;
      const data = e.data as { ready?: boolean; id?: number; results?: EvalResult[] };
      if (data.ready) resolve();
      else if (data.id != null && data.results) {
        pending.get(data.id)?.(data.results);
        pending.delete(data.id);
      }
    });
    document.body.appendChild(frame);
  });
  return ready;
}

/** Evaluates jobs in the sandbox. Times out (rejects) after `timeoutMs`. */
export async function evaluateInSandbox(jobs: EvalJob[], timeoutMs = 3000): Promise<EvalResult[]> {
  await ensureFrame();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('The preview took too long (is there an endless loop?)'));
    }, timeoutMs);
    pending.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    frame!.contentWindow!.postMessage({ id, jobs }, '*');
  });
}
