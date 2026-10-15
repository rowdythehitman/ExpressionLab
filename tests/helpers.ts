import { parse } from 'acorn';
import type { Graph, Project } from '../src/core';
import golden from '../src/core/presets/posterized-wiggle.json';

export const goldenProject = (): Project => structuredClone(golden) as Project;

/** A one-graph project with the given nodes/edges and empty globals. */
export function project(graph: Partial<Graph> & Pick<Graph, 'nodes' | 'edges'>, patch: Partial<Project> = {}): Project {
  return {
    version: 1,
    globals: { ctrls: { layerName: 'CTRLS' }, layers: [], controls: [], comps: [] },
    graphs: [{ id: 'g', name: 'Test', target: { id: 'position2D' }, ...graph }],
    settings: { aeTarget: 26, useMatchNames: false, comments: 'minimal', embedGraph: false },
    ...patch,
  };
}

export function node(id: string, type: string, x = 0, y = 0, extra: Record<string, unknown> = {}) {
  return { id, type, position: { x, y }, inputs: {}, params: {}, ...extra };
}

export function edge(from: string, fromPort: string, to: string, toPort: string) {
  return { id: `${from}.${fromPort}->${to}.${toPort}`, from: { node: from, port: fromPort }, to: { node: to, port: toPort } };
}

/** AE evaluates an expression as a function body; it must parse as one. */
export function assertParses(code: string): void {
  parse(`(function () {\n${code}\n})`, { ecmaVersion: 2022 });
}
