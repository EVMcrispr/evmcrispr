/**
 * Local test helpers that wrap @evmcrispr/test-utils with core dependencies
 * This allows test files to use the same interface as before without modification
 */

import { EVMcrispr, parseScript } from "@evmcrispr/core";
import type { Comparison, HelperFunctionNode, NodeType } from "@evmcrispr/sdk";
import {
  createInterpreter as _createInterpreter,
  itChecksInvalidArgsLength as _itChecksInvalidArgsLength,
  itChecksNonDefinedIdentifier as _itChecksNonDefinedIdentifier,
  preparingExpression as _preparingExpression,
  type TestInterpreter,
} from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";

// Re-export types
export type {
  Case,
  InterpreterCase,
  TestInterpreter,
} from "@evmcrispr/test-utils";

export const createInterpreter = (
  script: string,
  client: PublicClient,
): TestInterpreter => {
  return _createInterpreter(script, client, EVMcrispr, parseScript);
};

export const preparingExpression = async (
  expression: string,
  client: PublicClient,
  module?: string,
  configSetters: string[] = [],
): Promise<[Awaited<any>, HelperFunctionNode]> => {
  return _preparingExpression(
    expression,
    client,
    EVMcrispr,
    parseScript,
    module,
    configSetters,
  );
};

export const itChecksInvalidArgsLength = (
  expressionType: NodeType,
  argumentlessExpression: string,
  args: string[],
  c: Comparison,
  lazyClient: () => PublicClient,
  module?: string,
): void => {
  _itChecksInvalidArgsLength(
    expressionType,
    argumentlessExpression,
    args,
    c,
    lazyClient,
    EVMcrispr,
    parseScript,
    module,
  );
};

export const itChecksNonDefinedIdentifier = (
  itName: string,
  createTestInterpreter: (nonDefinedIdentifier: string) => TestInterpreter,
  commandName: string,
  argIndex: number,
  isAragonOS = false,
): void => {
  _itChecksNonDefinedIdentifier(
    itName,
    createTestInterpreter,
    commandName,
    argIndex,
    isAragonOS,
  );
};
