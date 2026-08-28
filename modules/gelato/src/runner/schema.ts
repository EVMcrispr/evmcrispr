import type { Web3FunctionSchema } from "../utils/tgz";

/**
 * The EVML runner: one generic Web3 Function, published once per release,
 * that interprets the script a `gelato:schedule` task carries in its user
 * args and returns the calls it produces. userArgs key order is the ABI
 * order the task encodes them in.
 */
export const RUNNER_SCHEMA = {
  web3FunctionVersion: "2.0.0",
  runtime: "js-1.0",
  memory: 128,
  timeout: 30,
  userArgs: {
    script: "string",
    account: "string",
    sender: "string",
    rpcUrl: "string",
  },
} as const satisfies Web3FunctionSchema;

export type RunnerUserArgs = {
  [K in keyof typeof RUNNER_SCHEMA.userArgs]: string;
};

export const RUNNER_USER_ARG_NAMES = Object.keys(
  RUNNER_SCHEMA.userArgs,
) as (keyof RunnerUserArgs)[];

/** Modules the runner does not ship: they need a fork, WASM toolchains or
 *  the terminal, none of which exist inside Gelato's sandbox. */
export const RUNNER_EXCLUDED_MODULES = [
  "sim",
  "circom",
  "noir",
  "semaphore",
  "gelato",
] as const;

export const RUNNER_TITLE = "EVMcrispr EVML runner";
