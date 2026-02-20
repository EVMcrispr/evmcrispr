import { beforeAll } from "bun:test";
import type { HelperFunctionNode } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { getPublicClient } from "../client";
import {
  createInterpreter,
  preparingExpression,
  type TestInterpreter,
} from "../evml";

/**
 * Shared test context that manages the public client and provides
 * convenience factories for creating interpreters and evaluating expressions.
 *
 * Usage inside a `describe` block:
 *
 * ```ts
 * const ctx = new TestContext();
 * // ctx.client is available after beforeAll runs
 * ```
 */
export class TestContext {
  private _client!: PublicClient;

  constructor() {
    beforeAll(() => {
      this._client = getPublicClient();
    });
  }

  get client(): PublicClient {
    return this._client;
  }

  lazyClient = (): PublicClient => this._client;

  interpreter(script: string): TestInterpreter {
    return createInterpreter(script, this._client);
  }

  async expression(
    expr: string,
    module?: string,
    preamble?: string,
  ): Promise<[() => Promise<any>, HelperFunctionNode]> {
    return preparingExpression(expr, this._client, module, preamble);
  }
}
