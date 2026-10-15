import { describe, expect, it } from 'vitest';
import { analyzeGraph, checkConnection, compile, suggestConverter } from '../../src/core';
import { edge, node, project } from '../helpers';

describe('generic resolution', () => {
  it('binds T from the first connected input', () => {
    const p = project({
      nodes: [node('v', 'ctx.value'), node('m', 'math.op', 100), node('o', 'output', 200)],
      edges: [edge('v', 'out', 'm', 'a'), edge('m', 'out', 'o', 'in')],
    });
    const t = analyzeGraph(p, p.graphs[0]!).types.get('m')!;
    expect(t.bindings.T).toBe('vec2');
    expect(t.outputs.get('out')).toBe('vec2');
    // Unconnected B on a vec2 op gets a broadcast literal.
    expect(compile(p, 'g').code).toContain('const math = add(value, [0, 0]);');
  });

  it('allows vecN * number on mul/div only', () => {
    const mk = (op: string) =>
      project({
        nodes: [node('v', 'ctx.value'), node('t', 'ctx.time', 0, 100), node('m', 'math.op', 100, 0, { params: { op } }), node('o', 'output', 200)],
        edges: [edge('v', 'out', 'm', 'a'), edge('t', 'out', 'm', 'b'), edge('m', 'out', 'o', 'in')],
      });
    expect(compile(mk('mul'), 'g').code).toContain('mul(value, time)');
    expect(compile(mk('div'), 'g').code).toContain('div(value, time)');
    expect(compile(mk('add'), 'g').diagnostics.map((d) => d.code)).toContain('DIM_MISMATCH');
  });

  it('binds V from a connected property', () => {
    const p = project({
      nodes: [
        node('prop', 'ref.property', 0, 0, { ref: { propertyPath: 'transform.opacity' } }),
        node('w', 'anim.wiggle', 100), node('o', 'output', 200),
      ],
      edges: [edge('prop', 'prop', 'w', 'prop'), edge('w', 'out', 'o', 'in')],
      target: { id: 'rotation' },
    });
    const r = compile(p, 'g');
    expect(r.diagnostics).toEqual([]);
    expect(r.code).toContain('const wiggle1 = thisLayer.transform.opacity.wiggle(2, 50, 1, 0.5);');
  });

  it('a 3D layer makes ref.property position vec3', () => {
    const base = project({
      nodes: [
        node('l', 'ref.layer', 0, 0, { ref: { layerId: 'l1' } }),
        node('prop', 'ref.property', 100, 0, { ref: { propertyPath: 'transform.position' } }),
        node('o', 'output', 200),
      ],
      edges: [edge('l', 'out', 'prop', 'layer'), edge('prop', 'value', 'o', 'in')],
    });
    base.globals.layers.push({ id: 'l1', key: 'nullLayer', layerName: 'Null 1', is3D: true, kind: 'null' });
    expect(compile(base, 'g').diagnostics.map((d) => d.code)).toContain('DIM_MISMATCH');
    base.graphs[0]!.target = { id: 'position3D' };
    expect(compile(base, 'g').code).toContain('const nullLayer = thisComp.layer("Null 1");');
    expect(compile(base, 'g').code.split('\n').at(-1)).toBe('nullLayer.transform.position.value');
  });

  it('switching the target 2D → 3D keeps edges but flags them', () => {
    const p = project({
      nodes: [node('c', 'ctx.compCenter'), node('o', 'output', 100)],
      edges: [edge('c', 'out', 'o', 'in')],
      target: { id: 'position3D' },
    });
    const d = compile(p, 'g').diagnostics;
    expect(d.map((x) => x.code)).toEqual(['DIM_MISMATCH']);
    expect(d[0]!.edgeId).toBe('c.out->o.in');
    expect(p.graphs[0]!.edges).toHaveLength(1);
  });
});

describe('connections and converters', () => {
  const p = project({
    nodes: [node('t', 'ctx.time'), node('c', 'ctx.compCenter', 0, 100), node('w', 'anim.wiggle', 100), node('o', 'output', 200)],
    edges: [edge('w', 'out', 'o', 'in')],
  });
  const g = p.graphs[0]!;

  it('accepts matching types', () => {
    expect(checkConnection(p, g, { node: 't', port: 'out' }, { node: 'w', port: 'freq' })).toEqual({ ok: true });
  });

  it('rejects mismatches with a converter quick-fix', () => {
    const r = checkConnection(p, g, { node: 'c', port: 'out' }, { node: 'w', port: 'freq' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('Expected number, got vec2');
      expect(r.fix?.type).toBe('vec.pick');
    }
  });

  it('rejects cycles', () => {
    const r = checkConnection(p, g, { node: 'o', port: 'x' }, { node: 'w', port: 'prop' });
    expect(r.ok).toBe(false);
  });

  it('suggests the spec converters', () => {
    expect(suggestConverter('number', 'vec2')?.type).toBe('vec.broadcast2');
    expect(suggestConverter('number', 'vec3')?.type).toBe('vec.broadcast3');
    expect(suggestConverter('vec3', 'number')?.type).toBe('vec.pick');
    expect(suggestConverter('vec3', 'vec2')?.type).toBe('vec.dropZ');
    expect(suggestConverter('vec2', 'vec3')?.type).toBe('vec.addZ');
    expect(suggestConverter('color', 'vec3')?.type).toBe('vec.dropAlpha');
    expect(suggestConverter('string', 'number')).toBeUndefined();
  });
});

describe('context checks', () => {
  it('textIndex only works on a text selector', () => {
    const mk = (target: string) =>
      project({ nodes: [node('t', 'ctx.textIndex'), node('o', 'output', 100)], edges: [edge('t', 'out', 'o', 'in')], target: { id: target } });
    expect(compile(mk('rotation'), 'g').diagnostics.map((d) => d.code)).toContain('CONTEXT_UNAVAILABLE');
    const ok = compile(mk('textSelectorAmount'), 'g');
    expect(ok.code.split('\n').at(-1)).toBe('textIndex');
    expect(ok.checklist.map((c) => c.id)).toContain('based-on');
  });

  it('loop needs keyframes', () => {
    const p = project({ nodes: [node('l', 'anim.loop'), node('o', 'output', 100)], edges: [edge('l', 'out', 'o', 'in')] });
    const r = compile(p, 'g');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['NEEDS_KEYFRAMES']);
    expect(r.checklist.map((c) => c.text)).toContain('Property needs keyframes (Loop Keyframes)');
    expect(r.code).toContain('loopOut("cycle")');
  });
});
