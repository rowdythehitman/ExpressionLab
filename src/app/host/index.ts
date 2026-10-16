// Host adapter: in the After Effects panel (CEP) the app can talk to AE through cep/host/host.jsx;
// on the web there is no host and the AE buttons are hidden. Everything AE-specific goes through here.
import { generateSetupScript, jsxString, type Project } from '../../core';

/** A selected AE property, as cep/host/host.jsx describes it. */
export interface PropertyInfo {
  name: string;
  matchName: string;
  /** PropertyValueType name, e.g. 'TwoD_SPATIAL', 'OneD', 'COLOR', 'TEXT_DOCUMENT'. */
  valueType: string;
  /** Match names of the groups above the property, outermost first. */
  parents: string[];
  expression: string;
  layer: { name: string; index: number; threeD: boolean; text: boolean };
}

export interface AeSelection {
  /** Active comp's name, or null when no comp is open. */
  comp: string | null;
  /** First selected property that can take an expression. */
  property: PropertyInfo | null;
  /** How many selected properties can take an expression. */
  count: number;
}

export interface ApplyResult {
  applied: Array<{ property: string; error?: string }>;
}

export interface AeHost {
  getSelection(): Promise<AeSelection>;
  /** Sets `code` as the expression of every selected property (one undo step). */
  applyExpression(code: string): Promise<ApplyResult>;
  /** The expression on the first selected property. */
  readExpression(): Promise<{ property: string; expression: string }>;
  /** Creates the project's GLOBALS null, layers and controls in the active comp (the setup script). */
  buildGlobals(project: Project): Promise<BuildResult>;
  /** Runs an ExtendScript in AE. */
  runScript(source: string): Promise<string>;
  /** Asks where to save, then writes the file. Resolves false if cancelled. */
  saveTextFile(filename: string, text: string): Promise<boolean>;
}

export interface BuildResult {
  made: string[];
  skipped: string[];
}

export class HostError extends Error {}

/** The parts of CEP's window.cep.fs the adapter uses. */
export interface CepFs {
  showSaveDialogEx(title: string, initialPath: string, fileTypes: string[], defaultName: string): { err: number; data: string };
  writeFile(path: string, data: string, encoding?: string): { err: number };
}

const NOT_LOADED = "The panel couldn't reach its After Effects script. Close and reopen the panel; if it keeps happening, reinstall ExpressionLab.";

/** Builds the adapter around CEP's evalScript (separate so tests can run host.jsx in a fake AE). */
export function createCepHost(evalScript: (source: string) => Promise<string>, fs?: CepFs): AeHost {
  const call = <T>(fn: string, arg?: string): Promise<T> =>
    run<T>(`ExpressionLab.${fn}(${arg === undefined ? '' : jsxString(arg)})`);

  /** Runs a script that returns host.jsx-style JSON ({ ok, ... } / { ok: false, error }). */
  const run = async <T>(source: string): Promise<T> => {
    const raw = await evalScript(source);
    let res: { ok?: boolean; error?: string } & T;
    try {
      res = JSON.parse(raw);
    } catch {
      throw new HostError(NOT_LOADED);
    }
    if (!res || res.ok !== true) throw new HostError(res?.error ?? NOT_LOADED);
    return res;
  };

  return {
    getSelection: () => call<AeSelection>('getSelection'),
    applyExpression: (code) => call<ApplyResult>('applyExpression', code),
    readExpression: () => call<{ property: string; expression: string }>('readExpression'),
    buildGlobals: (project) => run<BuildResult>(generateSetupScript(project, { report: 'panel' })),
    async runScript(source) {
      const out = await evalScript(source);
      if (out === 'EvalScript error.') throw new HostError('The script failed in After Effects.');
      return out;
    },
    async saveTextFile(filename, text) {
      if (!fs) throw new HostError('Saving files is not available in this panel.');
      const ext = /\.([^.]+)$/.exec(filename)?.[1] ?? 'txt';
      const picked = fs.showSaveDialogEx(`Save ${filename}`, '', [ext], filename);
      if (picked.err || !picked.data) return false;
      if (fs.writeFile(picked.data, text, 'UTF-8').err) throw new HostError(`Couldn't write ${picked.data}`);
      return true;
    },
  };
}

interface CepWindow {
  __adobe_cep__?: { evalScript(source: string, callback: (result: string) => void): void };
  cep?: { fs?: CepFs };
}

/** The AE host when running inside the CEP panel, otherwise null. */
export function detectHost(win: unknown = globalThis): AeHost | null {
  const w = win as CepWindow;
  const cep = w.__adobe_cep__;
  if (!cep) return null;
  return createCepHost((source) => new Promise((resolve) => cep.evalScript(source, resolve)), w.cep?.fs);
}

let cached: AeHost | null | undefined;
/** The current host (detected once). */
export function getHost(): AeHost | null {
  if (cached === undefined) cached = detectHost();
  return cached;
}

/** Copies text, falling back to execCommand where the async clipboard isn't allowed (CEP). */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw e;
  }
}

/** Runs Build Globals and describes the result in a sentence or two (shown in the panel). */
export async function buildGlobalsReport(host: AeHost, project: Project): Promise<{ ok: boolean; text: string }> {
  try {
    const { made, skipped } = await host.buildGlobals(project);
    const lines = [made.length ? `Built ${made.length}: ${made.join(', ')}` : 'Everything was already there; nothing new to build.'];
    if (skipped.length) lines.push(`Skipped: ${skipped.join('; ')}`);
    return { ok: true, text: lines.join('\n') };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : String(e) };
  }
}
