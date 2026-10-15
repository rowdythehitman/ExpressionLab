import type { PropertyDef, TargetDef } from '../types';
import targets from './targets.json';
import properties from './properties.json';
import reserved from './reserved.json';

export const TARGETS: ReadonlyMap<string, TargetDef> = new Map(
  (targets as TargetDef[]).map((t) => [t.id, t]),
);

export const PROPERTIES: ReadonlyMap<string, PropertyDef> = new Map(
  (properties as PropertyDef[]).map((p) => [p.path, p]),
);

export const RESERVED: ReadonlySet<string> = new Set([...reserved.js, ...reserved.ae]);
