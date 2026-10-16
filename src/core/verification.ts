// Builds docs/ae-verification.md: the manual After Effects checklist (spec §13.6).
import { TARGETS } from './catalog';
import { CONTROLS } from './catalog/controls';
import { NODE_DEFS } from './nodes';
import { PRESETS } from './presets';

const CATEGORY_ORDER = ['context', 'globals', 'math', 'vector', 'animation', 'logic', 'space', 'text', 'marker', 'output', 'utility'];

/** Behaviours the spec or decisions log flag as "verify in AE" that aren't tied to one node. */
const SPEC_ITEMS = [
  'Vector maths: `add`, `sub`, `mul(vec, n)`, `div(vec, n)` and the element-wise `.map((v, i) => ...)` forms evaluate as expected (decisions #15).',
  '`toComp` / `fromComp` / `toWorld` / `fromWorld` return a point with the same number of dimensions as their input (decisions #26).',
  'Pasting an expression that ends with `//@ae-nodes:v1:...` into AE works unchanged (the payload is just a comment).',
  'The setup script (Globals › AE setup script) run on a comp creates the GLOBALS null, missing null layers and every control (with dropdown items and preview values), skips ones that already exist, and undoes in one step.',
  'AE panel: Window › Extensions › ExpressionLab opens the panel (AE 2022+); the canvas, code view and Output Preview work, and "Copy" puts the expression on the clipboard.',
  'AE panel: "Apply to selected" sets the expression on every selected property (Position, an effect slider, Source Text, a shape path) in one undo step, and AE\'s expression errors are shown in the panel.',
  'AE panel: "Use selected property" picks Position (2D) on a 2D layer, Position (3D) on a 3D layer, Source Text, an Expression Selector Amount (`ADBE Text Expressible Amount`), and Effect (number) for a slider.',
  'AE panel: "Load from selected" opens the graph embedded in the selected property\'s expression; "File › Create globals in comp" runs the setup script; "Save project" shows a save dialog and writes the file.',
  'AE panel: the embedded graph round-trips on CEP 11/12 (older Chromium: the panel falls back to Node\'s zlib) — copy from the panel, paste into the web app, and back.',
  'Dropdown controls compare with numbers as expected (`menu == 2`) and `.text` (Dropdown Text node) reads the item label in AE 26.',
  ...Object.values(CONTROLS).map(
    (c) => `Match name \`${c.matchName}\` reads ${/^[AEIOU]/.test(c.label) ? 'an' : 'a'} ${c.label} (Settings → Use match names), and the display name \`${c.paramName}\` does too.`,
  ),
];

export function verificationMarkdown(): string {
  const out: string[] = [
    '# After Effects verification checklist',
    '',
    '<!-- Generated from node `verify` strings and presets. Do not edit by hand: run `npm run gen:verify`. -->',
    '',
    'Claude Code cannot run After Effects, so these behaviours need a manual check before a release (spec §13.6).',
    'Use the JavaScript expression engine. Tick each item once it behaves as described.',
    '',
    '## Spec items',
    '',
    ...SPEC_ITEMS.map((s) => `- [ ] ${s}`),
    '',
    '## Presets',
    '',
    'Load the preset, copy the expression, follow the setup checklist in the app, then check:',
    '',
    ...PRESETS.map((p) => {
      const target = TARGETS.get(p.project.graphs[0]!.target.id)!;
      return `- [ ] **${p.name}** (apply to ${target.applyTo}): ${p.verify}`;
    }),
    '',
    '## Nodes',
    '',
  ];
  for (const cat of CATEGORY_ORDER) {
    const defs = [...NODE_DEFS.values()].filter((d) => d.category === cat && d.verify);
    if (!defs.length) continue;
    out.push(`### ${cat[0]!.toUpperCase()}${cat.slice(1)}`, '');
    for (const d of defs) out.push(`- [ ] **${d.label}** (\`${d.id}\`): ${d.verify}`);
    out.push('');
  }
  return out.join('\n');
}
