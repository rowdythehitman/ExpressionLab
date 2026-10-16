import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { compile, decodePayload, embedGraph, hasPayload, importGraph, PAYLOAD_PREFIX, setRawDeflate } from '../../src/core';
import { PRESETS } from '../../src/core/presets';
import { assertParses, goldenProject } from '../helpers';

async function embedded(i = 0) {
  const project = structuredClone(PRESETS[i]!.project);
  const graph = project.graphs[0]!;
  const { code } = compile(project, graph.id);
  return { project, graph, ...(await embedGraph(project, graph, code)) };
}

describe('embedded graph payload (spec §8)', () => {
  it.each(PRESETS.map((p, i) => [p.id, i] as const))('%s: graph → code → graph is lossless', async (_id, i) => {
    const { graph, code, project } = await embedded(i);
    expect(code.split('\n').at(-1)!.startsWith(`${PAYLOAD_PREFIX}v1:`)).toBe(true);
    assertParses(code); // the payload is a comment, so AE ignores it
    const decoded = (await decodePayload(code))!;
    expect(decoded.graph).toEqual(graph);
    expect(decoded.bodyEdited).toBe(false);
    // The subset carries everything the graph references.
    const used = graph.nodes.map((n) => n.ref?.controlId).filter(Boolean);
    expect(decoded.globals.controls.map((c) => c.id).sort()).toEqual(
      project.globals.controls.filter((c) => used.includes(c.id)).map((c) => c.id).sort(),
    );
  });

  it('flags hand edits above the payload', async () => {
    const { code } = await embedded();
    const edited = code.replace('wiggle(wiggleFreq, wiggleAmp, 1, 0.5)', 'wiggle(wiggleFreq, wiggleAmp * 2, 1, 0.5)');
    expect((await decodePayload(edited))!.bodyEdited).toBe(true);
  });

  it('tolerates CRLF line endings and surrounding whitespace from AE', async () => {
    const { code } = await embedded();
    const pasted = `\n  ${code.replace(/\n/g, '\r\n')}   \r\n`;
    expect((await decodePayload(pasted))!.bodyEdited).toBe(false);
  });

  it('rejects damaged and future payloads', async () => {
    const { code } = await embedded();
    await expect(decodePayload(code.slice(0, -12))).rejects.toThrow(/damaged/);
    await expect(decodePayload(code.replace(':v1:', ':v9:'))).rejects.toThrow(/newer version/);
    expect(await decodePayload('wiggle(2, 50)')).toBeNull();
    expect(hasPayload(code)).toBe(true);
  });

  it('stays small for typical graphs', async () => {
    const { payloadBytes, tooLarge } = await embedded();
    expect(tooLarge).toBe(false);
    expect(payloadBytes).toBeLessThan(2000);
  });

  it('imports as a new graph and merges globals by id', async () => {
    const { code } = await embedded();
    const target = goldenProject();
    target.globals.controls[0]!.effectName = 'Renamed In Project';
    target.globals.controls.splice(2, 1); // project lacks "Wiggle Amp"
    const { project, graphId } = importGraph(target, (await decodePayload(code))!, () => 'g-new');
    expect(project.graphs).toHaveLength(2);
    expect(graphId).toBe('g-new');
    expect(project.graphs[1]!.name).toBe('Posterize Time + Wiggle (imported)');
    expect(project.globals.controls.map((c) => c.effectName)).toEqual(['Renamed In Project', 'Wiggle Freq', 'Wiggle Amp']);
    expect(compile(project, graphId).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('the AE panel\'s zlib codec reads and writes the same payloads as the browser streams', async () => {
    const browser = await embedded(2);
    setRawDeflate({ deflate: async (b) => new Uint8Array(deflateRawSync(b)), inflate: async (b) => new Uint8Array(inflateRawSync(b)) });
    try {
      expect((await decodePayload(browser.code))!.graph).toEqual(browser.graph);
      const panel = await embedded(2);
      setRawDeflate();
      expect((await decodePayload(panel.code))!.graph).toEqual(panel.graph);
    } finally {
      setRawDeflate();
    }
  });
});
