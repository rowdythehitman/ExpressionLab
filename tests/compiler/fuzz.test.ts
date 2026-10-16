// Property-based check (spec §13.2): random graphs either fail with diagnostics or emit parseable code.
import { describe, expect, it } from 'vitest';
import { analyzeGraph, checkConnection, compile, NODE_DEFS, type Project } from '../../src/core';
import { assertParses, edge, node, TARGET_FOR } from '../helpers';
import { evaluate, type MockContext } from '../../src/core/runtime/mockAE.js';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const TYPES = [...NODE_DEFS.values()].filter((d) => d.special !== 'output' && d.special !== 'ref.layer');
function randomProject(seed: number): Project {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const count = 2 + Math.floor(r() * 7);
  const p: Project = {
    version: 1,
    globals: {
      ctrls: { layerName: 'CTRLS' },
      layers: [],
      controls: [
        { id: 'c1', effectName: 'Amount', type: 'slider', host: 'ctrls' },
        { id: 'c2', effectName: 'Tint', type: 'color', host: 'thisLayer' },
      ],
      comps: [],
    },
    graphs: [{ id: 'g', name: 'fuzz', target: { id: 'rotation' }, nodes: [], edges: [] }],
    settings: { aeTarget: 26, useMatchNames: false, comments: pick(['none', 'minimal', 'verbose'] as const), embedGraph: false, inlineSingleUse: r() < 0.5 },
  };
  const g = p.graphs[0]!;
  const { nodes, edges } = g;
  for (let i = 0; i < count; i++) {
    const def = pick(TYPES);
    const n = node(`n${i}`, def.id, i * 100, Math.floor(r() * 300));
    if (def.special === 'ref.control') Object.assign(n, { ref: { controlId: pick(['c1', 'c2']) } });
    if (def.special === 'ref.property') Object.assign(n, { ref: { propertyPath: pick(['transform.position', 'transform.opacity', 'text.sourceText']) } });
    for (const p of def.params ?? []) {
      if (p.kind === 'select' && p.options) n.params[p.id] = pick(p.options);
      if (p.kind === 'checkbox') n.params[p.id] = r() < 0.5;
    }
    nodes.push(n);
    for (const port of def.inputs) {
      if (i === 0 || r() < 0.3) continue;
      // Wire a random type-compatible upstream output, if any.
      const options = nodes.slice(0, i).flatMap((src) =>
        NODE_DEFS.get(src.type)!.outputs.map((o) => ({ node: src.id, port: o.id })),
      ).filter((from) => checkConnection(p, g, from, { node: n.id, port: port.id }).ok);
      if (options.length) {
        const from = pick(options);
        edges.push(edge(from.node, from.port, n.id, port.id));
      }
    }
  }
  const types = analyzeGraph(p, g).types;
  const candidates = nodes.flatMap((n) => NODE_DEFS.get(n.type)!.outputs.map((o) => ({ n, o, t: types.get(n.id)!.outputs.get(o.id)! })))
    .filter((c) => TARGET_FOR[c.t]);
  nodes.push(node('o', 'output', count * 100, 0));
  if (candidates.length) {
    const c = candidates.at(-1)!;
    edges.push(edge(c.n.id, c.o.id, 'o', 'in'));
    g.target = nodes.some((n) => NODE_DEFS.get(n.type)!.contexts) && c.t === 'number' ? { id: 'textSelectorAmount' } : TARGET_FOR[c.t]!;
  }
  return p;
}

describe('fuzz: random graphs', () => {
  it('never throws, and every error-free result parses', () => {
    let clean = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const p = randomProject(seed);
      const r = compile(p, 'g');
      if (r.diagnostics.some((d) => d.severity === 'error')) {
        expect(r.code).toBe('');
        continue;
      }
      clean++;
      try {
        assertParses(r.code);
      } catch (e) {
        throw new Error(`seed ${seed} produced unparseable code:\n${r.code}`, { cause: e });
      }
    }
    // Make sure the generator actually exercises the emitter.
    expect(clean).toBeGreaterThan(200);
  });

  it('the inlining pass never changes the result (mock runtime)', () => {
    const VALUE: Record<string, unknown> = { number: 42, vec2: [10, 20], vec3: [1, 2, 3], color: [0.2, 0.4, 0.6, 1], string: 'hi', boolean: true };
    let compared = 0;
    let folded = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const p = randomProject(seed);
      p.settings.inlineSingleUse = false;
      const plain = compile(p, 'g');
      if (!plain.code) continue;
      p.settings.inlineSingleUse = true;
      const inlined = compile(p, 'g');
      assertParses(inlined.code);
      if (inlined.code.split('\n').length < plain.code.split('\n').length) folded++;
      const vt = TARGET_FOR_VALUE(p.graphs[0]!.target);
      const ctx: MockContext = {
        time: 1.37, value: VALUE[vt] as MockContext['value'], index: 3, markers: [0.5, 1],
        textIndex: 2, textTotal: 5,
        thisLayer: { effects: { 'Tint/Color': [1, 0, 0, 1] }, rect: { left: -10, top: -5, width: 20, height: 10 } },
        layers: { CTRLS: { effects: { 'Amount/Slider': 7 } } },
      };
      let expected: unknown;
      try {
        expected = evaluate(plain.code, ctx);
      } catch {
        continue; // API the mock doesn't model (e.g. loop without keyframes)
      }
      compared++;
      expect(evaluate(inlined.code, ctx), `seed ${seed}\n${plain.code}\n---\n${inlined.code}`).toEqual(expected);
    }
    expect(compared).toBeGreaterThan(200);
    expect(folded).toBeGreaterThan(50);
  });
});

function TARGET_FOR_VALUE(target: { id: string; valueType?: string }): string {
  if (target.valueType) return target.valueType;
  return Object.entries(TARGET_FOR).find(([, t]) => t.id === target.id)?.[0] ?? 'number';
}
