// zod schemas for project files and node defs (spec §5).
import { z } from 'zod';
import { VALUE_TYPES } from './types';
import type { NodeDef, PortType, Project } from './types';

export const valueTypeSchema = z.enum(VALUE_TYPES);

const generic = '(?:' + VALUE_TYPES.join('|') + '|T|V)';
const portTypeRe = new RegExp(`^(?:${generic}|property<${generic}>)$`);
export const portTypeSchema = z.custom<PortType>(
  (v) => typeof v === 'string' && portTypeRe.test(v),
  'invalid port type',
);

export const literalSchema = z.union([z.number(), z.string(), z.boolean(), z.array(z.number())]);

export const tplSchema = z.union([
  z.string(),
  z.array(z.object({ when: z.string().optional(), text: z.string() })).min(1),
]);

export const portDefSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  type: portTypeSchema,
  default: literalSchema.optional(),
  optional: z.boolean().optional(),
  widget: z.enum(['number', 'slider', 'angle', 'color', 'text', 'checkbox']).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  acceptsScalar: z.string().optional(),
});

export const paramDefSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  kind: z.enum(['select', 'number', 'text', 'checkbox']),
  options: z.array(z.string()).optional(),
  default: literalSchema,
  emit: z.enum(['raw', 'string']).optional(),
  advanced: z.boolean().optional(),
});

export const nodeDefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  category: z.enum([
    'context', 'globals', 'math', 'vector', 'animation',
    'logic', 'space', 'text', 'marker', 'output', 'utility',
  ]),
  description: z.string(),
  tags: z.array(z.string()),
  generics: z.record(z.string(), z.array(valueTypeSchema)).optional(),
  inputs: z.array(portDefSchema),
  params: z.array(paramDefSchema).optional(),
  outputs: z.array(z.object({ id: z.string().min(1), label: z.string(), type: portTypeSchema, expr: tplSchema })),
  locals: z.array(z.string()).optional(),
  statements: z.array(tplSchema).optional(),
  hoist: z.literal('top').optional(),
  hoistKey: z.string().optional(),
  contexts: z.array(z.string()).optional(),
  requires: z
    .object({ keyframes: z.boolean().optional(), minAE: z.number().optional(), parent: z.boolean().optional() })
    .optional(),
  special: z.enum(['ref.control', 'ref.layer', 'ref.property', 'literal', 'output', 'reroute', 'comment']).optional(),
  inline: z.boolean().optional(),
  noInline: z.boolean().optional(),
  source: z.string().optional(),
  verify: z.string().optional(),
}) satisfies z.ZodType<NodeDef>;

const xy = z.object({ x: z.number(), y: z.number() });

export const nodeInstanceSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: xy,
  name: z.string().optional(),
  inputs: z.record(z.string(), literalSchema),
  params: z.record(z.string(), literalSchema),
  ref: z
    .object({ controlId: z.string().optional(), layerId: z.string().optional(), propertyPath: z.string().optional() })
    .optional(),
  color: z.string().max(64).optional(),
  preview: z.boolean().optional(),
});

const endpoint = z.object({ node: z.string(), port: z.string() });
export const edgeSchema = z.object({ id: z.string().min(1), from: endpoint, to: endpoint });

export const graphSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  target: z.object({ id: z.string(), valueType: valueTypeSchema.optional() }),
  nodes: z.array(nodeInstanceSchema),
  edges: z.array(edgeSchema),
});

export const globalsSchema = z.object({
  ctrls: z.object({ layerName: z.string().min(1) }),
  layers: z.array(
    z.object({
      id: z.string().min(1),
      key: z.string(),
      layerName: z.string(),
      is3D: z.boolean(),
      kind: z.enum(['null', 'text', 'shape', 'solid', 'precomp', 'other']),
    }),
  ),
  controls: z.array(
    z.object({
      id: z.string().min(1),
      effectName: z.string(),
      type: z.enum(['slider', 'checkbox', 'dropdown', 'color', 'point', 'point3d', 'angle', 'layer']),
      host: z.union([z.literal('ctrls'), z.literal('thisLayer'), z.object({ layerId: z.string() })]),
      dropdownItems: z.array(z.string()).optional(),
      previewValue: z.union([z.number(), z.array(z.number())]).optional(),
    }),
  ),
  comps: z.array(z.object({ id: z.string().min(1), name: z.string() })),
});

export const settingsSchema = z.object({
  aeTarget: z.number(),
  useMatchNames: z.boolean(),
  comments: z.enum(['none', 'minimal', 'verbose']),
  embedGraph: z.boolean(),
  inlineSingleUse: z.boolean().optional(),
});

export const projectSchema = z.object({
  version: z.literal(1),
  globals: globalsSchema,
  graphs: z.array(graphSchema),
  settings: settingsSchema,
}) satisfies z.ZodType<Project>;

export const DEFAULT_SETTINGS = {
  aeTarget: 26,
  useMatchNames: false,
  comments: 'minimal',
  embedGraph: true,
} as const satisfies z.infer<typeof settingsSchema>;
