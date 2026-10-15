import type { TargetDef } from '../types';
import targets from './targets.json';
import reserved from './reserved.json';

export const TARGETS: ReadonlyMap<string, TargetDef> = new Map(
  (targets as TargetDef[]).map((t) => [t.id, t]),
);

export const RESERVED: ReadonlySet<string> = new Set([...reserved.js, ...reserved.ae]);
