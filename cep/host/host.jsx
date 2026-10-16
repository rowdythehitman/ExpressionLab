// ExpressionLab panel: host script (ExtendScript, ES3). The CEP panel loads this into After Effects at
// startup and calls ExpressionLab.* through evalScript. Every call returns JSON text:
// { "ok": true, ... } or { "ok": false, "error": "..." }. ExtendScript has no JSON object, so values are
// serialised by hand.
var ExpressionLab = (function () {
  function quote(s) {
    s = String(s);
    var out = '"';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var code = s.charCodeAt(i);
      if (c === '"') { out += '\\"'; }
      else if (c === '\\') { out += '\\\\'; }
      else if (code < 32 || code === 0x2028 || code === 0x2029) {
        var hex = code.toString(16);
        out += '\\u' + '0000'.substr(hex.length) + hex;
      }
      else { out += c; }
    }
    return out + '"';
  }

  function json(v) {
    if (v === null || v === undefined) { return 'null'; }
    var t = typeof v;
    if (t === 'number') { return isFinite(v) ? String(v) : 'null'; }
    if (t === 'boolean') { return v ? 'true' : 'false'; }
    if (t === 'string') { return quote(v); }
    var parts = [];
    var i;
    if (v instanceof Array) {
      for (i = 0; i < v.length; i++) { parts.push(json(v[i])); }
      return '[' + parts.join(',') + ']';
    }
    for (var k in v) {
      if (v.hasOwnProperty(k)) { parts.push(quote(k) + ':' + json(v[k])); }
    }
    return '{' + parts.join(',') + '}';
  }

  var VALUE_TYPES = ['NO_VALUE', 'OneD', 'TwoD', 'TwoD_SPATIAL', 'ThreeD', 'ThreeD_SPATIAL', 'COLOR',
    'SHAPE', 'TEXT_DOCUMENT', 'CUSTOM_VALUE', 'MARKER', 'LAYER_INDEX', 'MASK_INDEX'];

  function valueTypeName(prop) {
    for (var i = 0; i < VALUE_TYPES.length; i++) {
      if (prop.propertyValueType === PropertyValueType[VALUE_TYPES[i]]) { return VALUE_TYPES[i]; }
    }
    return 'unknown';
  }

  function activeComp() {
    var comp = app.project.activeItem;
    return comp && comp instanceof CompItem ? comp : null;
  }

  /** The selected properties that can take an expression (groups and effects themselves can't). */
  function settable(comp) {
    var out = [];
    var sel = comp.selectedProperties;
    for (var i = 0; i < sel.length; i++) {
      if (sel[i].propertyType === PropertyType.PROPERTY && sel[i].canSetExpression) { out.push(sel[i]); }
    }
    return out;
  }

  function layerOf(prop) {
    return prop.propertyGroup(prop.propertyDepth);
  }

  function label(prop) {
    return layerOf(prop).name + ' › ' + prop.name;
  }

  function describe(prop) {
    var layer = layerOf(prop);
    var parents = [];
    for (var d = prop.propertyDepth - 1; d >= 1; d--) { parents.push(prop.propertyGroup(d).matchName); }
    var threeD = false;
    try { threeD = !!layer.threeDLayer; } catch (e) { threeD = false; }
    return {
      name: prop.name,
      matchName: prop.matchName,
      valueType: valueTypeName(prop),
      // Outermost group first, e.g. ["ADBE Transform Group"] for Position.
      parents: parents.reverse(),
      expression: prop.expression,
      layer: { name: layer.name, index: layer.index, threeD: threeD, text: layer instanceof TextLayer }
    };
  }

  function fail(message) {
    return { ok: false, error: message };
  }

  var NO_COMP = 'Open a composition first, then select a property in the timeline.';
  var NO_PROP = 'Select a property in the timeline (for example Position) first.';

  function getSelection() {
    var comp = activeComp();
    if (!comp) { return { ok: true, comp: null, property: null, count: 0 }; }
    var props = settable(comp);
    return { ok: true, comp: comp.name, property: props.length ? describe(props[0]) : null, count: props.length };
  }

  function applyExpression(code) {
    var comp = activeComp();
    if (!comp) { return fail(NO_COMP); }
    var props = settable(comp);
    if (!props.length) { return fail(NO_PROP); }
    var applied = [];
    app.beginUndoGroup('ExpressionLab: apply expression');
    try {
      for (var i = 0; i < props.length; i++) {
        var r = { property: label(props[i]) };
        try {
          props[i].expression = code;
          props[i].expressionEnabled = true;
          if (props[i].expressionError) { r.error = props[i].expressionError; }
        } catch (e) {
          r.error = String(e.message || e);
        }
        applied.push(r);
      }
    } finally {
      app.endUndoGroup();
    }
    return { ok: true, applied: applied };
  }

  function readExpression() {
    var comp = activeComp();
    if (!comp) { return fail(NO_COMP); }
    var props = settable(comp);
    if (!props.length) { return fail(NO_PROP); }
    return { ok: true, property: label(props[0]), expression: props[0].expression };
  }

  function guard(fn) {
    return function (arg) {
      try {
        return json(fn(arg));
      } catch (e) {
        return json(fail('After Effects: ' + (e.message || e) + (e.line ? ' (line ' + e.line + ')' : '')));
      }
    };
  }

  return {
    version: 1,
    ping: guard(function () { return { ok: true, version: 1 }; }),
    getSelection: guard(getSelection),
    applyExpression: guard(applyExpression),
    readExpression: guard(readExpression)
  };
})();
