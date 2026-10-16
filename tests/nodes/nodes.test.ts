// Golden output for every NodeDef with default inputs (spec §13.1).
import { describe, expect, it } from 'vitest';
import { analyzeGraph, compile, NODE_DEFS, TARGETS, type Graph, type NodeDef, type NodeInstance, type Project } from '../../src/core';
import { isValidWhen } from '../../src/core/compiler/template';
import { assertParses, edge, node, TARGET_FOR } from '../helpers';

/** Builds the smallest graph that exercises `def` with default inputs. */
function harness(def: NodeDef): Project {
  const nodes: NodeInstance[] = [node('n', def.id, 100, 0)];
  const edges: ReturnType<typeof edge>[] = [];
  const special: Record<string, unknown> = {};
  if (def.special === 'ref.control') special.ref = { controlId: def.controlTypes?.includes('dropdown') ? 'c2' : 'c1' };
  if (def.special === 'ref.layer') special.ref = { layerId: 'l1' };
  if (def.special === 'ref.property') special.ref = { propertyPath: 'transform.opacity' };
  Object.assign(nodes[0]!, special);

  // Required inputs without defaults get a fixture source.
  for (const p of def.inputs) {
    if (p.default !== undefined || p.optional || def.special === 'output') continue;
    const src = `src_${p.id}`;
    if (p.type.startsWith('property<')) {
      nodes.push(node(src, 'ref.property', 0, 0, { ref: { propertyPath: 'transform.opacity' } }));
      edges.push(edge(src, 'prop', 'n', p.id));
    } else {
      nodes.push(node(src, p.type === 'color' ? 'lit.color' : p.type === 'vec3' ? 'lit.vec3' : 'lit.vec2', 0, 0));
      edges.push(edge(src, 'out', 'n', p.id));
    }
  }

  let target: Graph['target'] = TARGET_FOR.number!;
  const out = def.outputs[0];
  if (def.special === 'output') {
    nodes.push(node('v', 'ctx.value', 0, 0));
    edges.push(edge('v', 'out', 'n', 'in'));
  } else {
    nodes.push(node('o', 'output', 400, 0));
    if (!out) {
      // Statement-only (hoisted) nodes: feed the output from Value.
      nodes.push(node('v', 'ctx.value', 0, 100));
      edges.push(edge('v', 'out', 'o', 'in'));
    } else if (out.type === 'layer') {
      nodes.push(node('use', 'layer.nameNumber', 250, 0));
      edges.push(edge('n', out.id, 'use', 'layer'), edge('use', 'out', 'o', 'in'));
    } else if (out.type.startsWith('property<')) {
      nodes.push(node('use', 'anim.valueAtTime', 250, 0));
      edges.push(edge('n', out.id, 'use', 'prop'), edge('use', 'out', 'o', 'in'));
    } else {
      edges.push(edge('n', out.id, 'o', 'in'));
    }
  }
  // Context-limited nodes get a target that provides their context; prefer one the node is named after
  // (rotation, scale...) and whose type matches a fixed output type.
  if (def.contexts) {
    const id = def.id.toLowerCase();
    const fits = [...TARGETS.values()].filter((t) => def.contexts!.some((c) => t.contexts.includes(c)))
      .filter((t) => !out || out.type === 'V' || !t.valueType || t.valueType === out.type);
    const named = fits.find((t) => id.includes(t.id.replace(/(2D|3D)$/, '').toLowerCase()));
    target = { id: (named ?? fits[0]!).id };
  }

  const project: Project = {
    version: 1,
    globals: {
      ctrls: { layerName: 'CTRLS' },
      layers: [{ id: 'l1', key: 'titleLayer', layerName: 'Title', is3D: false, kind: 'text' }],
      controls: [
        { id: 'c1', effectName: 'Amount', type: 'slider', host: 'ctrls' },
        { id: 'c2', effectName: 'Style', type: 'dropdown', host: 'ctrls', dropdownItems: ['Bold', 'Thin'] },
      ],
      comps: [],
    },
    graphs: [{ id: 'g', name: def.label, target, nodes, edges }],
    settings: { aeTarget: 26, useMatchNames: false, comments: 'minimal', embedGraph: false },
  };
  // Point the graph at a target matching the node's resolved output type (generics resolve to their default).
  if (out && !out.type.startsWith('property<') && out.type !== 'layer' && out.type !== 'V' && !def.contexts) {
    const resolved = analyzeGraph(project, project.graphs[0]!).types.get('n')!.outputs.get(out.id)!;
    project.graphs[0]!.target = TARGET_FOR[resolved]!;
  }
  return project;
}

describe.each([...NODE_DEFS.values()])('node $id', (def) => {
  it('has well-formed templates', () => {
    const tpls = [...def.outputs.map((o) => o.expr), ...(def.statements ?? [])];
    for (const t of tpls) {
      if (typeof t === 'string') continue;
      expect(t.at(-1)!.when, 'last branch must be unconditional').toBeUndefined();
      for (const b of t) if (b.when) expect(isValidWhen(b.when), b.when).toBe(true);
    }
    for (const p of def.inputs) if (p.acceptsScalar) expect(isValidWhen(p.acceptsScalar)).toBe(true);
    for (const p of def.params ?? []) if (p.kind === 'select') expect(p.options).toContain(String(p.default));
  });

  it('compiles with default inputs to its golden output', async () => {
    const r = compile(harness(def), 'g');
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    assertParses(r.code);
    await expect(r.code + '\n').toMatchFileSnapshot(`./golden/${def.id}.txt`);
  });
});
