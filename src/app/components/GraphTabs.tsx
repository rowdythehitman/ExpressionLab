// One tab per expression (graph) in the project (Phase 2 multi-graph tabs).
import { TARGETS } from '../../core';
import { actions, useStore } from '../store';

export function GraphTabs() {
  const graphs = useStore((s) => s.project.graphs);
  const graphId = useStore((s) => s.graphId);
  const active = graphs.some((g) => g.id === graphId) ? graphId : graphs[0]!.id;

  return (
    <div className="tabs" role="tablist" aria-label="Expressions">
      {graphs.map((g) => (
        <div key={g.id} className={`tab ${g.id === active ? 'active' : ''}`}>
          <button
            role="tab"
            aria-selected={g.id === active}
            className="tab-btn"
            title={`Apply to ${TARGETS.get(g.target.id)?.label ?? g.target.id}`}
            onClick={() => useStore.getState().setGraph(g.id)}
          >
            {g.name || 'Untitled'}
          </button>
          {g.id === active && (
            <>
              <button className="tab-act" title="Duplicate" aria-label="Duplicate expression" onClick={() => actions.duplicateGraph(g.id)}>⧉</button>
              {graphs.length > 1 && (
                <button className="tab-act" title="Delete" aria-label="Delete expression" onClick={() => actions.deleteGraph(g.id)}>×</button>
              )}
            </>
          )}
        </div>
      ))}
      <button className="tab-add" aria-label="New expression" title="New expression" onClick={() => actions.addGraph()}>+</button>
    </div>
  );
}
