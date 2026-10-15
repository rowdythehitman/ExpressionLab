// Numeric checks of generated code against the mock AE runtime (spec §13.5).
import { describe, expect, it } from 'vitest';
import { compile, type Project } from '../../src/core';
import { PRESETS } from '../../src/core/presets';
import { edge, node, project } from '../helpers';
import { evaluate, type MockContext } from './mockAE';

const preset = (id: string) => structuredClone(PRESETS.find((p) => p.id === id)!.project);
const run = (p: Project, ctx: MockContext = {}, graphId = p.graphs[0]!.id) => {
  const { code, diagnostics } = compile(p, graphId);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return evaluate(code, ctx);
};

function remap(params: Record<string, string | boolean>, inputs: Record<string, number> = {}) {
  return project({
    nodes: [node('r', 'math.remap', 0, 0, { params, inputs }), node('o', 'output', 100)],
    edges: [edge('r', 'out', 'o', 'in')],
    target: { id: 'opacity' },
  });
}

describe('math', () => {
  it('remap hits its endpoints and clamps', () => {
    for (const mode of ['linear', 'ease', 'easeIn', 'easeOut']) {
      const p = remap({ mode });
      expect(run(p, { time: 0 })).toBeCloseTo(0);
      expect(run(p, { time: 1 })).toBeCloseTo(100);
      expect(run(p, { time: 5 })).toBeCloseTo(100);
      expect(run(p, { time: -1 })).toBeCloseTo(0);
    }
    expect(run(remap({ mode: 'linear' }), { time: 0.25 })).toBeCloseTo(25);
    expect(run(remap({ mode: 'ease' }), { time: 0.5 })).toBeCloseTo(50);
  });

  it('unclamped remap extrapolates', () => {
    const p = remap({ clamp: false }, { inMin: 1, inMax: 2 });
    expect(run(p, { time: 3 })).toBeCloseTo(200);
    expect(run(p, { time: 0 })).toBeCloseTo(-100);
  });

  it('vector math matches component-wise arithmetic', () => {
    const op = (o: string, b: number | number[]) =>
      project({
        nodes: [node('v', 'ctx.value'), node('m', 'math.op', 100, 0, { params: { op: o }, inputs: { b } }), node('o', 'output', 200)],
        edges: [edge('v', 'out', 'm', 'a'), edge('m', 'out', 'o', 'in')],
      });
    const value = [10, 20];
    expect(run(op('add', [1, 2]), { value })).toEqual([11, 22]);
    expect(run(op('sub', [1, 2]), { value })).toEqual([9, 18]);
    expect(run(op('mul', [2, 3]), { value })).toEqual([20, 60]);
    expect(run(op('div', [2, 4]), { value })).toEqual([5, 5]);
    expect(run(op('mod', [3, 6]), { value })).toEqual([1, 2]);
    expect(run(op('pow', [2, 1]), { value })).toEqual([100, 20]);
    expect(run(op('min', [15, 15]), { value })).toEqual([10, 15]);
    expect(run(op('max', [15, 15]), { value })).toEqual([15, 20]);
  });

  it('vector × number uses mul()', () => {
    const p = project({
      nodes: [node('v', 'ctx.value'), node('t', 'ctx.time', 0, 100), node('m', 'math.op', 100, 0, { params: { op: 'mul' } }), node('o', 'output', 200)],
      edges: [edge('v', 'out', 'm', 'a'), edge('t', 'out', 'm', 'b'), edge('m', 'out', 'o', 'in')],
    });
    expect(run(p, { value: [10, 20], time: 3 })).toEqual([30, 60]);
  });

  it('clamp works per component on vectors', () => {
    const p = project({
      nodes: [node('v', 'ctx.value'), node('c', 'math.clamp', 100), node('o', 'output', 200)],
      edges: [edge('v', 'out', 'c', 'v'), edge('c', 'out', 'o', 'in')],
    });
    expect(run(p, { value: [-5, 150] })).toEqual([0, 100]);
  });

  it('frozen random is stable over time and differs per layer', () => {
    const p = project({
      nodes: [node('r', 'math.random'), node('o', 'output', 100)],
      edges: [edge('r', 'out', 'o', 'in')],
      target: { id: 'rotation' },
    });
    const a = run(p, { index: 1, time: 0 }) as number;
    expect(run(p, { index: 1, time: 4 })).toBe(a);
    expect(run(p, { index: 2, time: 0 })).not.toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(100);
  });
});

