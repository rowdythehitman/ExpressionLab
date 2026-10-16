import { describe, expect, it } from 'vitest';
import {
  analyzeGraph, compile, decodePayload, embedGraph, importGraph, makeMacro, nodeLibrary, validateCustomNode,
  type NodeDef, type Project,
} from '../../src/core';
import { PRESETS } from '../../src/core/presets';
import { evaluate, evaluateDetailed, type MockContext } from '../../src/core/runtime/mockAE.js';
import { assertParses, edge, goldenProject, node, project } from '../helpers';

const double: NodeDef = {
  id: 'user.double', label: 'Double', category: 'math', description: 'a × 2', tags: [],
  inputs: [{ id: 'a', label: 'A', type: 'number', default: 1 }],
  outputs: [{ id: 'out', label: 'Result', type: 'number', expr: '{{in.a}} * 2' }],
};

describe('user-defined nodes', () => {
  it('compile like built-ins', () => {
    const p = project({
      nodes: [node('t', 'ctx.time'), node('d', 'user.double', 100), node('o', 'output', 200)],
      edges: [edge('t', 'out', 'd', 'a'), edge('d', 'out', 'o', 'in')],
      target: { id: 'rotation' },
    }, { customNodes: [double] });
    const r = compile(p, 'g');
    expect(r.diagnostics).toEqual([]);
    expect(r.code).toContain('const double = time * 2;');
  });

  it('are validated with readable messages', () => {
    const lib = nodeLibrary({ customNodes: [double] });
    expect(validateCustomNode({ ...double, id: 'user.half' }, lib)).toEqual([]);
    expect(validateCustomNode(double, lib, 'user.double')).toEqual([]);
    expect(validateCustomNode(double, lib)).toContain('id "user.double" is already used');
    expect(validateCustomNode({ ...double, id: 'math.op' }, lib)[0]).toMatch(/must start with "user\."/);
    const bad = { ...double, id: 'user.bad', outputs: [{ id: 'out', label: 'R', type: 'number', expr: [{ when: 'connected(a)', text: '{{in.b}}' }] }] };
    const problems = validateCustomNode(bad, lib);
    expect(problems).toContain("{{in.b}} doesn't match any declared input");
    expect(problems).toContain('the last branch of a template must have no "when" (the fallback)');
    expect(validateCustomNode({ id: 'user.x' }, lib).length).toBeGreaterThan(0);
  });

  it("can't replace a built-in node", () => {
    const lib = nodeLibrary({ customNodes: [{ ...double, id: 'anim.wiggle' }] });
    expect(lib.get('anim.wiggle')!.label).toBe('Wiggle');
  });
});

/** Turns every non-output node of a preset into one macro and returns both versions. */
function macroOf(p: Project, ids?: string[]) {
  const g = p.graphs[0]!;
  const lib = nodeLibrary(p);
  const types = analyzeGraph(p, g, lib).types;
  let n = 0;
  const r = makeMacro(p, g, ids ?? g.nodes.map((x) => x.id), 'My Macro', lib,
    (id, port, side) => types.get(id)![side === 'in' ? 'inputs' : 'outputs'].get(port)!, (prefix) => `${prefix}_m${++n}`);
  if ('error' in r) throw new Error(r.error);
  const q: Project = { ...structuredClone(p), customNodes: [...(p.customNodes ?? []), r.def] };
  q.graphs[0] = r.graph;
  return { q, r };
}

const contexts: MockContext[] = [0, 0.7, 1.9, 3.3].map((time) => ({
  time, value: [960, 540], markers: [1, 3], index: 2,
  layers: { GLOBALS: { effects: { 'Stop Motion FPS/Slider': 8, 'Wiggle Freq/Slider': 2, 'Wiggle Amp/Slider': 30, 'Enable/Checkbox': 1, 'Delay (s)/Slider': 0.5, 'Show Layer/Menu': 2 } } },
  thisLayer: { rect: { left: -50, top: -20, width: 100, height: 40 } },
}));

describe('sub-graph macros', () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))('%s: wrapping the whole graph in a macro gives the same result', (_id, preset) => {
    const p = structuredClone(preset.project);
    const original = compile(p, p.graphs[0]!.id);
    let wrapped;
    try {
      wrapped = macroOf(p);
    } catch (e) {
      // Graphs whose only consumer is Output-less (e.g. hoisted-only) can't form a macro; nothing else may fail.
      expect(String(e)).toMatch(/feed something outside/);
      return;
    }
    const after = compile(wrapped.q, wrapped.q.graphs[0]!.id);
    expect(after.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    assertParses(after.code);
    for (const ctx of contexts) {
      let expected: unknown;
      try {
        expected = evaluate(original.code, ctx);
      } catch {
        continue;
      }
      expect(evaluate(after.code, ctx)).toEqual(expected);
    }
    // The instance gets the macro's resolved port types and the inner variables are prefixed with its name.
    expect(wrapped.r.instanceId in after.variables).toBe(true);
  });

  it('macro inputs keep their wires; unconnected ones take the instance literal', () => {
    const p = PRESETS.find((x) => x.id === 'wiggle-one-dimension')!.project;
    const { q, r } = macroOf(structuredClone(p), ['wiggled', 'base', 'make']);
    expect(r.def.inputs.map((i) => i.type)).toEqual(['vec2', 'vec2']);
    expect(r.def.outputs.map((o) => o.type)).toEqual(['vec2']);
    const c = compile(q, q.graphs[0]!.id);
    expect(c.code).toContain('const myMacroWiggledX = wiggle1[0];');
    for (const ctx of contexts) expect(evaluate(c.code, ctx)).toEqual(evaluate(compile(p, p.graphs[0]!.id).code, ctx));
  });

  it('nests, maps diagnostics to the instance, and previews its outputs', () => {
    const p = structuredClone(goldenProject());
    const once = macroOf(p, ['freq', 'amp', 'wiggle']);
    const twice = macroOf(once.q, [once.r.instanceId]);
    const c = compile(twice.q, 'g1');
    expect(c.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    for (const ctx of contexts) expect(evaluate(c.code, ctx)).toEqual(evaluate(compile(p, 'g1').code, ctx));

    const probed = compile(twice.q, 'g1', { preview: { probes: new Set([twice.r.instanceId]) } });
    const res = evaluateDetailed(probed.code, contexts[1]);
    expect(res.probes[`${twice.r.instanceId}:out1`]).toEqual(res.value);

    // An error inside a macro is reported on the macro instance.
    twice.q.globals.controls.pop();
    const broken = compile(twice.q, 'g1');
    expect(broken.diagnostics.find((d) => d.code === 'GLOBAL_NOT_FOUND')?.nodeId).toBe(twice.r.instanceId);
  });

  it('travels in the embedded payload and merges on import', async () => {
    const p = structuredClone(goldenProject());
    const { q } = macroOf(p, ['freq', 'amp', 'wiggle']);
    const code = compile(q, 'g1').code;
    const { code: withPayload } = await embedGraph(q, q.graphs[0]!, code);
    const decoded = (await decodePayload(withPayload))!;
    expect(decoded.customNodes!.map((d) => d.id)).toEqual(['user.macro.myMacro']);
    const fresh = goldenProject();
    const { project: merged, graphId } = importGraph(fresh, decoded, () => 'g-new');
    expect(merged.customNodes!.map((d) => d.id)).toEqual(['user.macro.myMacro']);
    expect(compile(merged, graphId).code).toBe(code);
  });
});
