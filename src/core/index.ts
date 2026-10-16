// Public API of the pure core.
export * from './types';
export { compile, formatLiteral, APP_NAME, type CompileOptions } from './compiler/compile';
export { NODE_DEFS } from './nodes';
export { TARGETS, PROPERTIES, RESERVED } from './catalog';
export { CONTROLS } from './catalog/controls';
export { projectSchema, nodeDefSchema, DEFAULT_SETTINGS } from './schema';
export { analyzeGraph, checkConnection, targetValueType, type GraphAnalysis, type ConnectionCheck } from './typing/analyze';
export { suggestConverter, type ConverterFix } from './typing/converters';
export type { NodeTypes } from './typing/resolve';
export { isValidIdentifier, camelCase } from './compiler/naming';
export {
  embedGraph, decodePayload, setRawDeflate, hasPayload, importGraph, hashBody, globalsSubset, customNodesUsed,
  PAYLOAD_PREFIX, PAYLOAD_WARN_BYTES, type DecodedPayload, type EmbedResult, type RawDeflate,
} from './compiler/embed';
export { generateSetupScript, jsxString } from './setup/jsx';
export { nodeLibrary, validateCustomNode, CUSTOM_PREFIX } from './library';
export { expandMacros, makeMacro, type MakeMacroResult } from './macro';
