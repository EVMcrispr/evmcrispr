import Std from "@evmcrispr/module-std";
import type {
  Binding,
  CommandExpressionNode,
  CompletionItem,
  HelperFunctionNode,
  HelperResolver,
  IModuleConstructor,
  ModuleContext,
  ModuleData,
  Node,
  Param,
  Position,
} from "@evmcrispr/sdk";
import {
  BindingsManager,
  BindingsSpace,
  ErrorException,
  IPFSResolver,
  NodeType,
  resolveHelper as resolveHelperFn,
} from "@evmcrispr/sdk";
import type { Chain, PublicClient, Transport } from "viem";
import { createPublicClient, http } from "viem";
import * as viemChains from "viem/chains";
import { mainnet } from "viem/chains";
import { getSemanticDiagnostics as getSemanticDiagnosticsImpl } from "./analysis";
import {
  getCompletions as getCompletionsImpl,
  getKeywords as getKeywordsImpl,
} from "./completions";
import {
  getDiagnostics as getDiagnosticsImpl,
  type ParseDiagnostic,
} from "./diagnostics";
import {
  type DocumentSymbol,
  getDocumentSymbols as getDocumentSymbolsImpl,
} from "./documentSymbols";
import type { ModuleRegistry } from "./evml/registry";
import type { EvmlConfig } from "./evml/types";
import { getHoverInfo as getHoverInfoImpl, type HoverInfo } from "./hover";
import { parseScript } from "./parsers/script";
import {
  type PrewarmSnapshot,
  type VariableHistory,
  walkScript,
} from "./scriptWalk";
import {
  getSignatureHelp as getSignatureHelpImpl,
  type SignatureHelp,
} from "./signature";

/**
 * Long-lived editor/LSP session: completions, hover, signature help,
 * diagnostics, document symbols and prewarm. Holds the module cache and
 * prewarm state across keystrokes — create one per editor, feed it raw
 * script strings, and keep it alive between edits.
 */
export class EvmlWorkspace {
  readonly registry: ModuleRegistry;

  #std: Std;
  #chainId: number;
  #chain: Chain | undefined;
  #client: PublicClient | undefined;
  #transports?: Record<number, Transport>;
  #ipfsResolver: IPFSResolver;

  /** Internal module cache for completions / keywords. */
  #moduleCache: BindingsManager;
  /** USER bindings produced by the most recent `prewarm(script)` call. */
  #scriptBindings?: BindingsManager;
  /** Per-variable `(line, value)` history from the most recent
   *  `prewarm(script)` call. Used by hover to render a variable's value
   *  as it stood at a specific line. */
  #variableHistory?: VariableHistory;
  /** Effective chain id observed during the most recent `prewarm(script)`. */
  #scriptChainId?: number;
  /** Effective PublicClient for the chain reached at the end of the most
   *  recent `prewarm(script)` call. May differ from `#client` when the
   *  script `switch`ed chains. Always paired with `#scriptChainId`. */
  #scriptClient?: PublicClient;
  /** Monotonic guard so slower prewarm calls cannot publish stale state. */
  #prewarmSequence = 0;
  /** Per-command checkpoints from the most recent `prewarm(script)` walk.
   *  The next walk replays the byte-identical command prefix from here
   *  instead of re-resolving it. */
  #prewarmSnapshot?: PrewarmSnapshot;

  constructor(registry: ModuleRegistry, config: EvmlConfig = {}) {
    this.registry = registry;
    this.#chainId = config.chainId ?? mainnet.id;
    this.#chain = Object.values(viemChains).find(
      (c) => (c as Chain).id === this.#chainId,
    ) as Chain | undefined;
    this.#client = this.#chain
      ? (createPublicClient({
          chain: this.#chain,
          transport: config.transports?.[this.#chainId] ?? http(),
        }) as PublicClient)
      : undefined;
    this.#transports = config.transports;
    this.#ipfsResolver = new IPFSResolver();

    this.#std = new Std(this.#createModuleContext());
    this.#moduleCache = new BindingsManager([this.#buildStdBinding()]);
  }

