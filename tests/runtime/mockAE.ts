// A small, deterministic stand-in for the AE expression runtime (spec §13.5), so pure-numeric graphs
// can be evaluated in tests. It models the API surface our nodes emit, not AE's exact numerics:
// ease curves and wiggle/noise are smooth and deterministic, but not bit-identical to AE.
type Num = number | number[];

export interface MockLayer {
  name?: string;
  width?: number;
  height?: number;
  index?: number;
  position?: Num;
  scale?: Num;
  rotation?: number;
  opacity?: number;
  anchorPoint?: Num;
  sourceText?: string;
  rect?: { left: number; top: number; width: number; height: number };
  effects?: Record<string, Num>; // "Effect Name/Param" → value
}

export interface MockContext {
  time?: number;
  value?: Num;
  index?: number;
  inPoint?: number;
  outPoint?: number;
  fps?: number;
  compWidth?: number;
  compHeight?: number;
  /** Marker times on this layer, ascending. */
  markers?: number[];
  /** Keyframes of the current property (for loopIn/loopOut), ascending by time. */
  keys?: Array<{ time: number; value: Num }>;
  textIndex?: number;
  textTotal?: number;
  selectorValue?: number;
  thisLayer?: MockLayer;
  layers?: Record<string, MockLayer>;
  parent?: MockLayer;
}

const isArr = (v: Num): v is number[] => Array.isArray(v);
const zip = (a: Num, b: Num, f: (x: number, y: number) => number): Num =>
  isArr(a) ? a.map((x, i) => f(x, isArr(b) ? b[i]! : b)) : isArr(b) ? b.map((y) => f(a, y)) : f(a, b);

function interp(t: number, tMin: number, tMax: number, v1: Num, v2: Num, curve: (u: number) => number): Num {
  if (tMax < tMin) [tMin, tMax, v1, v2] = [tMax, tMin, v2, v1];
  const u = tMax === tMin ? (t >= tMax ? 1 : 0) : Math.min(1, Math.max(0, (t - tMin) / (tMax - tMin)));
  const k = curve(u);
  return zip(v1, v2, (a, b) => a + (b - a) * k);
}

