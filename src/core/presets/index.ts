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
  project: Project;
}

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
  return { id, name: project.graphs[0]!.name, project };
});
