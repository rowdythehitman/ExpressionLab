// Read-only, syntax-highlighted code view (CodeMirror 6).
import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'react';

export function CodeView({ code }: { code: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  useEffect(() => {
    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: '',
        extensions: [
          lineNumbers(),
          javascript(),
          oneDark,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Compiled expression' }),
        ],
      }),
    });
    return () => view.current?.destroy();
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== code) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: code } });
    }
  }, [code]);

  return <div className="code-view" ref={host} />;
}
