import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { generateSetupScript } from '../../src/core';
import { buildGlobalsReport, createCepHost, detectHost, HostError, type PropertyInfo } from '../../src/app/host';
import { goldenProject } from '../helpers';
import { targetForProperty } from '../../src/app/host/target';
import { HOST_JSX, makeAE } from './fakeAE';

describe('cep/host/host.jsx', () => {
  it('is valid ES3 (ExtendScript)', () => {
    expect(() => parse(HOST_JSX, { ecmaVersion: 3 })).not.toThrow();
  });

  it('reports no comp, then the first selected property that can take an expression', async () => {
    const ae = makeAE();
    const host = createCepHost(ae.evalScript);
    expect(await host.getSelection()).toMatchObject({ comp: null, property: null, count: 0 });

    ae.openComp();
    const layer = { name: 'Logo', index: 3, threeD: true };
    const group = { ...ae.prop(layer, 'Transform', 'ADBE Transform Group', 'NO_VALUE'), propertyType: 6814, canSetExpression: false };
    const pos = ae.prop(layer, 'Position', 'ADBE Position', 'ThreeD_SPATIAL', ['ADBE Transform Group'], { expression: 'wiggle(2, 5)' });
    ae.comp.selectedProperties = [group, pos];
    const sel = await host.getSelection();
    expect(sel).toEqual({
      ok: true,
      comp: 'Main Comp',
      count: 1,
      property: {
        name: 'Position', matchName: 'ADBE Position', valueType: 'ThreeD_SPATIAL',
        parents: ['ADBE Transform Group'], expression: 'wiggle(2, 5)',
        layer: { name: 'Logo', index: 3, threeD: true, text: false },
      },
    });
  });

  it('applies to every selected property in one undo group, with awkward characters intact', async () => {
    const ae = makeAE();
    ae.openComp();
    const a = ae.prop({ name: 'A' }, 'Opacity', 'ADBE Opacity', 'OneD', ['ADBE Transform Group']);
    const b = ae.prop({ name: 'B "quoted"' }, 'Rotation', 'ADBE Rotate Z', 'OneD', ['ADBE Transform Group']);
    ae.comp.selectedProperties = [a, b];
    const code = 'var s = "a\\\\b \'c\'";\n// ✨   line sep\n\tvalue';
    const res = await createCepHost(ae.evalScript).applyExpression(code);
    expect(res.applied).toEqual([{ property: 'A › Opacity' }, { property: 'B "quoted" › Rotation' }]);
    expect(a.expression).toBe(code);
    expect(b.expression).toBe(code);
    expect(a.expressionEnabled).toBe(true);
    expect(ae.log).toEqual(['begin:ExpressionLab: apply expression', 'end']);
  });

  it('reports expression errors and setter failures per property, and closes the undo group', async () => {
    const ae = makeAE();
    ae.openComp();
    const bad = ae.prop({ name: 'A' }, 'Opacity', 'ADBE Opacity', 'OneD', [], { expressionError: 'ReferenceError: foo is not defined' });
    const locked = ae.prop({ name: 'B' }, 'Scale', 'ADBE Scale', 'ThreeD', []);
    Object.defineProperty(locked, 'expression', { set() { throw new Error('layer is locked'); }, get: () => '' });
    ae.comp.selectedProperties = [bad, locked];
    const res = await createCepHost(ae.evalScript).applyExpression('foo');
    expect(res.applied).toEqual([
      { property: 'A › Opacity', error: 'ReferenceError: foo is not defined' },
      { property: 'B › Scale', error: 'layer is locked' },
    ]);
    expect(ae.log.at(-1)).toBe('end');
  });

  it('turns host failures into readable errors', async () => {
    const ae = makeAE();
    const host = createCepHost(ae.evalScript);
    await expect(host.applyExpression('1')).rejects.toThrow(/Open a composition/);
    ae.openComp();
    await expect(host.readExpression()).rejects.toThrow(/Select a property/);
    // Script not loaded / evalScript failure.
    const broken = createCepHost(async () => 'EvalScript error.');
    await expect(broken.getSelection()).rejects.toBeInstanceOf(HostError);
    await expect(broken.getSelection()).rejects.toThrow(/couldn't reach/);
  });

  it('reads the first selected expression back', async () => {
    const ae = makeAE();
    ae.openComp();
    ae.comp.selectedProperties = [ae.prop({ name: 'L' }, 'Source Text', 'ADBE Text Document', 'TEXT_DOCUMENT', ['ADBE Text Properties'], { expression: 'time\n//@ae-nodes:v1:abc' })];
    expect(await createCepHost(ae.evalScript).readExpression()).toMatchObject({ property: 'L › Source Text', expression: 'time\n//@ae-nodes:v1:abc' });
  });
});

describe('host adapter', () => {
  it('is only present inside CEP', async () => {
    expect(detectHost({})).toBeNull();
    const calls: string[] = [];
    const host = detectHost({ __adobe_cep__: { evalScript: (s: string, cb: (r: string) => void) => { calls.push(s); cb('{"ok":true,"comp":null,"property":null,"count":0}'); } } });
    expect(await host!.getSelection()).toMatchObject({ comp: null });
    expect(calls).toEqual(['ExpressionLab.getSelection()']);
  });

  it('saves through cep.fs, and reports a cancelled dialog', async () => {
    const written: Array<[string, string]> = [];
    let pick = '/tmp/x.aenodes.json';
    const fs = {
      showSaveDialogEx: (_t: string, _p: string, types: string[], name: string) => {
        expect(types).toEqual(['json']);
        expect(name).toBe('x.aenodes.json');
        return { err: 0, data: pick };
      },
      writeFile: (p: string, d: string) => { written.push([p, d]); return { err: 0 }; },
    };
    const host = createCepHost(async () => '', fs);
    expect(await host.saveTextFile('x.aenodes.json', '{}')).toBe(true);
    pick = '';
    expect(await host.saveTextFile('x.aenodes.json', '{}')).toBe(false);
    expect(written).toEqual([['/tmp/x.aenodes.json', '{}']]);
  });
});

describe('targetForProperty', () => {
  const info = (matchName: string, valueType: string, parents: string[], layer: Partial<PropertyInfo['layer']> = {}): PropertyInfo => ({
    name: matchName, matchName, valueType, parents, expression: '',
    layer: { name: 'L', index: 1, threeD: false, text: false, ...layer },
  });

  it.each([
    [info('ADBE Position', 'ThreeD_SPATIAL', ['ADBE Transform Group']), { id: 'position2D' }],
    [info('ADBE Position', 'ThreeD_SPATIAL', ['ADBE Transform Group'], { threeD: true }), { id: 'position3D' }],
    [info('ADBE Scale', 'ThreeD', ['ADBE Transform Group']), { id: 'scale2D' }],
    [info('ADBE Anchor Point', 'ThreeD_SPATIAL', ['ADBE Transform Group'], { threeD: true }), { id: 'anchorPoint3D' }],
    [info('ADBE Rotate Z', 'OneD', ['ADBE Transform Group']), { id: 'rotation' }],
    [info('ADBE Opacity', 'OneD', ['ADBE Transform Group']), { id: 'opacity' }],
    [info('ADBE Position_0', 'OneD', ['ADBE Transform Group']), { id: 'custom', valueType: 'number' }],
    [info('ADBE Text Document', 'TEXT_DOCUMENT', ['ADBE Text Properties']), { id: 'sourceText' }],
    [info('ADBE Text Expressible Amount', 'OneD', ['ADBE Text Properties', 'ADBE Text Animators', 'ADBE Text Animator', 'ADBE Text Selectors', 'ADBE Text Expressible Selector']), { id: 'textSelectorAmount' }],
    [info('ADBE Text Fill Color', 'COLOR', ['ADBE Text Properties', 'ADBE Text Animators', 'ADBE Text Animator', 'ADBE Text Animator Properties']), { id: 'textAnimatorProperty', valueType: 'color' }],
    [info('ADBE Slider Control-0001', 'OneD', ['ADBE Effect Parade', 'ADBE Slider Control']), { id: 'effectNumber' }],
    [info('ADBE Fill-0002', 'COLOR', ['ADBE Effect Parade', 'ADBE Fill']), { id: 'effectColor' }],
    [info('ADBE Point Control-0001', 'TwoD_SPATIAL', ['ADBE Effect Parade', 'ADBE Point Control']), { id: 'custom', valueType: 'vec2' }],
    [info('ADBE Vector Shape', 'SHAPE', ['ADBE Root Vectors Group', 'ADBE Vector Group', 'ADBE Vectors Group', 'ADBE Vector Shape - Group']), { id: 'shapePath' }],
    [info('ADBE Mask Shape', 'SHAPE', ['ADBE Mask Parade', 'ADBE Mask Atom']), { id: 'maskPath' }],
    [info('ADBE Vector Stroke Width', 'OneD', ['ADBE Root Vectors Group', 'ADBE Vector Graphic - Stroke']), { id: 'shapeStrokeWidth' }],
    [info('ADBE Vector Fill Color', 'COLOR', ['ADBE Root Vectors Group', 'ADBE Vector Graphic - Fill']), { id: 'shapeFillColor' }],
    [info('ADBE Marker', 'MARKER', []), null],
  ])('%#: %o', (p, expected) => {
    expect(targetForProperty(p)).toEqual(expected);
  });
});

describe('Build Globals (setup script in panel mode)', () => {
  it('is valid ES3 and needs an open comp', async () => {
    const p = goldenProject();
    expect(() => parse(generateSetupScript(p, { report: 'panel' }), { ecmaVersion: 3 })).not.toThrow();
    const ae = makeAE();
    await expect(createCepHost(ae.evalScript).buildGlobals(p)).rejects.toThrow(/Open a composition/);
  });

  it('creates the null and controls, reports them, and skips what is already there on a second run', async () => {
    const p = goldenProject();
    p.globals.layers.push({ id: 't1', key: 'titleLayer', layerName: 'Title', is3D: false, kind: 'text' });
    p.globals.controls.push(
      { id: 'd1', effectName: 'Mode', type: 'dropdown', host: 'ctrls', dropdownItems: ['A', 'B'], previewValue: 2 },
      { id: 'c9', effectName: 'Show', type: 'checkbox', host: { layerId: 't1' } },
    );
    const ae = makeAE();
    ae.openComp();
    const host = createCepHost(ae.evalScript);

    const first = await host.buildGlobals(p);
    const globals = ae.comp.all.find((l) => l.name === 'GLOBALS')!;
    expect(globals.effects.map((e) => e.name)).toEqual([...p.globals.controls.filter((c) => c.host === 'ctrls').map((c) => c.effectName)]);
    expect(globals.effects.find((e) => e.name === 'Mode')).toMatchObject({ matchName: 'ADBE Dropdown Control', items: ['A', 'B'], value: 2 });
    expect(first.made).toContain('Null "GLOBALS"');
    expect(first.skipped).toEqual([`Layer "Title" (text) isn't in this comp; add it and run again`]);
    expect(ae.log).toEqual(['begin:ExpressionLab setup', 'end']);

    ae.addLayer('Title');
    const second = await host.buildGlobals(p);
    expect(second.made).toEqual(['Show on Title']);
    expect(second.skipped.every((s) => s.includes('already on GLOBALS'))).toBe(true);
    expect(ae.comp.all.filter((l) => l.name === 'GLOBALS')).toHaveLength(1);
  });

  it('describes the result for the panel', async () => {
    const ok = await buildGlobalsReport({ buildGlobals: async () => ({ made: ['Null "GLOBALS"', 'Speed on GLOBALS'], skipped: ['Tint: x'] }) } as never, goldenProject());
    expect(ok).toEqual({ ok: true, text: 'Built 2: Null "GLOBALS", Speed on GLOBALS\nSkipped: Tint: x' });
    const none = await buildGlobalsReport({ buildGlobals: async () => ({ made: [], skipped: [] }) } as never, goldenProject());
    expect(none.text).toMatch(/already there/);
    const err = await buildGlobalsReport({ buildGlobals: async () => { throw new HostError('nope'); } } as never, goldenProject());
    expect(err).toEqual({ ok: false, text: 'nope' });
  });
});

it('Build Globals reports an AE error part-way through instead of failing silently', async () => {
  const ae = makeAE();
  ae.openComp();
  (ae.comp.layers as { addNull: () => never }).addNull = () => { throw new Error('comp is locked'); };
  await expect(createCepHost(ae.evalScript).buildGlobals(goldenProject())).rejects.toThrow('ExpressionLab: comp is locked');
  expect(ae.log.at(-1)).toBe('end');
});