/** Smooth 1D value noise in [-1, 1]. */
function smoothNoise(x: number, seed: number): number {
  const h = (n: number) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function property(get: (t: number) => Num, ctx: Required<Pick<MockContext, 'time'>>) {
  return {
    get value() { return get(ctx.time); },
    valueAtTime: (t: number) => get(t),
    wiggle: (freq: number, amp: number, oct = 1, mult = 0.5, t = ctx.time) => wiggleOf(get(t), freq, amp, oct, mult, t, 7),
    loopOut: () => get(ctx.time),
    loopIn: () => get(ctx.time),
  };
}

function wiggleOf(base: Num, freq: number, amp: number, oct: number, mult: number, t: number, seed: number): Num {
  const at = (dim: number) => {
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

function layerObject(l: MockLayer, ctx: Required<Pick<MockContext, 'time'>>) {
  const fx = l.effects ?? {};
  const constant = (v: Num | undefined, fallback: Num) => property(() => v ?? fallback, ctx);
  return {
    name: l.name ?? '1 Layer',
    width: l.width ?? 100,
    height: l.height ?? 100,
    index: l.index ?? 1,
    transform: {
      position: constant(l.position, [0, 0]),
      scale: constant(l.scale, [100, 100]),
      rotation: constant(l.rotation, 0),
      opacity: constant(l.opacity, 100),
      anchorPoint: constant(l.anchorPoint, [0, 0]),
    },
    text: { sourceText: constant(l.sourceText as unknown as Num, '' as unknown as Num) },
    effect: (name: string) => (param: string) => {
      const v = fx[`${name}/${param}`];
      if (v === undefined) throw new Error(`mock: no effect ${name}/${param}`);
      return v;
    },
    sourceRectAtTime: () => l.rect ?? { left: 0, top: 0, width: l.width ?? 100, height: l.height ?? 100 },
    toComp: (p: Num) => p,
    fromComp: (p: Num) => p,
    toWorld: (p: Num) => p,
    fromWorld: (p: Num) => p,
  };
}

/** Evaluates a compiled expression (payload line ignored) and returns its result. */
export function evaluate(code: string, c: MockContext = {}): unknown {
  const ctx = {
    time: c.time ?? 0,
    value: c.value ?? 0,
    index: c.index ?? 1,
  };
  const fps = c.fps ?? 25;
  let rand = mulberry32(1);
  const keys = c.keys ?? [];
  const markers = c.markers ?? [];
  const self = layerObject({ name: '1 Layer', ...c.thisLayer }, ctx);
  const layers = Object.fromEntries(Object.entries(c.layers ?? {}).map(([n, l]) => [n, layerObject({ name: n, ...l }, ctx)]));

  const loop = (dir: 'in' | 'out') => (mode = 'cycle') => {
    if (keys.length < 2) throw new Error('mock: loop needs 2+ keyframes');
    if (mode !== 'cycle') throw new Error(`mock: loop mode ${mode} not modelled`);
    const first = keys[0]!;
    const last = keys.at(-1)!;
    const span = last.time - first.time;
    let t = ctx.time;
    if (dir === 'out' && t > last.time) t = first.time + ((t - first.time) % span);
    if (dir === 'in' && t < first.time) t = last.time - ((last.time - t) % span);
    return keyValue(t);
  };
  const keyValue = (t: number): Num => {
    if (!keys.length) return ctx.value;
    if (t <= keys[0]!.time) return keys[0]!.value;
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1]!;
      const b = keys[i]!;
      if (t <= b.time) return interp(t, a.time, b.time, a.value, b.value, (u) => u);
    }
    return keys.at(-1)!.value;
  };
  if (keys.length) ctx.value = keyValue(ctx.time);

  const env: Record<string, unknown> = {
    time: ctx.time,
    value: ctx.value,
    index: ctx.index,
    inPoint: c.inPoint ?? 0,
    outPoint: c.outPoint ?? 10,
    textIndex: c.textIndex,
    textTotal: c.textTotal,
    selectorValue: c.selectorValue ?? 100,
    thisComp: {
      frameDuration: 1 / fps,
      width: c.compWidth ?? 1920,
      height: c.compHeight ?? 1080,
      layer: (name: string) => {
        const l = layers[name];
        if (!l) throw new Error(`mock: no layer ${name}`);
        return l;
      },
    },
    thisLayer: self,
    parent: c.parent ? layerObject(c.parent, ctx) : undefined,
    hasParent: !!c.parent,
    transform: self.transform,
    effect: self.effect,
    marker: {
      numKeys: markers.length,
      key: (i: number) => ({ time: markers[i - 1]!, index: i }),
      nearestKey: (t: number) => {
        let best = 0;
        markers.forEach((m, i) => { if (Math.abs(m - t) < Math.abs(markers[best]! - t)) best = i; });
        return { time: markers[best]!, index: best + 1 };
      },
    },
    linear: (t: number, a: number, b: number, v1: Num, v2: Num) => interp(t, a, b, v1, v2, (u) => u),
    ease: (t: number, a: number, b: number, v1: Num, v2: Num) => interp(t, a, b, v1, v2, (u) => u * u * (3 - 2 * u)),
    easeIn: (t: number, a: number, b: number, v1: Num, v2: Num) => interp(t, a, b, v1, v2, (u) => u * u),
    easeOut: (t: number, a: number, b: number, v1: Num, v2: Num) => interp(t, a, b, v1, v2, (u) => 1 - (1 - u) * (1 - u)),
    clamp: (v: number, a: number, b: number) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b)),
    add: (a: Num, b: Num) => zip(a, b, (x, y) => x + y),
    sub: (a: Num, b: Num) => zip(a, b, (x, y) => x - y),
    mul: (a: Num, k: number) => zip(a, k, (x, y) => x * y),
    div: (a: Num, k: number) => zip(a, k, (x, y) => x / y),
    length: (a: Num, b?: Num) => {
      const d = b === undefined ? a : zip(a, b, (x, y) => x - y);
      return isArr(d) ? Math.hypot(...d) : Math.abs(d);
    },
    degreesToRadians: (d: number) => (d * Math.PI) / 180,
    radiansToDegrees: (r: number) => (r * 180) / Math.PI,
    noise: (x: number) => smoothNoise(x, 3),
    seedRandom: (seed: number, timeless = false) => {
      rand = mulberry32(Math.round(seed * 1000) + (timeless ? 0 : Math.round(ctx.time * fps) * 7919));
    },
    random: (a?: number, b?: number) => (b === undefined ? (a ?? 1) * rand() : a! + (b - a!) * rand()),
    wiggle: (freq: number, amp: number, oct = 1, mult = 0.5, t = ctx.time) => wiggleOf(t === ctx.time ? ctx.value : keyValue(t), freq, amp, oct, mult, t, 7),
    loopOut: loop('out'),
    loopIn: loop('in'),
    posterizeTime: () => {},
  };

  const lines = code.split('\n').filter((l) => !l.startsWith('//@ae-nodes:'));
  while (lines.length && !lines.at(-1)!.trim()) lines.pop();
  const last = lines.pop() ?? 'undefined';
  const names = Object.keys(env);
  const fn = new Function(...names, `"use strict";\n${lines.join('\n')}\nreturn (${last});`) as (...a: unknown[]) => unknown;
  return fn(...names.map((n) => env[n]));
}
