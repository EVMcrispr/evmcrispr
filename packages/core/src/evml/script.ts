import type { Action } from "@evmcrispr/sdk";
import type { WalletClient } from "viem";

import {
  getDiagnostics as getDiagnosticsImpl,
  type ParseDiagnostic,
} from "../diagnostics";
import { type DocumentSymbol, getDocumentSymbols } from "../documentSymbols";
import type { EvmlAST } from "../EvmlAST";
import { Interpreter } from "../interpreter/Interpreter";
import { parseScript } from "../parsers/script";
import {
  type ExecuteOptions,
  type ExecutionResult,
  executeScript,
} from "./execute";
import type { ModuleRegistry } from "./registry";
import {
  type SimulateOptions,
  type SimulationResult,
  simulateScript,
} from "./simulate";
import type { EvmlConfig } from "./types";

export interface InterpretOptions {
  /** Escape hatch: receive every resolved action as the run progresses
   *  (e.g. to send transactions with custom logic). */
  onAction?: (action: Action) => Promise<unknown>;
}

/**
 * A parsed-on-demand EVML script bound to a tag's registry and config.
 * Construction is cheap (source text only); each `interpret`/`simulate`/
 * `execute` call runs on a fresh interpreter, so re-running a script has
 * clean-state semantics.
 */
export class EvmlScript {
  readonly source: string;
  readonly #registry: ModuleRegistry;
  readonly #config: EvmlConfig;

  #ast?: EvmlAST;
  #diagnostics?: ParseDiagnostic[];

  constructor(source: string, registry: ModuleRegistry, config: EvmlConfig) {
    this.source = source;
    this.#registry = registry;
    this.#config = config;
  }

  /** The script's source — lets fragments compose inside other `evml`
   *  templates. */
  toString(): string {
    return this.source;
  }

  /** Parsed AST (lazy, cached). Throws on hard parse failure. */
  get ast(): EvmlAST {
    if (!this.#ast) {
      this.#ast = parseScript(this.source).ast;
    }
    return this.#ast;
  }

  /** Parse diagnostics (lazy, cached). Never throws. */
  get diagnostics(): ParseDiagnostic[] {
    if (!this.#diagnostics) {
      this.#diagnostics = getDiagnosticsImpl(this.source);
    }
    return this.#diagnostics;
  }

  /** Document symbols for outline views. */
  get symbols(): DocumentSymbol[] {
    return getDocumentSymbols(this.source);
  }

  /** Resolve the script into its list of actions (dry run: nothing is
   *  sent anywhere unless `onAction` does so). */
  async interpret(options: InterpretOptions = {}): Promise<Action[]> {
    const interpreter = new Interpreter(this.#registry, this.#config);
    return interpreter.interpret(this.source, options.onAction);
  }

  /** Run the script inside a `sim:fork` fork. Requires the `sim` module
   *  to be registered. */
  simulate(options: SimulateOptions = {}): Promise<SimulationResult> {
    return simulateScript(this.source, this.#registry, this.#config, options);
  }

  /** Interpret and execute every action with `walletClient` via the
   *  built-in executor. */
  execute(
    walletClient: WalletClient,
    options: ExecuteOptions = {},
  ): Promise<ExecutionResult> {
    return executeScript(
      this.source,
      this.#registry,
      this.#config,
      walletClient,
      options,
    );
  }
}
