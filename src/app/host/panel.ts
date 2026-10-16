// Start-up for the After Effects panel. CEP 11/12 run an older Chromium (88/99) than the app targets,
// so fill the gaps before anything else runs (syntax is handled by the build target, APIs here). On the web this does nothing.
import { setRawDeflate } from '../../core';

interface NodeZlib {
  deflateRawSync(b: Uint8Array): Uint8Array;
  inflateRawSync(b: Uint8Array): Uint8Array;
}
type Require = (id: string) => unknown;

function supportsDeflateRaw(): boolean {
  try {
    new CompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
}

export function setupPanel(win: Record<string, unknown> = globalThis as unknown as Record<string, unknown>): void {
  if (!win.__adobe_cep__) return;
  document.documentElement.classList.add('in-ae');
  if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, 'at', {
      configurable: true,
      writable: true,
      value(this: unknown[], i: number) {
        const n = Math.trunc(i) || 0;
        return this[n < 0 ? this.length + n : n];
      },
    });
  }
  // The project is plain JSON, so a JSON round trip is a faithful clone (structuredClone is Chrome 98+).
  if (typeof win.structuredClone !== 'function') {
    win.structuredClone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  }
  if (!supportsDeflateRaw()) {
    // The manifest enables Node (--enable-nodejs); CEP exposes its require as cep_node.require.
    const req = (win.cep_node as { require?: Require } | undefined)?.require ?? (win.require as Require | undefined);
    if (typeof req === 'function') {
      const zlib = req('zlib') as NodeZlib;
      setRawDeflate({
        deflate: async (b) => new Uint8Array(zlib.deflateRawSync(b)),
        inflate: async (b) => new Uint8Array(zlib.inflateRawSync(b)),
      });
    }
  }
}
