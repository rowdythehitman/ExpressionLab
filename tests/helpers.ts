import { parse } from 'acorn';
import type { Graph, NodeInstance, Project } from '../src/core';
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

export function node(id: string, type: string, x = 0, y = 0, extra: Partial<NodeInstance> = {}): NodeInstance {
  return { id, type, position: { x, y }, inputs: {}, params: {}, ...extra };
}

/** Graph target whose value type is `t` (used to give a node's output somewhere to go). */
export const TARGET_FOR: Record<string, Graph['target']> = {
  number: { id: 'rotation' },
  vec2: { id: 'position2D' },
  vec3: { id: 'position3D' },
  color: { id: 'shapeFillColor' },
  string: { id: 'sourceText' },
  boolean: { id: 'custom', valueType: 'boolean' },
};

export function edge(from: string, fromPort: string, to: string, toPort: string) {
  return { id: `${from}.${fromPort}->${to}.${toPort}`, from: { node: from, port: fromPort }, to: { node: to, port: toPort } };
}

/** AE evaluates an expression as a function body; it must parse as one. */
export function assertParses(code: string): void {
  parse(`(function () {\n${code}\n})`, { ecmaVersion: 2022 });
}
