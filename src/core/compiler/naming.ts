// Variable naming and collision handling (spec §7.3).
import { RESERVED } from '../catalog';

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function isValidIdentifier(s: string): boolean {
  return IDENT.test(s) && !RESERVED.has(s);
}

/** "Stop Motion FPS" → "stopMotionFps"; leading digit gets a "_" prefix. */
export function camelCase(label: string): string {
  const words = label.split(/[^A-Za-z0-9]+/).filter(Boolean);
  let out = words
    .map((w, i) => {
      const word = w === w.toUpperCase() ? w.toLowerCase() : w;
      const head = i === 0 ? word[0]!.toLowerCase() : word[0]!.toUpperCase();
      return head + word.slice(1);
    })
    .join('');
  if (!out) out = 'node';
  if (/^[0-9]/.test(out)) out = '_' + out;
  return out;
}

/** Keeps a label as-is when it is already a usable identifier (e.g. "CTRLS"), else camelCases it. */
export function identifierFor(label: string): string {
  return isValidIdentifier(label) ? label : camelCase(label);
}

/** Hands out unique, non-reserved names. A reserved base starts at 1 ("wiggle1"), a taken one at 2. */
export class NameAllocator {
  private taken = new Set<string>();

  isFree(name: string): boolean {
    return !RESERVED.has(name) && !this.taken.has(name);
  }

  claim(name: string): void {
    this.taken.add(name);
  }

  /** Allocates `base` (or base+N) such that every `base + suffix` in `derived` is free too. */
  allocate(base: string, derived: (b: string) => string[] = (b) => [b]): string {
    const fits = (b: string) => derived(b).every((n) => this.isFree(n));
    let candidate = base;
    if (!fits(candidate)) {
      let n = RESERVED.has(base) ? 1 : 2;
      while (!fits(`${base}${n}`)) n++;
      candidate = `${base}${n}`;
    }
    for (const n of derived(candidate)) this.taken.add(n);
    return candidate;
  }
}
