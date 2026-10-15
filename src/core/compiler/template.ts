// {{placeholder}} engine + `when` conditions (spec §5).
import type { Tpl } from '../types';

/** What a `when` condition can ask about. */
export interface WhenContext {
  connected(inputId: string): boolean;
  /** Raw param value (not quoted). */
  param(id: string): unknown;
  /** Resolved type of a generic ('T', 'V') or of an input port; undefined if unknown. */
  type(name: string): string | undefined;
}

export interface TemplateScope extends WhenContext {
  /** Rendered upstream expression or literal for an input; undefined if unresolvable. */
  input(id: string): string | undefined;
  /** Rendered param value (quoted when emit: 'string'). */
  paramText(id: string): string | undefined;
  local(id: string): string | undefined;
  /** Node reference data, e.g. {{ref.path}} for ref.property. */
  ref(id: string): string | undefined;
}

export interface RenderResult {
  text: string;
  unresolved: string[];
}

/**
 * `when` grammar (spec §5, extended):
 *   expr := and ('||' and)* ;  and := atom ('&&' atom)*
 *   atom := connected(id) | !connected(id) | param.id ==|!= "v" | type.X ==|!= "v"
 */
export function evalWhen(cond: string, ctx: WhenContext): boolean {
  return cond.split('||').some((conj) => conj.split('&&').every((atom) => evalAtom(atom.trim(), ctx)));
}

function evalAtom(c: string, ctx: WhenContext): boolean {
  let m = /^(!?)connected\(\s*([A-Za-z0-9_]+)\s*\)$/.exec(c);
  if (m) return m[1] ? !ctx.connected(m[2]!) : ctx.connected(m[2]!);
  m = /^(param|type)\.([A-Za-z0-9_]+)\s*(==|!=)\s*"([^"]*)"$/.exec(c);
  if (m) {
    const actual = m[1] === 'param' ? ctx.param(m[2]!) : ctx.type(m[2]!);
    const eq = String(actual) === m[4];
    return m[3] === '==' ? eq : !eq;
  }
  throw new Error(`Invalid when condition: ${c}`);
}

/** Checks a condition's syntax without evaluating it against a node (used by tests). */
export function isValidWhen(cond: string): boolean {
  try {
    evalWhen(cond, { connected: () => false, param: () => '', type: () => '' });
    return true;
  } catch {
    return false;
  }
}

export function pickBranch(tpl: Tpl, ctx: WhenContext): string {
  if (typeof tpl === 'string') return tpl;
  for (const b of tpl) if (!b.when || evalWhen(b.when, ctx)) return b.text;
  throw new Error('No template branch matched');
}

/**
 * True when `expr` can't be dropped into an operator position as-is: it has an operator, comma,
 * arrow or space at bracket depth 0 (outside strings), or is a negative literal.
 */
export function needsParens(expr: string): boolean {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]!;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0 && ' +-*/%<>=!&|?:,;'.includes(c)) return true;
  }
  return false;
}

/** A placeholder whose neighbours are `(`/`,`/`[`/`?`/`:`/`=` before and `)`/`,`/`]`/`:`/`;` after needs no parens. */
function isSafeSlot(text: string, start: number, end: number): boolean {
  let i = start - 1;
  while (i >= 0 && text[i] === ' ') i--;
  let j = end;
  while (j < text.length && text[j] === ' ') j++;
  const before = i < 0 ? '' : text[i]!;
  const after = j >= text.length ? '' : text[j]!;
  const beforeOk = before === '' || '(,[?:'.includes(before) || (before === '=' && !'=!<>'.includes(text[i - 1] ?? ''));
  const afterOk = after === '' || '),]:;'.includes(after);
  return beforeOk && afterOk;
}

export function render(text: string, scope: TemplateScope): RenderResult {
  const unresolved: string[] = [];
  const out = text.replace(/\{\{\s*([a-z]+)\.([A-Za-z0-9_]+)\s*\}\}/g, (whole, kind: string, id: string, offset: number) => {
    const v =
      kind === 'in' ? scope.input(id)
      : kind === 'param' ? scope.paramText(id)
      : kind === 'local' ? scope.local(id)
      : kind === 'ref' ? scope.ref(id)
      : undefined;
    if (v === undefined) {
      unresolved.push(whole);
      return whole;
    }
    // Upstream expressions and raw-code literals keep their meaning wherever they land.
    if (kind === 'in' && needsParens(v) && !isSafeSlot(text, offset, offset + whole.length)) return `(${v})`;
    return v;
  });
  // Anything that still looks like a placeholder (bad kind, malformed braces) is unresolved too.
  for (const m of out.matchAll(/\{\{[^}]*\}\}/g)) if (!unresolved.includes(m[0])) unresolved.push(m[0]);
  return { text: out, unresolved };
}
