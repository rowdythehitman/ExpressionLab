// Builds the mock AE context for the Output Preview from the project's globals.
import { CONTROLS, TARGETS, type ControlType, type Graph, type Project, type ValueType } from '../../core';
import type { MockContext, MockLayer } from '../../core/runtime/mockAE.js';

export const DEFAULT_CONTROL_VALUE: Record<ControlType, number | number[] | null> = {
  slider: 50,
  checkbox: 1,
  dropdown: 1,
  color: [1, 0.5, 0, 1],
  point: [960, 540],
  point3d: [960, 540, 0],
  angle: 0,
  layer: null,
};

/** A plausible starting value for the property the expression is applied to. */
export function defaultPropertyValue(graph: Graph, valueType: ValueType): unknown {
  const id = graph.target.id;
  if (id.startsWith('position')) return valueType === 'vec3' ? [960, 540, 0] : [960, 540];
  if (id.startsWith('scale')) return valueType === 'vec3' ? [100, 100, 100] : [100, 100];
  if (id.startsWith('anchorPoint')) return valueType === 'vec3' ? [0, 0, 0] : [0, 0];
  if (id === 'opacity' || id === 'textSelectorAmount') return 100;
  const byType: Partial<Record<ValueType, unknown>> = {
    number: 0, vec2: [0, 0], vec3: [0, 0, 0], color: [1, 1, 1, 1], string: 'Text', boolean: true,
  };
  return byType[valueType] ?? 0;
}

export interface PreviewInputs {
  time: number;
  value: unknown;
  markers: number[];
  textIndex: number;
  textTotal: number;
}

export function buildContext(project: Project, inputs: PreviewInputs): MockContext {
  const { globals, settings } = project;
  const layers: Record<string, MockLayer> = {
    [globals.ctrls.layerName]: { name: globals.ctrls.layerName, effects: {} },
  };
  for (const l of globals.layers) {
    layers[l.layerName] = {
      name: l.layerName,
      rect: l.kind === 'text' ? { left: -120, top: -40, width: 240, height: 60 } : undefined,
      effects: {},
    };
  }
  const thisLayer: MockLayer = { name: '1 Layer', effects: {}, rect: { left: -120, top: -40, width: 240, height: 60 } };
  for (const c of globals.controls) {
    const v = c.previewValue ?? DEFAULT_CONTROL_VALUE[c.type];
    if (v == null) continue;
    const host = c.host === 'ctrls' ? layers[globals.ctrls.layerName]
      : c.host === 'thisLayer' ? thisLayer
      : layers[globals.layers.find((l) => typeof c.host === 'object' && l.id === c.host.layerId)?.layerName ?? ''];
    if (!host) continue;
    const info = CONTROLS[c.type];
    host.effects![`${c.effectName}/${settings.useMatchNames ? info.matchName : info.paramName}`] = v;
  }
  return {
    time: inputs.time,
    value: inputs.value,
    markers: inputs.markers,
    textIndex: inputs.textIndex,
    textTotal: inputs.textTotal,
    thisLayer,
    layers,
  };
}

/** Value type of a graph's target. */
export function targetType(graph: Graph): ValueType {
  return TARGETS.get(graph.target.id)?.valueType ?? graph.target.valueType ?? 'number';
}

/** Formats a value for display. */
export function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : String(v);
  if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}

/** Parses what someone typed for a value of `type` ("960, 540" for vectors). */
export function parseValue(text: string, type: string): unknown {
  if (type === 'string') return text;
  if (type === 'boolean') return text.trim() === 'true' || text.trim() === '1';
  const nums = text.split(/[,\s]+/).filter(Boolean).map(Number);
  if (type === 'number') return nums[0] ?? 0;
  return nums;
}
