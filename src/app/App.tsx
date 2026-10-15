import { ReactFlowProvider } from '@xyflow/react';
import { useEffect } from 'react';
import { Canvas } from './components/Canvas';
import { GlobalsStrip } from './components/GlobalsStrip';
import { Palette } from './components/Palette';
import { RightPanel } from './components/RightPanel';
import { TopBar } from './components/TopBar';
import { useStore } from './store';

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function App() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || isTyping(e)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        useStore.getState().undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        useStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <ReactFlowProvider>
      <div className="app">
        <TopBar />
        <GlobalsStrip />
        <main className="panes">
          <Palette />
          <Canvas />
          <RightPanel />
        </main>
      </div>
    </ReactFlowProvider>
  );
}
