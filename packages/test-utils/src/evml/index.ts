// EVML test helpers (pre-bound to @evmcrispr/core)
export {
  createEvml,
  createParserState,
  EvmlWorkspace,
  evml,
  Interpreter,
  parseScript,
} from "@evmcrispr/core";
export * from "./evml";
export * from "./expects";
export { registerAllModules } from "./modules";
export * from "./std";
export * from "./testing";
