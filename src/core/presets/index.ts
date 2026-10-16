// Bundled example graphs (spec §11), shown in the Presets menu.
import type { Project } from '../types';

export interface Preset {
  id: string;
  name: string;
  /** Menu group. */
  group: string;
  /** What to expect in AE after applying it (feeds docs/ae-verification.md). */
  verify: string;
  project: Project;
}

/** id → [group, verify]. Order here is the menu order. */
const META: Record<string, [string, string]> = {
  'posterized-wiggle': ['Wiggle & random', 'Position wiggles, updating only "Stop Motion FPS" times per second.'],
  'loop-wiggle': ['Wiggle & random', 'Position wiggles and the motion repeats seamlessly every 3 seconds (compare frames 0 and 3s).'],
  'wiggle-one-dimension': ['Wiggle & random', 'X wiggles; Y stays exactly at its keyframed/static value.'],
  'wiggle-between': ['Wiggle & random', 'Opacity wanders between about 20 and 80, whatever its own value.'],
  'frozen-random': ['Wiggle & random', 'Each duplicated layer gets a different rotation that never changes over time.'],
  'loop-in-out': ['Loops & time', 'With 2+ position keyframes, the animation cycles both before the first and after the last key.'],
  'loop-path': ['Loops & time', 'On a shape Path with 3 keyframes, the shape animation repeats after the last keyframe.'],
  'delay-slider': ['Loops & time', 'The layer copies "Leader"\'s position, "Delay (s)" seconds late; changing the slider changes the lag.'],
  'marker-trigger': ['Markers', 'Opacity is 0 until the first layer marker, then eases to 100 over 0.5 s, restarting at each marker.'],
  'marker-fade': ['Markers', 'With markers that have a duration, the layer fades in at each marker start and out at its end (0.5 s each), and is hidden outside markers.'],
  'checkbox-control': ['Controls', 'Opacity follows its keyframes/value with "Enable" ticked and drops to 0 when unticked.'],
  'dropdown-show': ['Controls', 'Layers named "1 …", "2 …", "3 …" show only when the "Show Layer" dropdown matches their number.'],
  'null-2d-to-3d': ['Layers & parenting', 'A 2D layer sits on screen exactly where the 3D null appears, also when the camera moves.'],
  'follow-null': ['Layers & parenting', 'The layer follows "Controller"\'s position in comp space, even when the null is parented.'],
  'ignore-parent-rotation': ['Layers & parenting', 'Rotating the parent (or grandparent) leaves this layer\'s on-screen angle unchanged.'],
  'ignore-parent-scale': ['Layers & parenting', 'Scaling the parent chain leaves this layer\'s on-screen size unchanged; a 0% parent axis doesn\'t error.'],
  'inherit-parent-opacity': ['Layers & parenting', 'Fading the parent fades this layer too, multiplied with its own opacity.'],
  'invert-opacity': ['Layers & parenting', 'When "Source" is at 100% this layer is at 0%, and vice versa.'],
  'center-anchor-text': ['Text & layout', 'On a text layer, the anchor point stays vertically centred on the text as lines are added; X is unchanged.'],
  'max-width-text': ['Text & layout', 'Short text stays at 100%; text wider than 800 px shrinks to fit.'],
  'scale-to-width': ['Text & layout', 'The layer\'s content is always exactly 500 px wide.'],
  'comp-center': ['Text & layout', 'The layer sits in the middle of the comp, whatever the comp size.'],
  'stroke-width': ['Text & layout', 'Scaling the shape layer (or its parent) keeps the stroke visually the same thickness.'],
  'current-date': ['Text & layout', 'Source Text shows today\'s date and updates on the next day\'s render.'],
};

const files = import.meta.glob<{ default: unknown }>('./*.json', { eager: true });

export const PRESETS: Preset[] = Object.entries(META).map(([id, [group, verify]]) => {
  const mod = files[`./${id}.json`];
  if (!mod) throw new Error(`Missing preset file ${id}.json`);
  const project = mod.default as Project;
  return { id, name: project.graphs[0]!.name, group, verify, project };
});
