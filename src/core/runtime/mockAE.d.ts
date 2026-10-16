// Types for mockAE.js (kept as plain JS so it can also run inside the preview sandbox).
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
  /** "Effect Name/Param" → value */
  effects?: Record<string, unknown>;
}

export interface MockContext {
  time?: number;
  value?: unknown;
  index?: number;
  inPoint?: number;
  outPoint?: number;
  fps?: number;
  compWidth?: number;
  compHeight?: number;
  /** Markers on this layer, ascending: times, or { time, duration, comment }. */
  markers?: Array<number | { time: number; duration?: number; comment?: string }>;
  /** Keyframes of the current property (for loopIn/loopOut), ascending by time. */
  keys?: Array<{ time: number; value: Num }>;
  textIndex?: number;
  textTotal?: number;
  selectorValue?: number;
  thisLayer?: MockLayer;
  layers?: Record<string, MockLayer>;
  parent?: MockLayer;
}

export function evaluateDetailed(
  code: string,
  ctx?: MockContext,
  overrides?: Record<string, unknown>,
): { value: unknown; probes: Record<string, unknown> };

export function evaluate(code: string, ctx?: MockContext): unknown;
