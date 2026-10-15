import { describe, expect, it } from 'vitest';
import { compile } from '../../src/core';
import { camelCase } from '../../src/core/compiler/naming';
import { assertParses, edge, goldenProject, node, project } from '../helpers';

const codes = (p: unknown, g = 'g') => compile(p, g).diagnostics.map((d) => d.code);

describe('structure', () => {
  it('rejects invalid project files', () => {
    expect(codes({ version: 2 })).toContain('INVALID_PROJECT');
  });
  it('flags unknown node types and dangling edges', () => {
    expect(codes(project({ nodes: [node('a', 'nope')], edges: [] }))).toContain('UNKNOWN_NODE_TYPE');
    const p = project({ nodes: [node('o', 'output')], edges: [edge('x', 'out', 'o', 'in')] });
    expect(codes(p)).toContain('DANGLING_EDGE');
  });
  it('flags duplicate ids', () => {
    expect(codes(project({ nodes: [node('o', 'output'), node('o', 'ctx.value')], edges: [] }))).toContain('DUPLICATE_ID');
  });
  it('requires exactly one output', () => {
    expect(codes(project({ nodes: [node('v', 'ctx.value')], edges: [] }))).toContain('NO_OUTPUT');
    expect(codes(project({ nodes: [node('a', 'output'), node('b', 'output')], edges: [] }))).toContain('MULTIPLE_OUTPUTS');
  });
});

describe('graph rules', () => {
  it('detects cycles', () => {
    const p = project({
      nodes: [node('w1', 'anim.wiggle'), node('w2', 'anim.wiggle'), node('o', 'output')],
      edges: [edge('w1', 'out', 'w2', 'prop'), edge('w2', 'out', 'w1', 'prop')],
    });
    expect(codes(p)).toContain('CYCLE');
  });

  it('reports a type mismatch with the edge', () => {
    const p = project({
      nodes: [node('t', 'ctx.time'), node('o', 'output')],
      edges: [edge('t', 'out', 'o', 'in')],
    });
    const d = compile(p, 'g').diagnostics.find((x) => x.code === 'DIM_MISMATCH');
    expect(d?.edgeId).toBe('t.out->o.in');
  });

  it('marks unconnected nodes as unused but still compiles', () => {
    const p = project({
      nodes: [node('v', 'ctx.value'), node('w', 'anim.wiggle'), node('o', 'output')],
      edges: [edge('v', 'out', 'o', 'in')],
    });
    const r = compile(p, 'g');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['UNUSED_NODE']);
    expect(r.code.split('\n').at(-1)).toBe('value');
  });

  it('uses literal defaults and instance values for unconnected inputs', () => {
    const p = project({
      nodes: [node('w', 'anim.wiggle', 0, 0, { inputs: { amp: 20 }, params: { octaves: 3 } }), node('o', 'output', 100)],
      edges: [edge('w', 'out', 'o', 'in')],
    });
    const r = compile(p, 'g');
    expect(r.code).toContain('const wiggle1 = wiggle(2, 20, 3, 0.5);');
    assertParses(r.code);
  });

  it('missing control is GLOBAL_NOT_FOUND', () => {
    const p = goldenProject();
    p.globals.controls.pop();
    expect(codes(p, 'g1')).toContain('GLOBAL_NOT_FOUND');
  });

  it('rejects two hoisted nodes with the same key', () => {
    const p = goldenProject();
    p.graphs[0]!.nodes.push({ ...p.graphs[0]!.nodes[1]!, id: 'posterize2' });
    expect(codes(p, 'g1')).toContain('HOIST_DUPLICATE');
  });

  it('rejects impure upstream of a hoisted node', () => {
    const p = goldenProject();
    p.graphs[0]!.edges[0] = edge('wiggle', 'out', 'posterize', 'fps');
    expect(codes(p, 'g1')).toEqual(expect.arrayContaining(['HOIST_IMPURE_UPSTREAM']));
  });
});

describe('determinism', () => {
  it('output does not depend on node array order', () => {
    const a = goldenProject();
    const b = goldenProject();
    b.graphs[0]!.nodes.reverse();
    b.graphs[0]!.edges.reverse();
    expect(compile(b, 'g1').code).toBe(compile(a, 'g1').code);
  });
});

describe('naming', () => {
  it('camelCases and sanitises labels', () => {
    expect(camelCase('Stop Motion FPS')).toBe('stopMotionFps');
    expect(camelCase('3D Offset')).toBe('_3dOffset');
    expect(camelCase('my-Layer name!')).toBe('myLayerName');
    expect(camelCase('***')).toBe('node');
  });

  it('never emits reserved identifiers and dedupes', () => {
    const p = project({
      nodes: [
        node('w1', 'anim.wiggle', 0, 0),
        node('w2', 'anim.wiggle', 100, 0, { name: 'time' }),
        node('w3', 'anim.wiggle', 200, 0, { name: 'Shake' }),
        node('w4', 'anim.wiggle', 300, 0, { name: 'Shake' }),
        node('o', 'output', 400),
      ],
      edges: [edge('w1', 'out', 'w2', 'amp'), edge('w2', 'out', 'w3', 'amp'), edge('w3', 'out', 'w4', 'amp'), edge('w4', 'out', 'o', 'in')],
      target: { id: 'rotation' },
    });
    const { code } = compile(p, 'g');
    expect(code).toContain('const wiggle1 = wiggle(2, 50, 1, 0.5);');
    expect(code).toContain('const time1 = wiggle(2, wiggle1, 1, 0.5);');
    expect(code).toContain('const shake = wiggle(2, time1, 1, 0.5);');
    expect(code).toContain('const shake2 = wiggle(2, shake, 1, 0.5);');
    assertParses(code);
  });

  it('escapes quotes and unicode in global names', () => {
    const p = goldenProject();
    p.globals.ctrls.layerName = 'Title "Main" ✨';
    p.globals.controls[1]!.effectName = 'Fréq "x"';
    const { code } = compile(p, 'g1');
    expect(code).toContain('const titleMain = thisComp.layer("Title \\"Main\\" ✨");');
    expect(code).toContain('const frQX = titleMain.effect("Fréq \\"x\\"")("Slider");');
    assertParses(code);
  });
});
