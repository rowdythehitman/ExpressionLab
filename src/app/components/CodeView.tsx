// Read-only, syntax-highlighted code view (CodeMirror 6) with line highlighting for the source map.
import { javascript } from '@codemirror/lang-javascript';
import { EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { Decoration, EditorView, lineNumbers, type DecorationSet } from '@codemirror/view';
import { useEffect, useRef } from 'react';

const setHighlight = StateEffect.define<[number, number] | null>();
const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setHighlight)) continue;
      const b = new RangeSetBuilder<Decoration>();
      if (e.value) {
        const [from, to] = e.value;
        for (let n = from; n <= Math.min(to, tr.state.doc.lines); n++) {
          b.add(tr.state.doc.line(n).from, tr.state.doc.line(n).from, Decoration.line({ class: 'cm-node-hl' }));
        }
      }
      deco = b.finish();
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

interface Props {
  code: string;
  /** 1-based inclusive line range to highlight. */
  highlight?: [number, number] | null;
  onLineClick?: (line: number) => void;
}

export function CodeView({ code, highlight, onLineClick }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const clickRef = useRef(onLineClick);
  useEffect(() => {
    clickRef.current = onLineClick;
  }, [onLineClick]);

  useEffect(() => {
    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: '',
        extensions: [
          lineNumbers(),
          javascript(),
          oneDark,
          highlightField,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Compiled expression' }),
          EditorView.domEventHandlers({
            mousedown(e, v) {
              const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
              if (pos != null) clickRef.current?.(v.state.doc.lineAt(pos).number);
            },
          }),
        ],
      }),
    });
    return () => view.current?.destroy();
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (v.state.doc.toString() !== code) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: code } });
    v.dispatch({ effects: setHighlight.of(highlight ?? null) });
    if (highlight) {
      const line = v.state.doc.line(Math.min(highlight[0], v.state.doc.lines));
      v.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'nearest' }) });
    }
  }, [code, highlight]);

  return <div className="code-view" ref={host} />;
}
