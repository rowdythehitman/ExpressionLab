// Maps a property selected in AE to the graph target that fits it ("Use selected property").
import type { TargetSpec, ValueType } from '../../core';
import type { PropertyInfo } from './index';

const BY_VALUE_TYPE: Record<string, ValueType> = {
  OneD: 'number',
  TwoD: 'vec2',
  TwoD_SPATIAL: 'vec2',
  ThreeD: 'vec3',
  ThreeD_SPATIAL: 'vec3',
  COLOR: 'color',
  SHAPE: 'path',
  TEXT_DOCUMENT: 'string',
};

const TRANSFORM_2D_3D: Record<string, string> = {
  'ADBE Position': 'position',
  'ADBE Scale': 'scale',
  'ADBE Anchor Point': 'anchorPoint',
};

const BY_MATCH_NAME: Record<string, string> = {
  'ADBE Rotate Z': 'rotation',
  'ADBE Opacity': 'opacity',
  'ADBE Text Document': 'sourceText',
  'ADBE Text Expressible Amount': 'textSelectorAmount',
  'ADBE Vector Shape': 'shapePath',
  'ADBE Mask Shape': 'maskPath',
  'ADBE Vector Stroke Width': 'shapeStrokeWidth',
  'ADBE Vector Fill Color': 'shapeFillColor',
};

const TEXT_ANIMATOR_TYPES: ValueType[] = ['number', 'vec2', 'color'];

/** The target for a selected property, or null when the app can't write expressions for it. */
export function targetForProperty(p: PropertyInfo): TargetSpec | null {
  const valueType = BY_VALUE_TYPE[p.valueType];
  const base = TRANSFORM_2D_3D[p.matchName];
  if (base && p.parents.at(-1) === 'ADBE Transform Group') {
    // A 2D layer's Position is still a ThreeD_SPATIAL property in AE; the layer's 3D switch decides.
    return { id: `${base}${p.layer.threeD ? '3D' : '2D'}` };
  }
  const id = BY_MATCH_NAME[p.matchName];
  if (id) return { id };
  if (!valueType) return null;
  if (p.parents.includes('ADBE Text Animator Properties') && TEXT_ANIMATOR_TYPES.includes(valueType)) {
    return { id: 'textAnimatorProperty', valueType };
  }
  if (p.parents[0] === 'ADBE Effect Parade') {
    if (valueType === 'number') return { id: 'effectNumber' };
    if (valueType === 'color') return { id: 'effectColor' };
  }
  return { id: 'custom', valueType };
}
