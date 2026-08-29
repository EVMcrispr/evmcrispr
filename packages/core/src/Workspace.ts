import Std from "@evmcrispr/module-std";
import type {
  Binding,
  BlockExpressionNode,
  CommandExpressionNode,
  CompletionItem,
  HelperFunctionNode,
  HelperResolver,
  IModuleConstructor,
  ImportValue,
  ModuleContext,
  ModuleData,
  Node,
  Param,
  Position,
} from "@evmcrispr/sdk";
import {
  BindingsManager,
  BindingsSpace,
  createOffchainOverlay,
  defaultTransport,
  ErrorException,
  ExperimentalDisabledError,
  experimentalDisabledMessage,
  IPFSResolver,
  isExperimentalEnabled,
  NodeType,
  resolveChain,
  resolveHelper as resolveHelperFn,
  resolveModuleSource,
} from "@evmcrispr/sdk";
import type { Chain, PublicClient, Transport } from "viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import {
  getSemanticDiagnostics as getSemanticDiagnosticsImpl,
  synthesizeModuleData,
} from "./analysis";
import {
  collectQualifiedModules,
  getAutoImportEdits as getAutoImportEditsImpl,
  type NormalizationRegion,
} from "./autoImport";
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
import type { EvmlAST } from "./EvmlAST";
import type { ModuleRegistry } from "./evml/registry";
import type { EvmlConfig } from "./evml/types";
import { getHoverInfo as getHoverInfoImpl, type HoverInfo } from "./hover";
import { parseScript } from "./parsers/script";
import {
  getRenameEdits as getRenameEditsImpl,
  prepareRename as prepareRenameImpl,
  type RenameEdit,
  type RenameRange,
  type RenameResult,
} from "./rename";
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
  /** Names currently bound from script-derived modules (inline `module`
   *  blocks and `load --from` aliases) — refreshed per analysis call. */
  #syntheticModuleNames = new Set<string>();
  /** Fetched external module schemas keyed by CID (immutable → cached
   *  forever; failures are never cached). */
  #remoteModuleData = new Map<string, ModuleData>();
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
    const initialTransport =
      config.transports?.[this.#chainId] ?? defaultTransport(this.#chainId);
    this.#chain = resolveChain(this.#chainId, initialTransport);
    this.#client = this.#chain
      ? (createPublicClient({
          chain: this.#chain,
          transport: initialTransport ?? http(),
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
      value: this.#std.toModuleData(),
    };
  }

  /** Lightweight module context: enough for instantiating modules to read
   *  their command/helper metadata, never used to execute a script. */
  #createModuleContext(): ModuleContext {
    return {
      bindingsManager: new BindingsManager(),
      nonces: {},
      offchain: createOffchainOverlay(),
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
      getTransport: (chainId) =>
        this.#transports?.[chainId] ?? defaultTransport(chainId) ?? http(),
      setClient: () => {},
      setConnectedAccount: () => {},
      getSender: () => {
        throw new ErrorException("getSender not available in workspace");
      },
      setSender: () => {},
      log: () => {},
      loadModule: async (name) => {
        if (this.registry.isExperimental(name) && !isExperimentalEnabled()) {
          throw new ExperimentalDisabledError(
            experimentalDisabledMessage("module", name),
          );
        }
        const loader = this.registry.get(name);
        if (!loader) throw new ErrorException(`Module ${name} not found`);
        return loader();
      },
      getAvailableModuleNames: () => this.registry.names(),
      parseEvml: (script) => parseScript(script),
      getSource: () => undefined,
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
          (c: CommandExpressionNode) =>
            c.name === "load" &&
            c.args[0]?.value &&
            // `--from` loads bind script-derived modules — the registry
            // must not seed (and thereby shadow) those names.
            !c.opts?.some((o) => o.name === "from"),
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
  /** Refresh script-derived module schemas: inline `module` blocks
   *  (synthesized from their def signatures) and `load <alias> --from`
   *  externals (fetched by CID and cached forever — CIDs are immutable;
   *  fetch failures bind an opaque placeholder and are NOT cached). Stale
   *  synthetic names from earlier edits are nulled out. */
  async #ensureScriptDerivedModules(script: string): Promise<void> {
    let ast: EvmlAST;
    try {
      ({ ast } = parseScript(script));
    } catch {
      return;
    }
    const lines = script.split("\n");
    const nodes = ast.getCommandsUntilLine(lines.length, ["load", "def"]);
    const current = new Set<string>();

    // Names the script binds via plain `load` — those keep the registry
    // schema; every other script-derived name shadows the registry (local
    // definitions win, so future built-ins never break existing scripts).
    const plainLoaded = new Set<string>(
      nodes
        .filter(
          (c) =>
            c.name === "load" &&
            c.args[0]?.value &&
            !c.opts?.some((o) => o.name === "from"),
        )
        .map((c) => String(c.args[0].value)),
    );

    for (const c of nodes) {
      if (
        c.name === "def" &&
        c.args[0]?.type === NodeType.Bareword &&
        c.args[0].value === "module"
      ) {
        const nameArg = c.args[1];
        const block = c.args.find((a) => a.type === NodeType.BlockExpression) as
          | BlockExpressionNode
          | undefined;
        if (nameArg?.type !== NodeType.Bareword || !block) continue;
        const name = nameArg.value as string;
        if (plainLoaded.has(name)) continue;
        current.add(name);
        this.#moduleCache.setBinding(
          name,
          synthesizeModuleData(block),
          BindingsSpace.MODULE,
          false,
          undefined,
          true,
        );
        this.#syntheticModuleNames.add(name);
      } else if (c.name === "load") {
        const fromVal = c.opts?.find((o) => o.name === "from")?.value;
        const aliasArg = c.args[0];
        if (!fromVal || aliasArg?.type !== NodeType.Bareword) continue;
        // `name>alias` renames bind under the alias.
        const alias = String(aliasArg.value).split(">").pop() as string;
        if (!alias) continue;
        if (plainLoaded.has(alias)) continue;
        current.add(alias);
        const from = String((fromVal as any).value ?? "");
        const m = from.match(/^ipfs:\/\/([a-zA-Z0-9]+)(?:#([A-Za-z0-9_-]+))?$/);
        const cid = m?.[1];
        let data = cid ? this.#remoteModuleData.get(cid) : undefined;
        if (!data && cid) {
          data = await this.#fetchRemoteModule(cid, m?.[2]);
          if (data) this.#remoteModuleData.set(cid, data);
        }
        this.#moduleCache.setBinding(
          alias,
          data ?? { commands: {}, helpers: {}, opaque: true, synthetic: true },
          BindingsSpace.MODULE,
          false,
          undefined,
          true,
        );
        this.#syntheticModuleNames.add(alias);
      }
    }

    for (const name of [...this.#syntheticModuleNames]) {
      if (!current.has(name)) {
        this.#moduleCache.setBinding(
          name,
          null,
          BindingsSpace.MODULE,
          false,
          undefined,
          true,
        );
        this.#syntheticModuleNames.delete(name);
      }
    }
  }

  /** Fetch + parse an external module file into a ModuleData schema.
   *  Bounded by a timeout so headless validate never hangs; undefined on
   *  any failure (offline, bad content, no module block). */
  async #fetchRemoteModule(
    cid: string,
    decryptionKey?: string,
  ): Promise<ModuleData | undefined> {
    try {
      const raw = await Promise.race([
        this.#ipfsResolver.text(cid),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 5_000),
        ),
      ]);
      const source = await resolveModuleSource(raw, { decryptionKey });
      const { ast } = parseScript(source);
      const moduleNode = ast.body.find(
        (n) =>
          n?.type === NodeType.CommandExpression &&
          n.name === "def" &&
          n.args[0]?.type === NodeType.Bareword &&
          n.args[0].value === "module",
      );
      const block = moduleNode?.args.find(
        (a) => a.type === NodeType.BlockExpression,
      ) as BlockExpressionNode | undefined;
      if (!block) return undefined;
      return synthesizeModuleData(block);
    } catch {
      return undefined;
    }
  }

  async #ensureModulesInCache(names: string[]): Promise<void> {
    const ctx = this.#createModuleContext();
    for (const name of names) {
      // Skip only when a real schema is cached: synthetic entries (from a
      // previous edit's `def module` / `--from`) and nulled tombstones are
      // replaced by the registry module now that the script plain-loads it.
      const existing = this.#moduleCache.getBindingValue(
        name,
        BindingsSpace.MODULE,
      );
      if (existing && !existing.synthetic) continue;
      const loader = this.registry.get(name);
      if (!loader) continue;
      try {
        const { default: Ctor } = await loader();
        const instance = new Ctor(ctx);
        this.#moduleCache.setBinding(
          name,
          instance.toModuleData(),
          BindingsSpace.MODULE,
          false,
          undefined,
          true,
        );
        this.#syntheticModuleNames.delete(name);
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
      helper: { module?: string; name: string },
      resolvedArgs: string[],
      chainId: number,
      client: PublicClient,
      bindings: BindingsManager,
    ): Promise<Param> => {
      // Same resolution order as execution: qualified module → import
      // bindings (recorded by the walk) → std prelude.
      let ownerModuleName: string;
      let localName = helper.name;

      if (helper.module) {
        ownerModuleName = helper.module;
      } else {
        const imported = bindings.getBindingValue(
          `@${helper.name}`,
          BindingsSpace.IMPORT,
        ) as ImportValue | undefined;
        if (imported && imported.kind !== "command") {
          ownerModuleName = imported.module;
          localName = imported.name;
        } else {
          ownerModuleName = "std";
        }
      }

      const data = this.#moduleCache.getBindingValue(
        ownerModuleName,
        BindingsSpace.MODULE,
      ) as ModuleData | undefined;

      if (!data?.helpers[localName]) {
        if (
          resolvedArgs.length === 0 &&
          data?.constants?.[localName] !== undefined
        ) {
          return data.constants[localName];
        }
        throw new ErrorException(
          `helper @${helper.module ? `${helper.module}:` : ""}${helper.name} not found`,
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
        offchain: createOffchainOverlay(),
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
        getSender: () => {
          throw new ErrorException(
            "getSender not available during completions",
          );
        },
        setSender: () => {},
        log: () => {},
        loadModule: async (name) => {
          const l = this.registry.get(name);
          if (!l) throw new ErrorException(`Module ${name} not found`);
          return l();
        },
        getAvailableModuleNames: () => this.registry.names(),
        parseEvml: (script) => parseScript(script),
        getSource: () => undefined,
      };

      const instance = new Ctor(ctx);

      // Build a synthetic HelperFunctionNode with StringLiteral args,
      // dispatching on the module-local name.
      const syntheticNode: HelperFunctionNode = {
        type: NodeType.HelperFunctionExpression,
        name: localName,
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

      const helperFn = await resolveHelperFn(instance.helpers[localName]);
      return helperFn(instance, syntheticNode, interpreters);
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
    await this.#ensureScriptDerivedModules(script);

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
    await this.#ensureScriptDerivedModules(script);
    return getKeywordsImpl(script, this.#moduleCache);
  }

  async getHoverInfo(
    script: string,
    position: Position,
  ): Promise<HoverInfo | null> {
    await this.#ensureModulesInCache(this.#extractLoadModuleNames(script));
    await this.#ensureScriptDerivedModules(script);
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
      await this.#ensureScriptDerivedModules(script);
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
    await this.#ensureScriptDerivedModules(script);
    return getSignatureHelpImpl(script, position, this.#moduleCache);
  }

  /** Return document symbols for the outline view.
   *  This is synchronous and does not require module data. */
  getDocumentSymbols(script: string): DocumentSymbol[] {
    return getDocumentSymbolsImpl(script);
  }

  /** Edits that normalize qualified names written inside `regions` (whole
   *  script when omitted) to unqualified spellings backed by load
   *  import-list entries — auto-import for `ens:renew` → `renew` +
   *  `load ens [renew]`. Only rewrites names that resolve and whose
   *  unqualified spelling is free; returns [] otherwise. */
  async getAutoImportEdits(
    script: string,
    regions?: NormalizationRegion[],
  ): Promise<RenameEdit[]> {
    await this.#ensureModulesInCache([
      ...this.#extractLoadModuleNames(script),
      ...collectQualifiedModules(script).filter(
        (m) => this.registry.get(m) !== undefined,
      ),
    ]);
    return getAutoImportEditsImpl(
      script,
      (name) =>
        this.#moduleCache.getBindingValue(name, BindingsSpace.MODULE) as
          | ModuleData
          | undefined,
      regions,
    );
  }

  /** Range/text of the renameable imported name at `position`, or null.
   *  Purely syntactic — no module data required. */
  prepareRename(script: string, position: Position): RenameRange | null {
    return prepareRenameImpl(script, position);
  }

  /** Workspace edits renaming the imported name at `position` to `newName`:
   *  updates the load import-list entry (adding/updating its `>` rename)
   *  plus every unqualified usage. */
  getRenameEdits(
    script: string,
    position: Position,
    newName: string,
  ): RenameResult {
    return getRenameEditsImpl(script, position, newName);
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
      await this.#ensureScriptDerivedModules(script);
      semantic = await getSemanticDiagnosticsImpl(
        script,
        this.#moduleCache,
        this.registry.names(),
        this.registry.experimentalNames(),
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
    const transport = this.#transports?.[chainId] ?? defaultTransport(chainId);
    this.#chain = resolveChain(chainId, transport);
    this.#client = this.#chain
      ? (createPublicClient({
          chain: this.#chain,
          transport: transport ?? http(),
        }) as PublicClient)
      : undefined;
    // Drop any prewarmed switched-to client; the next prewarm will
    // recompute from the new base client.
    this.#scriptClient = undefined;
    this.#prewarmSnapshot = undefined;
  }
}
