import { describe, expect, it } from 'vitest';
import { compile, projectSchema } from '../../src/core';
import { PRESETS } from '../../src/core/presets';
import { assertParses } from '../helpers';

describe.each(PRESETS)('preset $id', ({ id, project }) => {
  const graphId = project.graphs[0]!.id;

  it('is a valid project file', () => {
    expect(projectSchema.safeParse(project).success).toBe(true);
  });

  it('compiles without errors or unused nodes', () => {
    const { diagnostics } = compile(project, graphId);
    expect(diagnostics.filter((d) => d.severity !== 'warning')).toEqual([]);
  });

  it('matches its golden output', async () => {
    await expect(compile(project, graphId).code + '\n').toMatchFileSnapshot(`./golden/${id}.txt`);
  });

  it('parses as a function body', () => {
    assertParses(compile(project, graphId).code);
  });
});
