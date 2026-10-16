// Embedded graph payload and paste-back (spec §8).
// Last line of the output: //@ae-nodes:v1:<base64url(deflate-raw(JSON{ graph, globals, bodyHash }))>
import { globalsSchema, graphSchema } from '../schema';
import { nodeDefSchema } from '../schema';
import type { Globals, Graph, NodeDef, NodeInstance, Project } from '../types';

/** The project's custom nodes used by `nodes`, including those used inside macros (transitively). */
export function customNodesUsed(project: Pick<Project, 'customNodes'>, nodes: NodeInstance[]): NodeDef[] {
  const byId = new Map((project.customNodes ?? []).map((d) => [d.id, d]));
  const out = new Map<string, NodeDef>();
  const visit = (list: NodeInstance[]) => {
    for (const n of list) {
      const d = byId.get(n.type);
      if (!d || out.has(d.id)) continue;
      out.set(d.id, d);
      if (d.macro) visit(d.macro.nodes);
    }
  };
  visit(nodes);
  return [...out.values()];
}

export const PAYLOAD_PREFIX = '//@ae-nodes:';
export const PAYLOAD_VERSION = 1;
/** Warn above this size (spec §8 budget). */
export const PAYLOAD_WARN_BYTES = 8 * 1024;

export interface PayloadV1 {
  graph: Graph;
  globals: Globals;
  bodyHash: string;
  /** User-defined nodes/macros the graph uses (optional: older payloads don't have it). */
  customNodes?: NodeDef[];
}

export interface DecodedPayload {
  graph: Graph;
  globals: Globals;
  customNodes?: NodeDef[];
  /** True when the code above the payload no longer matches what the tool generated. */
  bodyEdited: boolean;
}

/**
 * One migration per payload version: MIGRATIONS[n] upgrades a decoded vN object to v(n+1).
 * Never break old payloads; add a migration instead.
 */
const MIGRATIONS: Record<number, (old: unknown) => unknown> = {};

/** Line endings and trailing whitespace vary between AE and browsers; hash what's left. */
function normalise(body: string): string {
  return body.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trim();
}

/** FNV-1a (32-bit) of the normalised body. Enough to detect hand edits; not a security measure. */
export function hashBody(body: string): string {
  let h = 0x811c9dc5;
  for (const ch of new TextEncoder().encode(normalise(body))) {
    h ^= ch;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The globals a graph references: CTRLS plus the layers and controls its nodes use. */
export function globalsSubset(globals: Globals, graph: Graph, customNodes: NodeDef[] = []): Globals {
  const macroNodes = customNodes.flatMap((d) => d.macro?.nodes ?? []);
  graph = { ...graph, nodes: [...graph.nodes, ...macroNodes] };
  const controlIds = new Set(graph.nodes.map((n) => n.ref?.controlId).filter(Boolean));
  const controls = globals.controls.filter((c) => controlIds.has(c.id));
  const layerIds = new Set<string>(graph.nodes.map((n) => n.ref?.layerId).filter((x): x is string => !!x));
  for (const c of controls) if (typeof c.host === 'object') layerIds.add(c.host.layerId);
  return {
    ctrls: globals.ctrls,
    layers: globals.layers.filter((l) => layerIds.has(l.id)),
    controls,
    comps: [],
  };
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Builds the payload line for `code` (the compiled expression without a payload). */
export async function encodePayload(project: Project, graph: Graph, code: string): Promise<string> {
  const custom = customNodesUsed(project, graph.nodes);
  const payload: PayloadV1 = {
    graph,
    globals: globalsSubset(project.globals, graph, custom),
    bodyHash: hashBody(code),
    ...(custom.length ? { customNodes: custom } : {}),
  };
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream('deflate-raw'));
  return `${PAYLOAD_PREFIX}v${PAYLOAD_VERSION}:${toBase64Url(packed)}`;
}

export interface EmbedResult {
  code: string;
  payloadBytes: number;
  tooLarge: boolean;
}

/** Appends the payload line to compiled code (when there is code to append to). */
export async function embedGraph(project: Project, graph: Graph, code: string): Promise<EmbedResult> {
  if (!code) return { code, payloadBytes: 0, tooLarge: false };
  const line = await encodePayload(project, graph, code);
  return { code: `${code}\n${line}`, payloadBytes: line.length, tooLarge: line.length > PAYLOAD_WARN_BYTES };
}

const PAYLOAD_RE = /\/\/@ae-nodes:v(\d+):([A-Za-z0-9_-]+)/;

export function hasPayload(text: string): boolean {
  return PAYLOAD_RE.test(text);
}

/** Finds and decodes a payload anywhere in `text`. Returns null if there's none; throws if it's corrupt. */
export async function decodePayload(text: string): Promise<DecodedPayload | null> {
  const m = PAYLOAD_RE.exec(text);
  if (!m) return null;
  const version = Number(m[1]);
  if (version > PAYLOAD_VERSION) throw new Error(`This expression was made by a newer version (payload v${version})`);
  let data: unknown;
  try {
    const json = new TextDecoder().decode(await pipe(fromBase64Url(m[2]!), new DecompressionStream('deflate-raw')));
    data = JSON.parse(json);
  } catch {
    throw new Error('The embedded graph is damaged (was the last line edited or cut short?)');
  }
  for (let v = version; v < PAYLOAD_VERSION; v++) data = MIGRATIONS[v]!(data);

  const obj = data as Partial<PayloadV1>;
  const graph = graphSchema.safeParse(obj.graph);
  const globals = globalsSchema.safeParse(obj.globals);
  if (!graph.success || !globals.success || typeof obj.bodyHash !== 'string') {
    throw new Error('The embedded graph is not valid');
  }
  const custom = obj.customNodes === undefined ? undefined : nodeDefSchema.array().safeParse(obj.customNodes);
  if (custom && !custom.success) throw new Error('The embedded graph is not valid');
  const body = text.slice(0, m.index);
  return {
    graph: graph.data as Graph,
    globals: globals.data as Globals,
    customNodes: custom?.data as NodeDef[] | undefined,
    bodyEdited: hashBody(body) !== obj.bodyHash,
  };
}

/**
 * Adds a decoded graph to a project as a new graph. Globals are merged by id: ones the project
 * already has are kept as they are (the project's names win), and missing ones are added.
 */
export function importGraph(project: Project, decoded: DecodedPayload, newId: () => string): { project: Project; graphId: string } {
  const p = structuredClone(project);
  const has = <T extends { id: string }>(xs: T[], id: string) => xs.some((x) => x.id === id);
  for (const l of decoded.globals.layers) if (!has(p.globals.layers, l.id)) p.globals.layers.push(l);
  for (const c of decoded.globals.controls) if (!has(p.globals.controls, c.id)) p.globals.controls.push(c);
  for (const d of decoded.customNodes ?? []) {
    p.customNodes ??= [];
    if (!has(p.customNodes, d.id)) p.customNodes.push(d);
  }
  const graph = structuredClone(decoded.graph);
  if (p.graphs.some((g) => g.id === graph.id)) graph.id = newId();
  if (p.graphs.some((g) => g.name === graph.name)) graph.name = `${graph.name} (imported)`;
  p.graphs.push(graph);
  return { project: p, graphId: graph.id };
}
