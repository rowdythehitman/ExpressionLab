// Bundled example graphs (spec §11), shown in the Presets menu.
import type { Project } from '../types';
import posterizedWiggle from './posterized-wiggle.json';
import loopWiggle from './loop-wiggle.json';
import checkboxControl from './checkbox-control.json';
import wiggleOneDimension from './wiggle-one-dimension.json';
import markerTrigger from './marker-trigger.json';
import centerAnchorText from './center-anchor-text.json';

export interface Preset {
  id: string;
  name: string;
  /** What to expect in AE after applying it (feeds docs/ae-verification.md). */
  verify: string;
  project: Project;
}

const VERIFY: Record<string, string> = {
  'posterized-wiggle': 'Position wiggles, updating only "Stop Motion FPS" times per second.',
  'loop-wiggle': 'Position wiggles and the motion repeats seamlessly every 3 seconds (compare frames 0 and 3s).',
  'checkbox-control': 'Opacity follows its keyframes/value with "Enable" ticked and drops to 0 when unticked.',
  'wiggle-one-dimension': 'X wiggles; Y stays exactly at its keyframed/static value.',
  'marker-trigger': 'Opacity is 0 until the first layer marker, then eases to 100 over 0.5 s, restarting at each marker.',
  'center-anchor-text': 'On a text layer, the anchor point stays vertically centred on the text as lines are added; X is unchanged.',
};

const all: Record<string, unknown> = {
  'posterized-wiggle': posterizedWiggle,
  'loop-wiggle': loopWiggle,
  'checkbox-control': checkboxControl,
  'wiggle-one-dimension': wiggleOneDimension,
  'marker-trigger': markerTrigger,
  'center-anchor-text': centerAnchorText,
};

export const PRESETS: Preset[] = Object.entries(all).map(([id, p]) => {
  const project = p as Project;
  return { id, name: project.graphs[0]!.name, verify: VERIFY[id] ?? '', project };
});
