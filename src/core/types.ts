// Core data model (spec §5). Pure TypeScript: no React, no DOM.

export const VALUE_TYPES = [
  'number', 'vec2', 'vec3', 'color', 'string', 'boolean', 'path', 'layer', 'rect',
] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

/**
 * Port types are strings in JSON. 'T' = generic from NodeDef.generics.
 * 'V' = reserved generic bound to the graph target's value type.
 * 'property<X>' = a property object (not its value).
 */
export type PortType = ValueType | 'T' | 'V' | `property<${ValueType | 'T' | 'V'}>`;

export type Literal = number | string | boolean | number[];

/** A template is a string, or an ordered list of branches (first matching `when` wins). */
export type Tpl = string | Array<{ when?: string; text: string }>;

export interface PortDef {
  id: string;
  label: string;
  type: PortType;
  default?: Literal;
  optional?: boolean;
  widget?: 'number' | 'slider' | 'angle' | 'color' | 'text' | 'checkbox';
  min?: number;
  max?: number;
  step?: number;
  /**
   * `when` condition under which a plain `number` is also accepted on this generic port
   * (native AE `vecN * number`, spec §6 rule 1). Extension to the spec's PortDef.
   */
  acceptsScalar?: string;
}

export interface ParamDef {
  id: string;
  label: string;
  kind: 'select' | 'number' | 'text' | 'checkbox';
  options?: string[];
  default: Literal;
  emit?: 'raw' | 'string';
  advanced?: boolean;
}

export type NodeCategory =
  | 'context' | 'globals' | 'math' | 'vector' | 'animation'
  | 'logic' | 'space' | 'text' | 'marker' | 'output' | 'utility';

export interface OutputDef {
  id: string;
  label: string;
  type: PortType;
  expr: Tpl;
}

export type SpecialKind =
  | 'ref.control' | 'ref.layer' | 'ref.property' | 'literal' | 'output' | 'reroute' | 'comment';

export interface NodeDef {
  id: string;
  label: string;
  category: NodeCategory;
  description: string;
  tags: string[];
  generics?: Record<string, ValueType[]>;
  inputs: PortDef[];
  params?: ParamDef[];
  outputs: OutputDef[];
  locals?: string[];
  statements?: Tpl[];
  hoist?: 'top';
  hoistKey?: string;
  contexts?: string[];
  requires?: { keyframes?: boolean; minAE?: number; parent?: boolean };
  special?: SpecialKind;
  /** Substitute the expression where it's used instead of emitting a `const` (refs, literals). */
  inline?: boolean;
  /** For ref.control nodes: the control types this node can read (e.g. dropdown-only `.text`). */
  controlTypes?: ControlType[];
  /** Never fold into the consumer, e.g. nodes whose result depends on random-seed state (wiggle). */
  noInline?: boolean;
  source?: string;
  verify?: string;
}

export interface NodeInstance {
  id: string;
  type: string;
  position: { x: number; y: number };
  name?: string;
  inputs: Record<string, Literal>;
  params: Record<string, Literal>;
  ref?: { controlId?: string; layerId?: string; propertyPath?: string };
  /** Header colour on the canvas (CSS colour); default is the category colour. */
  color?: string;
  /** Shown in the Output Preview panel. */
  preview?: boolean;
}

export interface Edge {
  id: string;
  from: { node: string; port: string };
  to: { node: string; port: string };
}

export interface TargetSpec {
  /** Id into catalog/targets.json, e.g. 'position2D'. */
  id: string;
  /** Only for targets whose value type is user-selected ('custom', 'textAnimatorProperty'). */
  valueType?: ValueType;
}

export interface Graph {
  id: string;
  name: string;
  target: TargetSpec;
  nodes: NodeInstance[];
  edges: Edge[];
}

export type ControlType =
  | 'slider' | 'checkbox' | 'dropdown' | 'color' | 'point' | 'point3d' | 'angle' | 'layer';

export type LayerKind = 'null' | 'text' | 'shape' | 'solid' | 'precomp' | 'other';

export interface LayerGlobal {
  id: string;
  key: string;
  layerName: string;
  is3D: boolean;
  kind: LayerKind;
}

export type ControlHost = 'ctrls' | 'thisLayer' | { layerId: string };

export interface ControlGlobal {
  id: string;
  effectName: string;
  type: ControlType;
  host: ControlHost;
  dropdownItems?: string[];
  /** Value the Output Preview uses for this control (and the .jsx setup script sets). */
  previewValue?: number | number[];
}

export interface Globals {
  ctrls: { layerName: string };
  layers: LayerGlobal[];
  controls: ControlGlobal[];
  comps: Array<{ id: string; name: string }>;
}

export interface Settings {
  aeTarget: number;
  useMatchNames: boolean;
  comments: 'none' | 'minimal' | 'verbose';
  embedGraph: boolean;
  /** Phase 2: substitute single-use, side-effect-free nodes into their consumer. Default false. */
  inlineSingleUse?: boolean;
}

export interface Project {
  version: 1;
  globals: Globals;
  graphs: Graph[];
  settings: Settings;
}

export interface TargetDef {
  id: string;
  label: string;
  /** null = user-selected (see TargetSpec.valueType). */
  valueType: ValueType | null;
  allowedValueTypes?: ValueType[];
  /** Context names that node `contexts` lists are checked against. */
  contexts: string[];
  applyTo: string;
}

/** Entry in catalog/properties.json, used by ref.property. */
export interface PropertyDef {
  path: string;
  label: string;
  type: ValueType;
  /** Type on a 3D layer, when it differs. */
  type3D?: ValueType;
  matchName?: string;
}

// ---- Compiler output ----

export type Severity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  | 'CYCLE' | 'TYPE_MISMATCH' | 'DIM_MISMATCH' | 'MISSING_INPUT' | 'NO_OUTPUT'
  | 'MULTIPLE_OUTPUTS' | 'CONTEXT_UNAVAILABLE' | 'UNRESOLVED_PLACEHOLDER'
  | 'HOIST_IMPURE_UPSTREAM' | 'HOIST_DUPLICATE' | 'RESERVED_NAME' | 'GLOBAL_NOT_FOUND'
  | 'NEEDS_KEYFRAMES' | 'NEEDS_PARENT' | 'MIN_AE_VERSION' | 'UNUSED_NODE' | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_PROJECT' | 'UNKNOWN_NODE_TYPE' | 'DANGLING_EDGE' | 'DUPLICATE_ID';

export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
}

/** nodeId → [startLine, endLine], 1-based inclusive. */
export type SourceMap = Record<string, [number, number]>;

export interface CompileResult {
  code: string;
  diagnostics: Diagnostic[];
  checklist: ChecklistItem[];
  sourceMap: SourceMap;
  /** nodeId → the variable names emitted for it (empty when inlined). */
  variables: Record<string, string[]>;
}
