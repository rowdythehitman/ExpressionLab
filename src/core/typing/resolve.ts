// Generic resolution and edge type checking (spec §6). Shared by the compiler and the UI.
import { PROPERTIES } from '../catalog';
import { CONTROLS } from '../catalog/controls';
import { evalWhen, type WhenContext } from '../compiler/template';
import type { Edge, Globals, NodeDef, NodeInstance, PortDef, ValueType } from '../types';
import { innerType, isDimensionMismatch, isGeneric, substitute, typesCompatible, type Bindings } from './index';

export interface NodeTypes {
  bindings: Bindings;
  /** Expected (resolved) type of every input port. */
  inputs: Map<string, string>;
  outputs: Map<string, string>;
}

export interface TypeIssue {
  code: 'TYPE_MISMATCH' | 'DIM_MISMATCH' | 'GLOBAL_NOT_FOUND';
  message: string;
  nodeId: string;
  edgeId?: string;
  expected?: string;
  actual?: string;
}

export interface ResolveContext {
  defs: ReadonlyMap<string, NodeDef>;
  globals: Globals;
  /** The graph target's value type (binds 'V'). */
  valueType: ValueType;
}

/** Incoming edges per node, per input port. */
export type Incoming = Map<string, Map<string, Edge>>;

const VECTOR_LENGTH: Record<number, ValueType> = { 2: 'vec2', 3: 'vec3', 4: 'color' };

export function paramValue(n: NodeInstance, d: NodeDef, id: string): unknown {
  return n.params[id] ?? d.params?.find((p) => p.id === id)?.default;
}

/** True when a plain number may feed this generic port (spec §6 rule 1 exception). */
export function scalarAllowed(port: PortDef, n: NodeInstance, d: NodeDef, incoming: Incoming): boolean {
  if (!port.acceptsScalar) return false;
  const ctx: WhenContext = {
    connected: (id) => !!incoming.get(n.id)?.get(id),
    param: (id) => paramValue(n, d, id),
    type: () => undefined,
  };
  return evalWhen(port.acceptsScalar, ctx);
}

/** Resolves every node's port types. `order` must be topological (upstream first). */
export function resolveTypes(order: NodeInstance[], incoming: Incoming, ctx: ResolveContext) {
  const types = new Map<string, NodeTypes>();
  const issues: TypeIssue[] = [];
  const nodeById = new Map(order.map((n) => [n.id, n]));

  for (const n of order) {
    const d = ctx.defs.get(n.type);
    if (!d) continue;
    const ins = incoming.get(n.id);
    const actualOf = (port: string) => {
      const e = ins?.get(port);
      return e ? (types.get(e.from.node)?.outputs.get(e.from.port) ?? 'T') : undefined;
    };
    const b: Bindings = {};
    if (d.special === 'output') b.V = ctx.valueType;

    // Bind generics from connected inputs (first wins), then from literal array lengths.
    for (const port of d.inputs) {
      const actual = actualOf(port.id);
      if (!actual || !isGeneric(port.type) || isGeneric(actual)) continue;
      const g = innerType(port.type);
      if (b[g]) continue;
      if (actual === 'number' && scalarAllowed(port, n, d, incoming)) continue;
      const bound = innerType(actual) as ValueType;
      const allowed = g === 'V' ? undefined : d.generics?.[g];
      if (!allowed || allowed.includes(bound)) b[g] = bound;
    }
    for (const port of d.inputs) {
      const g = innerType(port.type);
      const lit = n.inputs[port.id] ?? port.default;
      if (ins?.get(port.id) || !isGeneric(port.type) || b[g] || !Array.isArray(lit)) continue;
      const t = VECTOR_LENGTH[lit.length];
      if (t && (!d.generics?.[g] || d.generics[g].includes(t))) b[g] = t;
    }

    // Specials whose output type comes from Globals or a catalog.
    if (d.special === 'ref.control') {
      const c = ctx.globals.controls.find((x) => x.id === n.ref?.controlId);
      if (c) b.T = innerType(CONTROLS[c.type].outputType) as ValueType;
      else issues.push({ code: 'GLOBAL_NOT_FOUND', message: 'Pick a control from Globals', nodeId: n.id });
    }
    if (d.special === 'ref.property') {
      const p = PROPERTIES.get(n.ref?.propertyPath ?? '');
      if (p) {
        const layerEdge = ins?.get('layer');
        const src = layerEdge && nodeById.get(layerEdge.from.node);
        const is3D = src && ctx.defs.get(src.type)?.special === 'ref.layer'
          ? !!ctx.globals.layers.find((l) => l.id === src.ref?.layerId)?.is3D
          : ctx.valueType === 'vec3';
        b.T = (is3D && p.type3D) || p.type;
      } else {
        issues.push({ code: 'GLOBAL_NOT_FOUND', message: 'Pick a property', nodeId: n.id });
      }
    }

    b.V ??= ctx.valueType;
    for (const g of Object.keys(d.generics ?? {})) b[g] ??= d.generics![g]![0];
    b.T ??= 'number';

    const inputs = new Map<string, string>();
    for (const port of d.inputs) {
      const actual = actualOf(port.id);
      let expected = substitute(port.type, b);
      if (actual === 'number' && expected !== 'number' && scalarAllowed(port, n, d, incoming)) expected = 'number';
      inputs.set(port.id, expected);
      if (actual && !typesCompatible(expected, actual)) {
        issues.push({
          code: isDimensionMismatch(expected, actual) ? 'DIM_MISMATCH' : 'TYPE_MISMATCH',
          message: `${d.label} › ${port.label}: expected ${expected}, got ${actual}`,
          nodeId: n.id,
          edgeId: ins!.get(port.id)!.id,
          expected,
          actual,
        });
      }
    }
    const outputs = new Map<string, string>();
    for (const o of d.outputs) outputs.set(o.id, substitute(o.type, b));
    types.set(n.id, { bindings: b, inputs, outputs });
  }
  return { types, issues };
}
