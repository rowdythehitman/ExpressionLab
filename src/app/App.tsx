import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useState } from 'react';
import { Canvas } from './components/Canvas';
import { GlobalsStrip } from './components/GlobalsStrip';
import { GraphTabs } from './components/GraphTabs';
import { ImportDialog } from './components/ImportDialog';
import { CustomNodesDialog } from './components/CustomNodesDialog';
import { Palette } from './components/Palette';
import { RightPanel } from './components/RightPanel';
import { TopBar } from './components/TopBar';
import { useStore } from './store';

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function App() {
  const [importSignal, setImportSignal] = useState(0);
  const customDialog = useStore((s) => s.customDialog);
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
        <TopBar onPasteImport={() => setImportSignal((n) => n + 1)} />
        <GlobalsStrip />
        <main className="panes">
          <Palette />
          <div className="center">
            <GraphTabs />
            <Canvas />
          </div>
          <RightPanel />
        </main>
        <ImportDialog openSignal={importSignal} />
        {customDialog && (
          <CustomNodesDialog focusId={customDialog.focusId} onClose={() => useStore.setState({ customDialog: null })} />
        )}
      </div>
    </ReactFlowProvider>
  );
}
