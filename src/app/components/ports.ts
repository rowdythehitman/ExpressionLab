// Port type → colour + shape class (spec §12: don't rely on colour alone).
export function portClass(type: string | undefined): string {
  if (!type) return 'port';
  const prop = type.startsWith('property<');
  const inner = prop ? type.slice(9, -1) : type;
  return `port port-${inner}${prop ? ' port-property' : ''}`;
}

export const CATEGORY_ORDER = [
  'context', 'globals', 'math', 'vector', 'animation', 'logic', 'space', 'text', 'marker', 'output', 'utility',
] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  context: 'Context & constants', globals: 'Globals & refs', math: 'Math', vector: 'Vector', animation: 'Animation',
  logic: 'Logic', space: 'Space & layers', text: 'Text', marker: 'Markers', output: 'Output', utility: 'Utility',
};
