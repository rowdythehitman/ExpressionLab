import { describe, expect, it } from 'vitest';
import { parseProjectFile } from '../../src/app/persist';
import { PRESETS } from '../../src/core/presets';

describe('.aenodes.json import/export', () => {
  it('round-trips a project through JSON', () => {
    const p = PRESETS[1]!.project;
    expect(parseProjectFile(JSON.stringify(p, null, 2))).toEqual(p);
  });
  it('rejects bad files with a readable message', () => {
    expect(() => parseProjectFile('nope')).toThrow('Not a JSON file');
    expect(() => parseProjectFile('{"version":1}')).toThrow(/Not a valid project: globals/);
  });
});
