// The node library for a project: built-in nodes plus the project's user-defined nodes and macros.
import { isValidWhen } from './compiler/template';
import { NODE_DEFS } from './nodes';
import { nodeDefSchema } from './schema';
import type { NodeDef, Project, Tpl } from './types';

export const CUSTOM_PREFIX = 'user.';

/** Built-ins win: a custom node can't replace a built-in id. */
export function nodeLibrary(project: Pick<Project, 'customNodes'>): ReadonlyMap<string, NodeDef> {
  if (!project.customNodes?.length) return NODE_DEFS;
  const m = new Map(NODE_DEFS);
  for (const d of project.customNodes) if (!m.has(d.id)) m.set(d.id, d);
  return m;
}

const PLACEHOLDER = /\{\{\s*([a-z]+)\.([A-Za-z0-9_]+)\s*\}\}/g;

function texts(t: Tpl): Array<{ when?: string; text: string }> {
  return typeof t === 'string' ? [{ text: t }] : t;
}

/**
 * Validates a user-defined node: schema, id rules, and that every placeholder and `when` condition refers to
 * something the node declares. Returns human-readable problems (empty = valid).
 */
export function validateCustomNode(raw: unknown, others: ReadonlyMap<string, NodeDef>, editingId?: string): string[] {
  const parsed = nodeDefSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => `${i.path.join('.') || 'node'}: ${i.message}`);
  }
  const d = parsed.data as NodeDef;
  const problems: string[] = [];
  if (!d.id.startsWith(CUSTOM_PREFIX)) problems.push(`id must start with "${CUSTOM_PREFIX}" (e.g. "user.${d.id.replace(/^.*\./, '')}")`);
  if (!/^user(\.[A-Za-z0-9_-]+)+$/.test(d.id)) problems.push('id may only use letters, numbers, "_", "-" and dots');
  if (d.id !== editingId && others.has(d.id)) problems.push(`id "${d.id}" is already used`);
  if (d.special && d.special !== 'literal') problems.push(`special "${d.special}" isn't available for custom nodes`);
  if (!d.macro && !d.outputs.length && !d.statements?.length) problems.push('a node needs at least one output or statement');

  const ids = (xs: { id: string }[] | undefined) => new Set((xs ?? []).map((x) => x.id));
  const inputs = ids(d.inputs);
  const params = ids(d.params);
  const locals = new Set(d.locals ?? []);
  const all = [...d.outputs.map((o) => o.expr), ...(d.statements ?? [])];
  if (!d.macro) {
    for (const tpl of all) {
      for (const b of texts(tpl)) {
        if (b.when && !isValidWhen(b.when)) problems.push(`invalid condition: ${b.when}`);
        for (const m of b.text.matchAll(PLACEHOLDER)) {
          const [whole, kind, id] = m;
          const ok = kind === 'in' ? inputs.has(id!) : kind === 'param' ? params.has(id!) : kind === 'local' ? locals.has(id!) : false;
          if (!ok) problems.push(`${whole} doesn't match any declared ${kind === 'in' ? 'input' : kind === 'param' ? 'param' : kind === 'local' ? 'local' : 'placeholder kind'}`);
        }
      }
      if (typeof tpl !== 'string' && tpl.at(-1)?.when) problems.push('the last branch of a template must have no "when" (the fallback)');
    }
  }
  for (const p of d.inputs) if (p.acceptsScalar && !isValidWhen(p.acceptsScalar)) problems.push(`invalid acceptsScalar: ${p.acceptsScalar}`);
  for (const p of d.params ?? []) {
    if (p.kind === 'select' && !p.options?.includes(String(p.default))) problems.push(`param "${p.id}": default must be one of its options`);
  }
  return [...new Set(problems)];
}
