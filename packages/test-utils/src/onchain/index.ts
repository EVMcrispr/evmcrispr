// Executing compiled operands against real contract bytecode on the anvil
// fork. Kept out of `./evml` on purpose: the bytecode fixture is ~57 KB of
// hex, and importing it into every existing helper suite would be pure cost.
export {
  ASSERTIONS_RUNTIME_BYTECODE,
  ASSERTIONS_RUNTIME_HASH,
  OPERATORS_RUNTIME_BYTECODE,
  OPERATORS_RUNTIME_HASH,
} from "./assertions-bytecode";
export { type InstalledCore, installAssertionsCore } from "./install";
export { getMainnetForkTransports } from "./mainnet";