  #buildStdBinding(): Binding {
    return {
      type: BindingsSpace.MODULE,
      identifier: "std",
      value: {
        commands: this.#std.commands,
        helpers: this.#std.helpers,
        helperReturnTypes: this.#std.helperReturnTypes,
        helperHasArgs: this.#std.helperHasArgs,
        helperArgDefs: this.#std.helperArgDefs,
        helperDescriptions: this.#std.helperDescriptions,
        commandDescriptions: this.#std.commandDescriptions,
        types: this.#std.types,
      },
    };
  }

  /** Lightweight module context: enough for instantiating modules to read
   *  their command/helper metadata, never used to execute a script. */
  #createModuleContext(): ModuleContext {
    return {
      bindingsManager: new BindingsManager(),
      nonces: {},
      ipfsResolver: this.#ipfsResolver,
      modules: [],
      getClient: async () => {
        if (!this.#client) throw Error("No client available");
        return this.#client;
      },
      getChainId: async () => this.#chainId,
      getChain: async () => this.#chain,
      switchChainId: () => {
        throw new ErrorException("switchChainId not available in workspace");
      },
      getConnectedAccount: () => {
        throw new ErrorException(
          "getConnectedAccount not available in workspace",
        );
      },
      getTransport: (chainId) => this.#transports?.[chainId] ?? http(),
      setClient: () => {},
      setConnectedAccount: () => {},
      log: () => {},
      loadModule: async (name) => {
        const loader = this.registry.get(name);
        if (!loader) throw new ErrorException(`Module ${name} not found`);
        return loader();
      },
      getAvailableModuleNames: () => this.registry.names(),
    };
  }

  /**
   * Extract module names referenced by `load` commands in the given script.
   */
  #extractLoadModuleNames(script: string): string[] {
    try {
      const { ast } = parseScript(script);
      const lines = script.split("\n");
      const loadCommands = ast.getCommandsUntilLine(lines.length, ["load"]);
      return loadCommands
        .filter(
          (c: CommandExpressionNode) => c.name === "load" && c.args[0]?.value,
        )
        .map((c: CommandExpressionNode) => c.args[0].value as string);
    } catch {
      return [];
    }
  }

  /**
   * Populate the module cache with data for the given module names only.
   * Modules already in the cache are skipped.
   */
  async #ensureModulesInCache(names: string[]): Promise<void> {
    const ctx = this.#createModuleContext();
    for (const name of names) {
      if (this.#moduleCache.hasBinding(name, BindingsSpace.MODULE)) continue;
      const loader = this.registry.get(name);
      if (!loader) continue;
      try {
        const { default: Ctor } = await loader();
        const instance = new Ctor(ctx);
        this.#moduleCache.setBinding(
          name,
          {
            commands: instance.commands,
            helpers: instance.helpers,
            helperReturnTypes: instance.helperReturnTypes,
            helperHasArgs: instance.helperHasArgs,
            helperArgDefs: instance.helperArgDefs,
            helperDescriptions: instance.helperDescriptions,
            commandDescriptions: instance.commandDescriptions,
            types: instance.types,
          },
          BindingsSpace.MODULE,
        );
      } catch {
        // Module failed to load — skip it
      }
    }
  }

  /**
   * Create a HelperResolver callback that can execute helpers with
   * pre-resolved arguments.  Used by the completions engine to evaluate
   * expressions like `@token(USDC)` during the walk phase.
   */
  #createHelperResolver(): HelperResolver {
    return async (
      helperName: string,
      resolvedArgs: string[],
      chainId: number,
      client: PublicClient,
      bindings: BindingsManager,
    ): Promise<Param> => {
      // Find which module owns this helper
      const moduleBindings = this.#moduleCache.getAllBindings({
        spaceFilters: [BindingsSpace.MODULE],
        ignoreNullValues: true,
      });

      let ownerModuleName: string | undefined;
      for (const b of moduleBindings) {
        const data = b.value as ModuleData;
        if (data.helpers[helperName]) {
          ownerModuleName = b.identifier;
          break;
        }
      }

      if (!ownerModuleName) {
        throw new ErrorException(
          `helper @${helperName} not found on any module`,
        );
      }

      // Load the module constructor and create a lightweight instance
      const loader = this.registry.get(ownerModuleName);
      let Ctor: IModuleConstructor;

      if (ownerModuleName === "std") {
        Ctor = Std as unknown as IModuleConstructor;
      } else if (loader) {
        const mod = await loader();
        Ctor = mod.default;
      } else {
        throw new ErrorException(
          `module ${ownerModuleName} not found in registry`,
        );
      }

      const ctx: ModuleContext = {
        bindingsManager: bindings,
        nonces: {},
        ipfsResolver: this.#ipfsResolver,
        modules: [],
        getClient: () => Promise.resolve(client),
        getChainId: () => Promise.resolve(chainId),
        getChain: () => Promise.resolve(this.#chain),
        switchChainId: () => {
          throw new ErrorException(
            "switchChainId not available during completions",
          );
        },
        getConnectedAccount: () => {
          throw new ErrorException(
            "getConnectedAccount not available during completions",
          );
        },
        getTransport: (cId) => this.#transports?.[cId] ?? http(),
        setClient: () => {},
        setConnectedAccount: () => {},
        log: () => {},
        loadModule: async (name) => {
          const l = this.registry.get(name);
          if (!l) throw new ErrorException(`Module ${name} not found`);
          return l();
        },
        getAvailableModuleNames: () => this.registry.names(),
      };

      const instance = new Ctor(ctx);

      // Build a synthetic HelperFunctionNode with StringLiteral args
      const syntheticNode: HelperFunctionNode = {
        type: NodeType.HelperFunctionExpression,
        name: helperName,
        args: resolvedArgs.map((value) => ({
          type: NodeType.StringLiteral as any,
          value,
        })),
      };

      // Passthrough interpreters — args are already resolved
      const interpreters = {
        interpretNode: async (n: Node) => (n as any).value,
        interpretNodes: async (nodes: Node[]) =>
          nodes.map((n) => (n as any).value),
      };

      const helper = await resolveHelperFn(instance.helpers[helperName]);
      return helper(instance, syntheticNode, interpreters);
    };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async getCompletions(
    script: string,
    position: Position,
  ): Promise<CompletionItem[]> {
    await this.#ensureModulesInCache(this.#extractLoadModuleNames(script));

    // Store the current list of available module names in the cache so
    // the `load` command can suggest them during autocompletion.
    this.#moduleCache.setMetadata(
      "__available_modules__",
      JSON.stringify(
        this.registry.names().map((name) => ({
          name,
          description: this.registry.description(name),
        })),
      ),
    );

    return getCompletionsImpl(
      script,
      position,
      this.#moduleCache,
      this.#createHelperResolver(),
      this.#transports,
      this.#chainId,
    );
  }

  async getKeywords(
    script: string,
  ): Promise<{ commands: string[]; helpers: string[] }> {
    await this.#ensureModulesInCache(this.#extractLoadModuleNames(script));
    return getKeywordsImpl(script, this.#moduleCache);
  }

  async getHoverInfo(
    script: string,
    position: Position,
  ): Promise<HoverInfo | null> {
    await this.#ensureModulesInCache(this.#extractLoadModuleNames(script));
    // Pair the chainId with the matching client so on-chain hover calls
    // (eth_getCode etc.) hit the same chain we report in the card. After a
    // `switch` in the script, `#scriptClient` points at the switched-to
    // chain even though `#client` still points at the constructor chain.
    const chainId = this.#scriptChainId ?? this.#chainId;
    const client =
      this.#scriptChainId != null && this.#scriptClient
        ? this.#scriptClient
        : this.#client;
    return getHoverInfoImpl(script, position, {
      moduleCache: this.#moduleCache,
      scriptBindings: this.#scriptBindings,
      variableHistory: this.#variableHistory,
      client,
      chainId,
    });
  }

  /**
   * Pre-resolve every helper call and `set` in `script`, populating the
   * module cache (helper CACHE entries) and `#scriptBindings` (USER values).
   *
   * Call this on every debounced script change so subsequent hover requests
   * can render rich values (e.g. the address card under `@ens(vitalik.eth)`
   * or under a `$dao` variable) without making any new RPC calls.
   *
   * Always resolves; failures during parsing or lookup are swallowed.
   */
  async prewarm(script: string): Promise<void> {
    const sequence = ++this.#prewarmSequence;
    try {
      await this.#ensureModulesInCache(this.#extractLoadModuleNames(script));
      if (sequence !== this.#prewarmSequence) return;

      const {
        bindings,
        chainId,
        client: effectiveClient,
        variableHistory,
        snapshot,
      } = await walkScript(
        script,
        Number.POSITIVE_INFINITY,
        this.#moduleCache,
        this.#createHelperResolver(),
        this.#transports,
        this.#chainId,
        this.#prewarmSnapshot,
      );

      if (sequence !== this.#prewarmSequence) return;

      this.#scriptBindings = bindings;
      this.#variableHistory = variableHistory;
      // Keep the previous checkpoints when the walk produced none (e.g.
      // an unparsable intermediate keystroke) — a later valid script may
      // still share its prefix with the last good walk.
      if (snapshot.checkpoints.length > 0) {
        this.#prewarmSnapshot = snapshot;
      }
      this.#scriptChainId = chainId || undefined;
      // Only retain the prewarmed client when the script switched to a
      // different chain than the constructor client; otherwise we'd shadow
      // any future `setClient(...)` call with a stale instance.
      this.#scriptClient =
        effectiveClient && effectiveClient !== this.#client
          ? effectiveClient
          : undefined;
    } catch {
      // best-effort — never throw from prewarm
    }
  }

  async getSignatureHelp(
    script: string,
    position: Position,
  ): Promise<SignatureHelp | null> {
    await this.#ensureModulesInCache(this.#extractLoadModuleNames(script));
    return getSignatureHelpImpl(script, position, this.#moduleCache);
  }

  /** Return document symbols for the outline view.
   *  This is synchronous and does not require module data. */
  getDocumentSymbols(script: string): DocumentSymbol[] {
    return getDocumentSymbolsImpl(script);
  }

  /** Return parse diagnostics (errors) for the given script.
   *  This is synchronous and does not require module data. */
  getDiagnostics(script: string): ParseDiagnostic[] {
    return getDiagnosticsImpl(script);
  }

  /** Return the full diagnostic set (syntactic parse errors + static
   *  semantic diagnostics: unknown commands/helpers/modules, wrong argument
   *  counts, unknown options, undefined variables, type mismatches, …).
   *  Loads the modules referenced by `load` into the cache first; fully
   *  offline (no RPC). Never throws. */
  async getFullDiagnostics(script: string): Promise<ParseDiagnostic[]> {
    const parse = getDiagnosticsImpl(script);
    let semantic: ParseDiagnostic[] = [];
    try {
      await this.#ensureModulesInCache(this.#extractLoadModuleNames(script));
      semantic = await getSemanticDiagnosticsImpl(
        script,
        this.#moduleCache,
        this.registry.names(),
      );
    } catch {
      semantic = [];
    }
    return [...parse, ...semantic].sort(
      (a, b) => a.line - b.line || a.col - b.col,
    );
  }

  /** Flush the helper result cache.  Call after a transaction is executed. */
  flushCache(): void {
    this.#moduleCache.clearSpace(BindingsSpace.CACHE);
    // Checkpoints replay values resolved through the (now flushed) cache
    // — drop them so the next prewarm recomputes from live state.
    this.#prewarmSnapshot = undefined;
  }

  setClient(client: PublicClient): void {
    this.#client = client;
    const chain = (client as any)?.chain as Chain | undefined;
    if (chain) {
      this.#chain = chain;
      this.#chainId = chain.id;
    }
    // Invalidate any prewarmed switched-to client, since the caller is
    // explicitly choosing a new base client.
    this.#scriptClient = undefined;
    this.#prewarmSnapshot = undefined;
  }

  switchChainId(chainId: number): void {
    this.#chainId = chainId;
    this.#chain = Object.values(viemChains).find(
      (c) => (c as Chain).id === chainId,
    ) as Chain | undefined;
    this.#client = this.#chain
      ? (createPublicClient({
          chain: this.#chain,
          transport: this.#transports?.[chainId] ?? http(),
        }) as PublicClient)
      : undefined;
    // Drop any prewarmed switched-to client; the next prewarm will
    // recompute from the new base client.
    this.#scriptClient = undefined;
    this.#prewarmSnapshot = undefined;
  }
}
