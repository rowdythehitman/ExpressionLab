// Converter quick-fixes for rejected connections (spec §6 rule 3).
export interface ConverterFix {
  /** Node type to insert. */
  type: string;
  label: string;
  params?: Record<string, string>;
  inPort: string;
  outPort: string;
}

const VEC: ReadonlySet<string> = new Set(['vec2', 'vec3', 'color']);

export function suggestConverter(actual: string, expected: string): ConverterFix | undefined {
  if (actual === 'number' && expected === 'vec2') return { type: 'vec.broadcast2', label: 'Broadcast [n, n]', inPort: 'n', outPort: 'out' };
  if (actual === 'number' && expected === 'vec3') return { type: 'vec.broadcast3', label: 'Broadcast [n, n, n]', inPort: 'n', outPort: 'out' };
  if (VEC.has(actual) && expected === 'number') return { type: 'vec.pick', label: 'Pick component', params: { index: '0' }, inPort: 'v', outPort: 'out' };
  if (actual === 'vec3' && expected === 'vec2') return { type: 'vec.dropZ', label: 'Drop Z', inPort: 'v', outPort: 'out' };
  if (actual === 'vec2' && expected === 'vec3') return { type: 'vec.addZ', label: 'Add Z', inPort: 'v', outPort: 'out' };
  if (actual === 'color' && expected === 'vec3') return { type: 'vec.dropAlpha', label: 'Drop alpha', inPort: 'v', outPort: 'out' };
  const prop = /^property<(.+)>$/.exec(actual);
  if (prop && prop[1] === expected) return { type: 'anim.valueAtTime', label: 'Value at time', inPort: 'prop', outPort: 'out' };
  return undefined;
}
