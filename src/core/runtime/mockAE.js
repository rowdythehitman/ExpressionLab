// A small, deterministic stand-in for the AE expression runtime (spec §13.5).
// Plain JavaScript with no imports on purpose: tests import it as a module, and the app's Output Preview
// loads this same file as text into a sandboxed iframe (so previewed code can't reach the page).
// It models the API surface our nodes emit, not AE's exact numerics: ease curves and wiggle/noise are
// smooth and deterministic, but not bit-identical to AE.

const isArr = (v) => Array.isArray(v);
const zip = (a, b, f) =>
  isArr(a) ? a.map((x, i) => f(x, isArr(b) ? b[i] : b)) : isArr(b) ? b.map((y) => f(a, y)) : f(a, b);

function interp(t, tMin, tMax, v1, v2, curve) {
  if (tMax < tMin) [tMin, tMax, v1, v2] = [tMax, tMin, v2, v1];
  const u = tMax === tMin ? (t >= tMax ? 1 : 0) : Math.min(1, Math.max(0, (t - tMin) / (tMax - tMin)));
  const k = curve(u);
  return zip(v1, v2, (a, b) => a + (b - a) * k);
}

/** Smooth 1D value noise in [-1, 1]. */
function smoothNoise(x, seed) {
  const h = (n) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wiggleOf(base, freq, amp, oct, mult, t, seed) {
  const at = (dim) => {
    let sum = 0;
    let a = 1;
    let f = freq;
    for (let o = 0; o < Math.max(1, Math.round(oct)); o++) {
      sum += smoothNoise(t * f, seed + dim * 13 + o * 101) * a;
      a *= mult;
      f *= 2;
    }
    return sum * amp;
  };
  return isArr(base) ? base.map((v, i) => v + at(i)) : base + at(0);
}

function property(get, ctx) {
  return {
    get value() { return get(ctx.time); },
    // Like AE, a property used in arithmetic evaluates to its value.
    valueOf() { return get(ctx.time); },
    valueAtTime: (t) => get(t),
    wiggle: (freq, amp, oct = 1, mult = 0.5, t = ctx.time) => wiggleOf(get(t), freq, amp, oct, mult, t, 7),
    loopOut: () => get(ctx.time),
    loopIn: () => get(ctx.time),
  };
}

function layerObject(l, ctx) {
  const fx = l.effects ?? {};
  const constant = (v, fallback) => property(() => v ?? fallback, ctx);
  return {
    name: l.name ?? '1 Layer',
    width: l.width ?? 100,
    height: l.height ?? 100,
    index: l.index ?? 1,
    hasParent: false,
    transform: {
      position: constant(l.position, [0, 0]),
      scale: constant(l.scale, [100, 100]),
      rotation: constant(l.rotation, 0),
      opacity: constant(l.opacity, 100),
      anchorPoint: constant(l.anchorPoint, [0, 0]),
    },
    text: { sourceText: constant(l.sourceText, '') },
    effect: (name) => (param) => {
      const v = fx[`${name}/${param}`];
      if (v === undefined) throw new Error(`no effect "${name}" / "${param}" on layer "${l.name ?? 'this layer'}"`);
      return v;
    },
    sourceRectAtTime: () => l.rect ?? { left: 0, top: 0, width: l.width ?? 100, height: l.height ?? 100 },
    toComp: (p) => p,
    fromComp: (p) => p,
    toWorld: (p) => p,
    fromWorld: (p) => p,
  };
}

/**
 * Evaluates a compiled expression (payload line ignored).
 * `overrides` feeds `__in(key)` (Output Preview overrides); `__probe(key, v)` calls are collected.
 * Returns { value, probes }.
 */
export function evaluateDetailed(code, c = {}, overrides = {}) {
  const ctx = { time: c.time ?? 0, value: c.value ?? 0, index: c.index ?? 1 };
  const fps = c.fps ?? 25;
  let rand = mulberry32(1);
  const keys = c.keys ?? [];
  const markers = c.markers ?? [];
  const self = layerObject({ name: '1 Layer', ...c.thisLayer }, ctx);
  const layers = Object.fromEntries(Object.entries(c.layers ?? {}).map(([n, l]) => [n, layerObject({ name: n, ...l }, ctx)]));
  const probes = {};
  // Markers may be plain times or { time, duration, comment }.
  const markerKey = (i) => {
    const m = markers[i - 1];
    return typeof m === 'number' ? { time: m, index: i, duration: 0, comment: '' } : { duration: 0, comment: '', ...m, index: i };
  };
  const markerTime = (m) => (typeof m === 'number' ? m : m.time);

  const keyValue = (t) => {
    if (!keys.length) return ctx.value;
    if (t <= keys[0].time) return keys[0].value;
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1];
      const b = keys[i];
      if (t <= b.time) return interp(t, a.time, b.time, a.value, b.value, (u) => u);
    }
    return keys.at(-1).value;
  };
  const loop = (dir) => (mode = 'cycle') => {
    if (keys.length < 2) throw new Error('loopIn/loopOut need 2+ keyframes on the property');
    if (mode !== 'cycle') throw new Error(`loop mode "${mode}" isn't modelled by the preview`);
    const first = keys[0];
    const last = keys.at(-1);
    const span = last.time - first.time;
    let t = ctx.time;
    if (dir === 'out' && t > last.time) t = first.time + ((t - first.time) % span);
    if (dir === 'in' && t < first.time) t = last.time - ((last.time - t) % span);
    return keyValue(t);
  };
  if (keys.length) ctx.value = keyValue(ctx.time);

  const env = {
    time: ctx.time,
    value: ctx.value,
    index: ctx.index,
    inPoint: c.inPoint ?? 0,
    outPoint: c.outPoint ?? 10,
    textIndex: c.textIndex,
    textTotal: c.textTotal,
    selectorValue: c.selectorValue ?? 100,
    numKeys: keys.length,
    key: (i) => keys[i - 1],
    valueAtTime: (t) => keyValue(t),
    thisComp: {
      frameDuration: 1 / fps,
      width: c.compWidth ?? 1920,
      height: c.compHeight ?? 1080,
      layer: (name) => {
        const l = layers[name];
        if (!l) throw new Error(`no layer named "${name}" in the comp`);
        return l;
      },
    },
    thisLayer: self,
    thisProperty: {
      ...property(keyValue, ctx),
      // AE 26: the key at/before t (first key if none), and the key after t (last key if none).
      previousKey: (t) => {
        if (!keys.length) throw new Error('previousKey needs keyframes on the property');
        const k = [...keys].reverse().find((x) => x.time <= t) ?? keys[0];
        return { time: k.time, value: k.value, index: keys.indexOf(k) + 1 };
      },
      nextKey: (t) => {
        if (!keys.length) throw new Error('nextKey needs keyframes on the property');
        const k = keys.find((x) => x.time > t) ?? keys.at(-1);
        return { time: k.time, value: k.value, index: keys.indexOf(k) + 1 };
      },
    },
    parent: c.parent ? layerObject(c.parent, ctx) : undefined,
    hasParent: !!c.parent,
    transform: self.transform,
    effect: self.effect,
    toComp: self.toComp,
    fromComp: self.fromComp,
    toWorld: self.toWorld,
    fromWorld: self.fromWorld,
    marker: {
      numKeys: markers.length,
      key: (i) => markerKey(i),
      previousKey: (t) => {
        let i = markers.length;
        while (i > 1 && markers[i - 1] > t) i--;
        return markerKey(i);
      },
      nearestKey: (t) => {
        let best = 0;
        markers.forEach((m, i) => { if (Math.abs(markerTime(m) - t) < Math.abs(markerTime(markers[best]) - t)) best = i; });
        return markerKey(best + 1);
      },
    },
    linear: (t, a, b, v1, v2) => interp(t, a, b, v1, v2, (u) => u),
    ease: (t, a, b, v1, v2) => interp(t, a, b, v1, v2, (u) => u * u * (3 - 2 * u)),
    easeIn: (t, a, b, v1, v2) => interp(t, a, b, v1, v2, (u) => u * u),
    easeOut: (t, a, b, v1, v2) => interp(t, a, b, v1, v2, (u) => 1 - (1 - u) * (1 - u)),
    clamp: (v, a, b) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b)),
    add: (a, b) => zip(a, b, (x, y) => x + y),
    sub: (a, b) => zip(a, b, (x, y) => x - y),
    mul: (a, k) => zip(a, k, (x, y) => x * y),
    div: (a, k) => zip(a, k, (x, y) => x / y),
    length: (a, b) => {
      const d = b === undefined ? a : zip(a, b, (x, y) => x - y);
      return isArr(d) ? Math.hypot(...d) : Math.abs(d);
    },
    degreesToRadians: (d) => (d * Math.PI) / 180,
    radiansToDegrees: (r) => (r * 180) / Math.PI,
    noise: (x) => smoothNoise(x, 3),
    seedRandom: (seed, timeless = false) => {
      rand = mulberry32(Math.round(seed * 1000) + (timeless ? 0 : Math.round(ctx.time * fps) * 7919));
    },
    random: (a, b) => (b === undefined ? (a ?? 1) * rand() : a + (b - a) * rand()),
    wiggle: (freq, amp, oct = 1, mult = 0.5, t = ctx.time) =>
      wiggleOf(t === ctx.time ? ctx.value : keyValue(t), freq, amp, oct, mult, t, 7),
    loopOut: loop('out'),
    loopIn: loop('in'),
    posterizeTime: () => {},
    __in: (k) => {
      if (!(k in overrides)) throw new Error(`no override value for ${k}`);
      return overrides[k];
    },
    __probe: (k, v) => {
      probes[k] = v;
    },
  };

  const lines = code.split('\n').filter((l) => !l.startsWith('//@ae-nodes:'));
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  const last = lines.pop() ?? 'undefined';
  const names = Object.keys(env);
  const fn = new Function(...names, `"use strict";\n${lines.join('\n')}\nreturn (${last});`);
  let value = fn(...names.map((n) => env[n]));
  // Like AE, an expression that ends in a property object resolves to its value.
  if (value && typeof value === 'object' && !Array.isArray(value) && 'valueAtTime' in value) value = value.value;
  return { value, probes };
}

/** Evaluates a compiled expression and returns its result. */
export function evaluate(code, c = {}) {
  return evaluateDetailed(code, c).value;
}
