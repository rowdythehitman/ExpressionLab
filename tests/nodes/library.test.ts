import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NODE_DEFS } from '../../src/core';

const coreDir = new URL('../../src/core/', import.meta.url).pathname;

describe('node library', () => {
  it('loads and validates every node def', () => {
    expect(NODE_DEFS.size).toBeGreaterThan(0);
    for (const d of NODE_DEFS.values()) expect(d.id).toMatch(/^[a-z]+(\.[A-Za-z0-9]+)?$/);
  });

  it('core has no React or DOM dependencies', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
      );
    for (const f of walk(coreDir)) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from ['"](react|react-dom|@xyflow\/react|zustand)/);
      expect(src, f).not.toMatch(/\b(document|window)\./);
    }
  });
});
