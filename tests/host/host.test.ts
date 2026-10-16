import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { createCepHost, detectHost, HostError, type PropertyInfo } from '../../src/app/host';
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
