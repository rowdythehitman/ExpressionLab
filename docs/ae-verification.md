# After Effects verification checklist

<!-- Generated from node `verify` strings and presets. Do not edit by hand: run `npm run gen:verify`. -->

Claude Code cannot run After Effects, so these behaviours need a manual check before a release (spec §13.6).
Use the JavaScript expression engine. Tick each item once it behaves as described.

## Spec items

- [ ] Vector maths: `add`, `sub`, `mul(vec, n)`, `div(vec, n)` and the element-wise `.map((v, i) => ...)` forms evaluate as expected (decisions #15).
- [ ] `toComp` / `fromComp` / `toWorld` / `fromWorld` return a point with the same number of dimensions as their input (decisions #26).
- [ ] Pasting an expression that ends with `//@ae-nodes:v1:...` into AE works unchanged (the payload is just a comment).
- [ ] Match name `ADBE Slider Control-0001` reads a Slider Control (Settings → Use match names), and the display name `Slider` does too.
- [ ] Match name `ADBE Checkbox Control-0001` reads a Checkbox Control (Settings → Use match names), and the display name `Checkbox` does too.
- [ ] Match name `ADBE Dropdown Control-0001` reads a Dropdown Menu Control (Settings → Use match names), and the display name `Menu` does too.
- [ ] Match name `ADBE Color Control-0001` reads a Color Control (Settings → Use match names), and the display name `Color` does too.
- [ ] Match name `ADBE Point Control-0001` reads a Point Control (Settings → Use match names), and the display name `Point` does too.
- [ ] Match name `ADBE Point3D Control-0001` reads a 3D Point Control (Settings → Use match names), and the display name `3D Point` does too.
- [ ] Match name `ADBE Angle Control-0001` reads an Angle Control (Settings → Use match names), and the display name `Angle` does too.
- [ ] Match name `ADBE Layer Control-0001` reads a Layer Control (Settings → Use match names), and the display name `Layer` does too.

## Presets

Load the preset, copy the expression, follow the setup checklist in the app, then check:

- [ ] **Posterize Time + Wiggle** (apply to Position): Position wiggles, updating only "Stop Motion FPS" times per second.
- [ ] **Loop a Wiggle** (apply to Position): Position wiggles and the motion repeats seamlessly every 3 seconds (compare frames 0 and 3s).
- [ ] **Control Property with Checkbox** (apply to Opacity): Opacity follows its keyframes/value with "Enable" ticked and drops to 0 when unticked.
- [ ] **Wiggle on One Dimension** (apply to Position): X wiggles; Y stays exactly at its keyframed/static value.
- [ ] **Trigger Expression on Marker** (apply to Opacity): Opacity is 0 until the first layer marker, then eases to 100 over 0.5 s, restarting at each marker.
- [ ] **Center Anchor Point Vertically on Text** (apply to Anchor Point): On a text layer, the anchor point stays vertically centred on the text as lines are added; X is unchanged.

## Nodes

### Context

- [ ] **Value** (`ctx.value`): Applied alone, the property is unchanged.
- [ ] **Time** (`ctx.time`): On Rotation, the layer turns one degree per second.
- [ ] **Layer Index** (`ctx.index`): On Rotation, the value equals the layer number in the timeline.
- [ ] **In Point** (`ctx.inPoint`): On Rotation, the value equals the layer's in point in seconds.
- [ ] **Out Point** (`ctx.outPoint`): On Rotation, the value equals the layer's out point in seconds.
- [ ] **Frame Duration** (`ctx.frameDuration`): In a 25 fps comp, the value is 0.04.
- [ ] **Frame Rate** (`ctx.fps`): In a 25 fps comp, the value is 25.
- [ ] **Comp Size** (`ctx.compSize`): In a 1920x1080 comp, Position becomes [1920, 1080].
- [ ] **Comp Center** (`ctx.compCenter`): On Position, the layer sits in the middle of the comp.
- [ ] **Layer Size** (`ctx.layerSize`): On a 500x300 solid, the value is [500, 300].
- [ ] **Text Index** (`ctx.textIndex`): With Based On = Characters, the first character gets 1.
- [ ] **Text Total** (`ctx.textTotal`): For "Hello" with Based On = Characters, the value is 5.
- [ ] **Selector Value** (`ctx.selectorValue`): With no selector above, the result is 100.

### Globals

- [ ] **Control** (`ref.control`): Changing the control in AE changes the result.
- [ ] **Layer** (`ref.layer`): Renaming the layer in AE without updating Globals makes the expression error.
- [ ] **Parent Layer** (`ref.parent`): With a parent set, Layer Name Number reads the parent's name.
- [ ] **Has Parent** (`ref.hasParent`): Toggling the parent switches a Select between its two inputs.
- [ ] **Property** (`ref.property`): Value matches the referenced property in AE.

### Math

- [ ] **Math** (`math.op`): On Position with A = [100, 100], B = [10, 20], add gives [110, 120]; mul by 2 gives [200, 200].
- [ ] **Function** (`math.unary`): round(time) on Rotation steps by one degree each second.
- [ ] **Trig** (`math.trig`): sin of 90 degrees is 1.
- [ ] **Clamp** (`math.clamp`): Clamp(time * 50, 0, 100) on Opacity stops at 100.
- [ ] **Remap** (`math.remap`): Remap(time, 0, 1, 0, 100) on Opacity fades in over the first second.
- [ ] **Random** (`math.random`): Duplicated layers each get a different, constant value.
- [ ] **Noise** (`math.noise`): noise(time) * 50 on Rotation drifts smoothly.

### Vector

- [ ] **Make Vec2** (`vec.make2`): On Position with x = 100, y = 200 the layer sits at (100, 200).
- [ ] **Make Vec3** (`vec.make3`): On 3D Position the layer sits at (x, y, z).
- [ ] **Make Colour** (`vec.makeColor`): On a Fill colour, r = 1, g = 0, b = 0 gives red.
- [ ] **Split Vec2** (`vec.split2`): Split of Position then Make Vec2 leaves the layer where it was.
- [ ] **Split Vec3** (`vec.split3`): Split of 3D Position then Make Vec3 leaves the layer where it was.
- [ ] **Split Colour** (`vec.splitColor`): Split then Make Colour leaves the colour unchanged.
- [ ] **Pick Component** (`vec.pick`): Pick 1 of Position equals the Y position.
- [ ] **Broadcast to Vec2** (`vec.broadcast2`): On Scale, 50 gives [50, 50].
- [ ] **Broadcast to Vec3** (`vec.broadcast3`): On 3D Scale, 50 gives [50, 50, 50].
- [ ] **Drop Z** (`vec.dropZ`): A 3D point [1, 2, 3] becomes [1, 2].
- [ ] **Add Z** (`vec.addZ`): [1, 2] becomes [1, 2, 0].
- [ ] **Drop Alpha** (`vec.dropAlpha`): [1, 0.5, 0, 1] becomes [1, 0.5, 0].
- [ ] **Length** (`vec.length`): length([3, 4]) is 5.
- [ ] **Distance** (`vec.distance`): Distance between [0, 0] and [3, 4] is 5.

### Animation

- [ ] **Wiggle** (`anim.wiggle`): Position wiggles around its base value; changing the freq control changes speed.
- [ ] **Looping Wiggle** (`anim.loopWiggle`): Frame at t and t + loopSeconds are identical.
- [ ] **Loop Keyframes** (`anim.loop`): With 2 keyframes, the animation repeats after the last key (out) and before the first key (in / both).
- [ ] **Value at Time** (`anim.valueAtTime`): With t = time - 0.5, the layer follows the referenced property half a second late.
- [ ] **Delay by Index** (`anim.delayByIndex`): Layer 3 with frames = 2 returns 4 frames' worth of seconds.
- [ ] **Posterize Time** (`anim.posterize`): With Wiggle downstream, the wiggle updates only fps times per second.

### Logic

- [ ] **Compare** (`logic.compare`): time > 1 switches a Select after one second.
- [ ] **Select** (`logic.select`): With If = hasParent, the output switches when the parent is set.
- [ ] **Checkbox Gate** (`logic.checkboxGate`): On Opacity, unticking the checkbox hides the layer.

### Space

- [ ] **To Comp** (`space.toComp`): A child layer's anchor [0, 0] maps to its comp position.
- [ ] **From Comp** (`space.fromComp`): fromComp(toComp(p)) returns p.
- [ ] **To World** (`space.toWorld`): A 3D null's [0, 0, 0] maps to its world position.
- [ ] **From World** (`space.fromWorld`): fromWorld(toWorld(p)) returns p.
- [ ] **Source Rect** (`layer.sourceRect`): On a text layer's Anchor Point, Center keeps the anchor centred as the text changes.
- [ ] **Layer Name Number** (`layer.nameNumber`): A layer named "12 Title" gives 12.

### Text

- [ ] **Source Text** (`text.sourceText`): On another text layer's Source Text, it mirrors the referenced layer.
- [ ] **Number to Text** (`text.fromNumber`): On Source Text with n = time, decimals = 1, it counts 0.0, 0.1, ...
- [ ] **Join Text** (`string.concat`): "Score: " + Number to Text shows a label and value.
- [ ] **Stagger** (`text.stagger`): With a Position animator, characters slide in one after another, 2 frames apart.
- [ ] **Typewriter** (`text.typewriter`): With an Opacity 0% animator, the text types on at 20 characters per second from the layer's in point.
- [ ] **Index Ramp** (`text.ramp`): With a Fill Colour animator the first character is unaffected and the last fully affected.

### Marker

- [ ] **Time Since Marker** (`marker.sinceLast`): Before the first marker 'since' is 0 and 'active' is false.