describe('presets', () => {
  it('Loop a Wiggle repeats exactly and has no jump at the seam', () => {
    const p = preset('loop-wiggle');
    const at = (time: number) => run(p, { time, value: [960, 540] }) as number[];
    for (const t of [0.1, 1.3, 2.7]) {
      const [a, b] = [at(t), at(t + 3)];
      expect(a[0]).toBeCloseTo(b[0]!, 6);
      expect(a[1]).toBeCloseTo(b[1]!, 6);
    }
    const before = at(3 - 1e-6);
    const after = at(3);
    expect(Math.abs(before[0]! - after[0]!)).toBeLessThan(1e-3);
    expect(Math.abs(before[1]! - after[1]!)).toBeLessThan(1e-3);
    expect(at(1)).not.toEqual([960, 540]);
  });

  it('Control Property with Checkbox gates the value', () => {
    const p = preset('checkbox-control');
    const ctx = (on: number): MockContext => ({ value: 80, layers: { CTRLS: { effects: { 'Enable/Checkbox': on } } } });
    expect(run(p, ctx(1))).toBe(80);
    expect(run(p, ctx(0))).toBe(0);
  });

  it('Wiggle on One Dimension leaves Y alone', () => {
    const p = preset('wiggle-one-dimension');
    for (const time of [0.3, 1.7, 4.2]) {
      const [x, y] = run(p, { time, value: [500, 300] }) as number[];
      expect(y).toBe(300);
      expect(x).not.toBe(500);
    }
  });

  it('Trigger Expression on Marker restarts the fade at each marker', () => {
    const p = preset('marker-trigger');
    const markers = [1, 3];
    expect(run(p, { time: 0.5, markers })).toBe(0);
    expect(run(p, { time: 1, markers })).toBeCloseTo(0);
    expect(run(p, { time: 1.25, markers })).toBeCloseTo(50);
    expect(run(p, { time: 2, markers })).toBeCloseTo(100);
    expect(run(p, { time: 3, markers })).toBeCloseTo(0);
    expect(run(p, { time: 0.5, markers: [] })).toBe(0);
  });

  it('Center Anchor Point keeps X and centres Y on the text box', () => {
    const p = preset('center-anchor-text');
    const rect = { left: -80, top: -30, width: 160, height: 40 };
    expect(run(p, { value: [12, 99], thisLayer: { rect } })).toEqual([12, -10]);
  });

  it('Posterize Time + Wiggle wiggles around the value', () => {
    const p = preset('posterized-wiggle');
    const effects = { 'Stop Motion FPS/Slider': 8, 'Wiggle Freq/Slider': 2, 'Wiggle Amp/Slider': 30 };
    const [x, y] = run(p, { time: 1.4, value: [100, 100], layers: { CTRLS: { effects } } }) as number[];
    expect(Math.abs(x! - 100)).toBeLessThanOrEqual(30);
    expect(Math.abs(y! - 100)).toBeLessThanOrEqual(30);
  });
});

describe('animation', () => {
  it('loopOut cycles keyframes; loop both = loopIn + loopOut - value', () => {
    const keys = [{ time: 1, value: 0 }, { time: 3, value: 100 }];
    const mk = (dir: string) =>
      project({
        nodes: [node('l', 'anim.loop', 0, 0, { params: { dir } }), node('o', 'output', 100)],
        edges: [edge('l', 'out', 'o', 'in')],
        target: { id: 'opacity' },
      });
    expect(run(mk('out'), { time: 4, keys })).toBeCloseTo(50);
    expect(run(mk('in'), { time: 0, keys })).toBeCloseTo(50);
    expect(run(mk('both'), { time: 0, keys })).toBeCloseTo(50);
    expect(run(mk('both'), { time: 4, keys })).toBeCloseTo(50);
    expect(run(mk('both'), { time: 2, keys })).toBeCloseTo(50);
  });
});

describe('text selector nodes', () => {
  const mk = (type: string, inputs: Record<string, number> = {}) =>
    project({
      nodes: [node('n', type, 0, 0, { inputs }), node('o', 'output', 100)],
      edges: [edge('n', 'out', 'o', 'in')],
      target: { id: 'textSelectorAmount' },
    });
  it('typewriter reveals one character per 1/cps seconds', () => {
    const p = mk('text.typewriter', { start: 0, cps: 10 });
    expect(run(p, { time: 0, textIndex: 1, textTotal: 5 })).toBe(100);
    expect(run(p, { time: 0.05, textIndex: 1, textTotal: 5 })).toBe(0);
    expect(run(p, { time: 0.15, textIndex: 2, textTotal: 5 })).toBe(0);
    expect(run(p, { time: 0.15, textIndex: 3, textTotal: 5 })).toBe(100);
  });
  it('stagger offsets each element by the delay', () => {
    const p = mk('text.stagger', { start: 0, delayFrames: 5, durFrames: 5 }); // 25 fps → 0.2 s each
    expect(run(p, { time: 0, textIndex: 1 })).toBeCloseTo(100);
    expect(run(p, { time: 0.2, textIndex: 1 })).toBeCloseTo(0);
    expect(run(p, { time: 0.2, textIndex: 2 })).toBeCloseTo(100);
    expect(run(p, { time: 0.4, textIndex: 2 })).toBeCloseTo(0);
  });
  it('ramp goes from 0 to amount', () => {
    const p = mk('text.ramp');
    expect(run(p, { textIndex: 1, textTotal: 5 })).toBe(0);
    expect(run(p, { textIndex: 5, textTotal: 5 })).toBe(100);
    expect(run(p, { textIndex: 1, textTotal: 1 })).toBe(0);
  });
});
