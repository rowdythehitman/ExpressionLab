// {{placeholder}} engine + `when` conditions (spec §5).
import type { Tpl } from '../types';

export interface TemplateScope {
  /** Rendered upstream expression or literal for an input; undefined if unresolvable. */
  input(id: string): string | undefined;
  param(id: string): string | undefined;
  local(id: string): string | undefined;
  connected(id: string): boolean;
}

export interface RenderResult {
  text: string;
  unresolved: string[];
}

/** `when` grammar: connected(id) | !connected(id) | param.id == "value" */
export function evalWhen(cond: string, scope: TemplateScope, paramRaw: (id: string) => unknown): boolean {
  const c = cond.trim();
  let m = /^(!?)connected\(\s*([A-Za-z0-9_]+)\s*\)$/.exec(c);
  if (m) return m[1] ? !scope.connected(m[2]!) : scope.connected(m[2]!);
  m = /^param\.([A-Za-z0-9_]+)\s*(==|!=)\s*"([^"]*)"$/.exec(c);
  if (m) {
    const eq = String(paramRaw(m[1]!)) === m[3];
    return m[2] === '==' ? eq : !eq;
  }
  throw new Error(`Invalid when condition: ${cond}`);
}

export function pickBranch(tpl: Tpl, scope: TemplateScope, paramRaw: (id: string) => unknown): string {
  if (typeof tpl === 'string') return tpl;
  for (const b of tpl) if (!b.when || evalWhen(b.when, scope, paramRaw)) return b.text;
  throw new Error('No template branch matched');
}

export function render(text: string, scope: TemplateScope): RenderResult {
  const unresolved: string[] = [];
  const out = text.replace(/\{\{\s*([a-z]+)\.([A-Za-z0-9_]+)\s*\}\}/g, (whole, kind: string, id: string) => {
    const v = kind === 'in' ? scope.input(id) : kind === 'param' ? scope.param(id) : kind === 'local' ? scope.local(id) : undefined;
    if (v === undefined) {
      unresolved.push(whole);
      return whole;
    }
    return v;
  });
  // Anything that still looks like a placeholder (bad kind, malformed braces) is unresolved too.
  for (const m of out.matchAll(/\{\{[^}]*\}\}/g)) if (!unresolved.includes(m[0])) unresolved.push(m[0]);
  return { text: out, unresolved };
}
