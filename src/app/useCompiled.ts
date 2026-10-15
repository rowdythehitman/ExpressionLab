import { useMemo } from 'react';
import { analyzeGraph, compile } from '../core';
import { activeGraph, useStore } from './store';

/** Live compile + type analysis of the active graph, memoised on the project. */
export function useCompiled() {
  const project = useStore((s) => s.project);
  const graphId = useStore((s) => s.graphId);
  return useMemo(() => {
    const graph = activeGraph(project, graphId);
    return { graph, result: compile(project, graph.id), analysis: analyzeGraph(project, graph) };
  }, [project, graphId]);
}
