import { beforeAll } from "bun:test";
import type {
  DocumentSymbol,
  HoverInfo,
  ParseDiagnostic,
  SignatureHelp,
} from "@evmcrispr/core";
import { type EvmlWorkspace, evml, Interpreter } from "@evmcrispr/core";
import type {
  CompletionItem,
  HelperFunctionNode,
  Position,
} from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { gnosis } from "viem/chains";
import { getPublicClient, getTransports } from "../../client";
import { TEST_ACCOUNT_ADDRESS } from "../../constants";
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

  /** Create a fresh Interpreter wired to the test client on the local
   *  anvil-forked Gnosis chain. */
  createEvm(): Interpreter {
    return new Interpreter(evml.registry, {
      account: TEST_ACCOUNT_ADDRESS,
      chainId: gnosis.id,
      transports: getTransports(),
    });
  }

  /** Create a fresh editor workspace on the test Gnosis chain. */
  createWorkspace(): EvmlWorkspace {
    return evml
      .with({ chainId: gnosis.id, transports: getTransports() })
      .workspace();
  }

  async completions(
    script: string,
    position: Position,
  ): Promise<CompletionItem[]> {
    return this.createWorkspace().getCompletions(script, position);
  }

  async hover(script: string, position: Position): Promise<HoverInfo | null> {
    return this.createWorkspace().getHoverInfo(script, position);
  }

  async signatureHelp(
    script: string,
    position: Position,
  ): Promise<SignatureHelp | null> {
    return this.createWorkspace().getSignatureHelp(script, position);
  }

  documentSymbols(script: string): DocumentSymbol[] {
    return this.createWorkspace().getDocumentSymbols(script);
  }

  diagnostics(script: string): ParseDiagnostic[] {
    return this.createWorkspace().getDiagnostics(script);
  }
}
