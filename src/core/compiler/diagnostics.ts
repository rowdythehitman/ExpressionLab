import type { ChecklistItem, Diagnostic, DiagnosticCode, Severity } from '../types';

const SEVERITY: Record<DiagnosticCode, Severity> = {
  CYCLE: 'error', TYPE_MISMATCH: 'error', DIM_MISMATCH: 'error', MISSING_INPUT: 'error',
  NO_OUTPUT: 'error', MULTIPLE_OUTPUTS: 'error', CONTEXT_UNAVAILABLE: 'error',
  UNRESOLVED_PLACEHOLDER: 'error', HOIST_IMPURE_UPSTREAM: 'error', HOIST_DUPLICATE: 'error',
  RESERVED_NAME: 'error', GLOBAL_NOT_FOUND: 'error', INVALID_PROJECT: 'error',
  UNKNOWN_NODE_TYPE: 'error', DANGLING_EDGE: 'error', DUPLICATE_ID: 'error',
  NEEDS_KEYFRAMES: 'warning', NEEDS_PARENT: 'warning', MIN_AE_VERSION: 'warning',
  PAYLOAD_TOO_LARGE: 'warning', UNUSED_NODE: 'info',
};

export class DiagnosticBag {
  readonly items: Diagnostic[] = [];
  readonly checklist: ChecklistItem[] = [];

  add(code: DiagnosticCode, message: string, at: { nodeId?: string; edgeId?: string } = {}): void {
    this.items.push({ code, severity: SEVERITY[code], message, ...at });
  }

  check(id: string, text: string): void {
    if (!this.checklist.some((c) => c.id === id)) this.checklist.push({ id, text });
  }

  get hasErrors(): boolean {
    return this.items.some((d) => d.severity === 'error');
  }
}
