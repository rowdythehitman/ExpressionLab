import { describe, expect, it } from 'vitest';
import { copyNodes, parseClip, pasteNodes } from '../../src/app/clipboard';
import { compile } from '../../src/core';
import { goldenProject } from '../helpers';

let n = 0;
const ids = (prefix: string) => `${prefix}_t${++n}`;

describe('node clipboard', () => {
  it('copies selected nodes with internal wires and referenced globals, never Output', () => {
    const p = goldenProject();
    const g = p.graphs[0]!;
    const clip = copyNodes(p, g, ['freq', 'amp', 'wiggle', 'out'])!;
    expect(clip.nodes.map((x) => x.id)).toEqual(['freq', 'amp', 'wiggle']);
    expect(clip.edges.map((e) => e.id).sort()).toEqual(['e2', 'e3']);
    expect(clip.globals.controls.map((c) => c.id).sort()).toEqual(['c-amp', 'c-freq']);
    expect(parseClip(JSON.stringify(clip))).toEqual(clip);
    expect(parseClip('wiggle(2, 50)')).toBeNull();
  });

  it('pastes with fresh ids at the given point, keeping the wires', () => {
    const p = goldenProject();
    const clip = copyNodes(p, p.graphs[0]!, ['amp', 'wiggle'])!;
    const newIds = pasteNodes(p, 'g1', clip, ids, { x: 1000, y: 500 });
    const g = p.graphs[0]!;
    expect(newIds).toHaveLength(2);
    expect(g.nodes).toHaveLength(8);
    const pasted = g.nodes.filter((x) => newIds.includes(x.id));
    expect(Math.min(...pasted.map((x) => x.position.x))).toBe(1000);
    expect(Math.min(...pasted.map((x) => x.position.y))).toBe(500);
    const wire = g.edges.find((e) => newIds.includes(e.from.node) && newIds.includes(e.to.node));
    expect(wire?.to.port).toBe('amp');
    // The original graph still compiles (pasted nodes are just unused).
    expect(compile(p, 'g1').diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('pasting into another project brings the controls along; existing ones win', () => {
    const src = goldenProject();
    const clip = copyNodes(src, src.graphs[0]!, ['freq', 'amp'])!;
    const dst = goldenProject();
    dst.globals.controls = dst.globals.controls.filter((c) => c.id !== 'c-amp');
    dst.globals.controls[1]!.effectName = 'Renamed Freq';
    pasteNodes(dst, 'g1', clip, ids);
    expect(dst.globals.controls.map((c) => c.effectName)).toEqual(['Stop Motion FPS', 'Renamed Freq', 'Wiggle Amp']);
  });
});
