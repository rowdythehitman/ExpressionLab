// ExtendScript (.jsx) setup generator (spec §14, Phase 3): creates the GLOBALS null, missing null layers and
// every control from Globals in the active comp. ExtendScript is ES3: var, function, no JSON, no arrows.
import { CONTROLS } from '../catalog/controls';
import { APP_NAME } from '../compiler/compile';
import type { ControlGlobal, Project } from '../types';

/** A JS string literal that is also valid ES3 (escapes U+2028/2029, which ES3 treats as line breaks). */
export function jsxString(s: string): string {
  return JSON.stringify(s).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function value(c: ControlGlobal): string {
  const v = c.previewValue;
  if (v === undefined || c.type === 'layer') return 'null';
  return Array.isArray(v) ? `[${v.join(', ')}]` : String(v);
}

export function generateSetupScript(project: Project): string {
  const { globals } = project;
  const lines: string[] = [
    `// ${APP_NAME} setup script: creates the layers and expression controls your expressions use.`,
    '// In After Effects: open the comp, then File > Scripts > Run Script File... and pick this file.',
    '// Safe to run again: anything that already exists is left alone. One undo step undoes it all.',
    '(function () {',
    '  var comp = app.project.activeItem;',
    '  if (!(comp && comp instanceof CompItem)) {',
    `    alert(${jsxString(`${APP_NAME}: open (or select) a composition first, then run this script again.`)});`,
    '    return;',
    '  }',
    `  app.beginUndoGroup(${jsxString(`${APP_NAME} setup`)});`,
    '  var made = [];',
    '  var skipped = [];',
    '  function findLayer(name) {',
    '    for (var i = 1; i <= comp.numLayers; i++) {',
    '      if (comp.layer(i).name === name) { return comp.layer(i); }',
    '    }',
    '    return null;',
    '  }',
    '  function ensureNull(name, is3D) {',
    '    var layer = findLayer(name);',
    '    if (layer) { return layer; }',
    '    layer = comp.layers.addNull();',
    '    layer.name = name;',
    '    if (is3D) { layer.threeDLayer = true; }',
    '    made.push("Null \\"" + name + "\\"");',
    '    return layer;',
    '  }',
    '  function ensureControl(layer, name, matchName, value, items) {',
    '    var fx = layer.property("ADBE Effect Parade");',
    '    if (fx.property(name)) { skipped.push(name + " (already on " + layer.name + ")"); return; }',
    '    var effect = fx.addProperty(matchName);',
    '    effect.name = name;',
    '    if (items) {',
    '      try { effect.property(1).setPropertyParameters(items); }',
    '      catch (e1) { skipped.push(name + ": menu items need AE 17.0.1 or later"); }',
    '    }',
    '    if (value !== null) {',
    '      try { effect.property(1).setValue(value); } catch (e2) { skipped.push(name + ": couldn\'t set its value"); }',
    '    }',
    '    made.push(name + " on " + layer.name);',
    '  }',
    '',
    `  var globalsLayer = ensureNull(${jsxString(globals.ctrls.layerName)}, false);`,
  ];

  // Layers: create missing nulls; other kinds must already exist (we can't guess their content).
  const layerVar = new Map<string, string>();
  globals.layers.forEach((l, i) => {
    const v = `layer${i + 1}`;
    layerVar.set(l.id, v);
    if (l.kind === 'null') {
      lines.push(`  var ${v} = ensureNull(${jsxString(l.layerName)}, ${l.is3D});`);
    } else {
      lines.push(
        `  var ${v} = findLayer(${jsxString(l.layerName)});`,
        `  if (!${v}) { skipped.push(${jsxString(`Layer "${l.layerName}" (${l.kind}) isn't in this comp; add it and run again`)}); }`,
      );
    }
  });

  const hasThisLayer = globals.controls.some((c) => c.host === 'thisLayer');
  if (hasThisLayer) {
    lines.push(
      '  var targets = comp.selectedLayers;',
      '  if (!targets.length) { skipped.push("Controls for \\"this layer\\": select the layer(s) you\'ll apply the expression to, then run again"); }',
    );
  }

  for (const c of globals.controls) {
    const info = CONTROLS[c.type];
    const items = c.type === 'dropdown' && c.dropdownItems?.length ? `[${c.dropdownItems.map(jsxString).join(', ')}]` : 'null';
    const args = `${jsxString(c.effectName)}, ${jsxString(info.effectMatchName)}, ${value(c)}, ${items}`;
    if (c.host === 'ctrls') lines.push(`  ensureControl(globalsLayer, ${args});`);
    else if (c.host === 'thisLayer') lines.push(`  for (var t = 0; t < targets.length; t++) { ensureControl(targets[t], ${args}); }`);
    else {
      const v = layerVar.get(c.host.layerId);
      if (v) lines.push(`  if (${v}) { ensureControl(${v}, ${args}); }`);
    }
  }

  lines.push(
    '',
    '  app.endUndoGroup();',
    `  var report = ${jsxString(`${APP_NAME} setup`)} + "\\n\\nCreated:\\n" + (made.length ? made.join("\\n") : "nothing new");`,
    '  if (skipped.length) { report += "\\n\\nSkipped:\\n" + skipped.join("\\n"); }',
    '  alert(report);',
    '})();',
    '',
  );
  return lines.join('\n');
}
