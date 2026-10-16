import { describe, expect, it } from 'vitest';
import { compile } from '../../src/core';
import { evaluateDetailed } from '../../src/core/runtime/mockAE.js';
import { edge, goldenProject, node, project } from '../helpers';

// The README example: maths = time + value; math = maths * 10.
const example = () =>
  project({
    nodes: [
      node('t', 'ctx.time', 0, 0, { preview: true }),
      node('v', 'ctx.value', 0, 100),
      node('a', 'math.op', 100, 0, { name: 'Maths', params: { op: 'add' } }),
      node('m', 'math.op', 200, 0, { params: { op: 'mul' }, inputs: { b: 10 } }),
      node('o', 'output', 300),
    ],
    edges: [edge('t', 'out', 'a', 'a'), edge('v', 'out', 'a', 'b'), edge('a', 'out', 'm', 'a'), edge('m', 'out', 'o', 'in')],
    target: { id: 'rotation' },
  });

describe('Output Preview instrumentation', () => {
  it('probes tagged nodes without changing the result', () => {
    const p = example();
    const plain = compile(p, 'g');
    const probed = compile(p, 'g', { preview: { probes: new Set(['t', 'a']) } });
    expect(probed.code).toContain('__probe("t:out", time);');
    expect(probed.code).toContain('__probe("a:out", maths);');
    const r = evaluateDetailed(probed.code, { time: 2, value: 3 });
    expect(r.value).toBe(50);
    expect(r.probes).toEqual({ 't:out': 2, 'a:out': 5 });
    expect(evaluateDetailed(plain.code, { time: 2, value: 3 }).value).toBe(50);
    expect(plain.code).not.toContain('__');
  });

  it('overrides a node output', () => {
    const p = example();
    const c = compile(p, 'g', { preview: { overrides: new Set(['a:out']), probes: new Set(['a']) } });
    expect(c.code).toContain('const maths = __in("a:out");');
    expect(evaluateDetailed(c.code, { time: 2, value: 3 }, { 'a:out': 7 }).value).toBe(70);
  });

  it('reports emitted variable names per node', () => {
    const { variables } = compile(goldenProject(), 'g1');
    expect(variables.wiggle).toEqual(['wiggle1']);
    expect(variables.fps).toEqual(['stopMotionFps']);
    expect(variables.posterize).toEqual([]);
  });
});
