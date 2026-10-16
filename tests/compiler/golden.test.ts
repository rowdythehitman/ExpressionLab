import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compile } from '../../src/core';
import { assertParses, goldenProject } from '../helpers';

const golden = readFileSync(new URL('./golden/posterized-wiggle.txt', import.meta.url), 'utf8').trimEnd();

describe('golden: posterized wiggle (spec §7.4)', () => {
  it('compiles to the golden output', () => {
    const r = compile(goldenProject(), 'g1');
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.code).toBe(golden);
  });

  it('parses as a function body', () => {
    assertParses(compile(goldenProject(), 'g1').code);
  });

  it('produces the setup checklist', () => {
    const texts = compile(goldenProject(), 'g1').checklist.map((c) => c.text);
    expect(texts).toEqual([
      'Apply to: Position',
      "Layer 'GLOBALS' must exist (a Null is ideal)",
      "Add Slider Control 'Stop Motion FPS' to 'GLOBALS'",
      "Add Slider Control 'Wiggle Freq' to 'GLOBALS'",
      "Add Slider Control 'Wiggle Amp' to 'GLOBALS'",
    ]);
  });

  it('maps nodes to their source lines', () => {
    const { sourceMap } = compile(goldenProject(), 'g1');
    expect(sourceMap.fps).toEqual([4, 5]);
    expect(sourceMap.posterize).toEqual([6, 6]);
    expect(sourceMap.wiggle).toEqual([12, 13]);
    expect(sourceMap.out).toEqual([15, 15]);
  });

  it('renaming a global updates the output', () => {
    const p = goldenProject();
    p.globals.ctrls.layerName = 'Controls';
    p.globals.controls[1]!.effectName = 'Jitter Rate';
    const { code } = compile(p, 'g1');
    expect(code).toContain('const Controls = thisComp.layer("Controls");');
    expect(code).toContain('const jitterRate = Controls.effect("Jitter Rate")("Slider");');
  });

  it('emits match names when enabled', () => {
    const p = goldenProject();
    p.settings.useMatchNames = true;
    expect(compile(p, 'g1').code).toContain('GLOBALS.effect("Wiggle Freq")("ADBE Slider Control-0001")');
  });

  it('omits comments when comments = none', () => {
    const p = goldenProject();
    p.settings.comments = 'none';
    expect(compile(p, 'g1').code).not.toMatch(/\/\//);
  });
});
