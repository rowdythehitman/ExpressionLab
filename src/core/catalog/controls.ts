// Expression control metadata (spec §9 rule 3, §10.2).
import type { ControlType, PortType } from '../types';

export interface ControlInfo {
  /** Label used in the setup checklist, e.g. "Slider Control". */
  label: string;
  /** Display name of the control's parameter (localised in non-English AE). */
  paramName: string;
  /** Match name, emitted when settings.useMatchNames is on. TODO verify in AE (docs/ae-verification.md). */
  matchName: string;
  outputType: PortType;
  /** Effect match name, used by the .jsx setup script to add the control. */
  effectMatchName: string;
}

export const CONTROLS: Record<ControlType, ControlInfo> = {
  slider: { label: 'Slider Control', paramName: 'Slider', matchName: 'ADBE Slider Control-0001', outputType: 'number', effectMatchName: 'ADBE Slider Control' },
  checkbox: { label: 'Checkbox Control', paramName: 'Checkbox', matchName: 'ADBE Checkbox Control-0001', outputType: 'number', effectMatchName: 'ADBE Checkbox Control' },
  dropdown: { label: 'Dropdown Menu Control', paramName: 'Menu', matchName: 'ADBE Dropdown Control-0001', outputType: 'number', effectMatchName: 'ADBE Dropdown Control' },
  color: { label: 'Color Control', paramName: 'Color', matchName: 'ADBE Color Control-0001', outputType: 'color', effectMatchName: 'ADBE Color Control' },
  point: { label: 'Point Control', paramName: 'Point', matchName: 'ADBE Point Control-0001', outputType: 'vec2', effectMatchName: 'ADBE Point Control' },
  point3d: { label: '3D Point Control', paramName: '3D Point', matchName: 'ADBE Point3D Control-0001', outputType: 'vec3', effectMatchName: 'ADBE Point3D Control' },
  angle: { label: 'Angle Control', paramName: 'Angle', matchName: 'ADBE Angle Control-0001', outputType: 'number', effectMatchName: 'ADBE Angle Control' },
  layer: { label: 'Layer Control', paramName: 'Layer', matchName: 'ADBE Layer Control-0001', outputType: 'layer', effectMatchName: 'ADBE Layer Control' },
};
