// Node library registry. Node defs live as JSON, one file per category (spec §4).
import { nodeDefSchema } from '../schema';
import type { NodeDef } from '../types';
import context from './context.json';
import globals from './globals.json';
import animation from './animation.json';
import utility from './utility.json';

export const NODE_FILES: Record<string, unknown[]> = { context, globals, animation, utility };

function load(): Map<string, NodeDef> {
  const map = new Map<string, NodeDef>();
  for (const [file, defs] of Object.entries(NODE_FILES)) {
    for (const raw of defs) {
      const parsed = nodeDefSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Invalid node def in ${file}.json: ${parsed.error.message}`);
      }
      if (map.has(parsed.data.id)) throw new Error(`Duplicate node def id: ${parsed.data.id}`);
      map.set(parsed.data.id, parsed.data as NodeDef);
    }
  }
  return map;
}

export const NODE_DEFS: ReadonlyMap<string, NodeDef> = load();
