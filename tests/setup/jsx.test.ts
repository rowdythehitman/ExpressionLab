import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { generateSetupScript } from '../../src/core';
import { PRESETS } from '../../src/core/presets';
import { goldenProject } from '../helpers';

const es3 = (code: string) => parse(code, { ecmaVersion: 3 });

describe('.jsx setup script', () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))('%s: is valid ES3 (ExtendScript)', (_id, preset) => {
    expect(() => es3(generateSetupScript(preset.project))).not.toThrow();
  });

  it('creates the GLOBALS null and each control with its match name and value', () => {
    const p = goldenProject();
    p.globals.controls[1]!.previewValue = 3;
    const js = generateSetupScript(p);
    expect(js).toContain('var globalsLayer = ensureNull("GLOBALS", false);');
    expect(js).toContain('ensureControl(globalsLayer, "Stop Motion FPS", "ADBE Slider Control", null, null);');
    expect(js).toContain('ensureControl(globalsLayer, "Wiggle Freq", "ADBE Slider Control", 3, null);');
    expect(js).toContain('app.beginUndoGroup(');
  });

  it('handles layers, dropdown items, this-layer controls and awkward names', () => {
    const p = goldenProject();
    p.globals.layers.push(
      { id: 'n1', key: 'rigLayer', layerName: 'Rig "Main"  ✨', is3D: true, kind: 'null' },
      { id: 't1', key: 'titleLayer', layerName: 'Title', is3D: false, kind: 'text' },
    );
    p.globals.controls.push(
      { id: 'd1', effectName: 'Mode', type: 'dropdown', host: { layerId: 'n1' }, dropdownItems: ['A', 'B "quoted"'] },
      { id: 'c9', effectName: 'Tint', type: 'color', host: 'thisLayer', previewValue: [1, 0, 0, 1] },
      { id: 'c10', effectName: 'Show', type: 'checkbox', host: { layerId: 't1' } },
    );
    const js = generateSetupScript(p);
    es3(js);
    expect(js).toContain('var layer1 = ensureNull("Rig \\"Main\\" \\u2028✨", true);');
    expect(js).toContain('var layer2 = findLayer("Title");');
    expect(js).toContain('if (layer1) { ensureControl(layer1, "Mode", "ADBE Dropdown Control", null, ["A", "B \\"quoted\\""]); }');
    expect(js).toContain('ensureControl(targets[t], "Tint", "ADBE Color Control", [1, 0, 0, 1], null);');
    expect(js).toContain('if (layer2) { ensureControl(layer2, "Show", "ADBE Checkbox Control", null, null); }');
  });
});
