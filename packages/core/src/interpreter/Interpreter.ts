import Std from "@evmcrispr/module-std";
import type {
  Action,
  ActionOutcome,
  ActionReport,
  Binding,
  BoxSnapshot,
  Module,
  ModuleContext,
  NodeInterpreter,
  NodesInterpreter,
  OffchainOverlay,
  RelativeBinding,
} from "@evmcrispr/sdk";
import {
  BindingsManager,
  BindingsSpace,
  ControlFlowSignal,
  chainLabel,
  createOffchainOverlay,
  defaultTransport,
  ErrorException,
  ExitSignal,
  ExperimentalDisabledError,
  experimentalDisabledMessage,
  IPFSResolver,
  isBatchedAction,
  isExperimentalEnabled,
  isSmartBatchAction,
  isTransactionAction,
  resolveChain,
  truncateAddress,
} from "@evmcrispr/sdk";
import type { Address, Chain, PublicClient, Transport } from "viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

import type { ModuleRegistry } from "../evml/registry";
import type { EvmlConfig } from "../evml/types";
import { parseScript } from "../parsers/script";
import { BoxRegistry, STOPPED_FOLLOWING } from "./boxes";
import { classifyError } from "./classify";
import {
  createInterpreter,
  type InterpretCtx,
  makeExecuteWithCaptures,
  makeExecutionResolveCallExpression,
  makeExecutionResolveCommand,
  makeExecutionResolveHelper,
  makeResolveBlockExpression,
} from "./index";
import { OutcomeRegistry } from "./outcomes";

/** Log listener: `meta.box` tags lines that belong to a status box. */
type LogListener = (
  message: string,
  prevMessages: string[],
  meta?: { box?: string },
) => void;

const isTxHash = (value: unknown): value is `0x${string}` =>
  typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);

type ActionCallback = (
  action: Action,
  report?: ActionReport,
) => Promise<unknown>;

/**
 * The low-level EVML runtime: parses and interprets a script against a
 * module registry and environment config. Most consumers should use the
 * `evml` tagged-template API instead; `Interpreter` is the escape hatch
 * for tests and advanced embedding (direct access to `interpretNode`,
 * `bindingsManager`, `getModule`, ...).
 */
export class Interpreter {
  readonly bindingsManager: BindingsManager;
  readonly registry: ModuleRegistry;

  #std!: Std;
  #modules: Module[];
  #nonces: Record<string, number>;
  #offchain: OffchainOverlay;
  #account: Address | undefined;
  #source: string | undefined;
  #sender: Address | undefined;
  #chainId: number;
  #chain: Chain | undefined;

  #logListeners: LogListener[];
  #lineListeners: ((line: number | null) => void)[];
  #actionObservers: ((action: Action) => void)[];
  #prevMessages: string[];
  #onOutput?: (message: string) => void;
  #stdin?: string;
  #signal?: AbortSignal;

  /** Per run: which action carries which, and how each ended. */
  #outcomes = new OutcomeRegistry();
  /** Per run: status boxes opened by commands and by sends. */
  #boxes!: BoxRegistry;
  #onBox?: (snapshot: BoxSnapshot) => void;
  /** Wait for holding boxes before `interpret()` resolves. */
  #follow: boolean;
  /** The current run sends to a host (an action callback exists). */
  #realRun = false;

  #client: PublicClient | undefined;

  #ipfsResolver: IPFSResolver;
  #transports?: Record<number, Transport>;
  /** Captures wrapper bound to this instance — used by the execution-mode
   *  command resolver. Built lazily once `interpretNode` is available. */
  #executeWithCaptures!: ReturnType<typeof makeExecuteWithCaptures>;

  constructor(registry: ModuleRegistry, config: EvmlConfig = {}) {
    this.registry = registry;
    this.bindingsManager = new BindingsManager();
    this.#modules = [];
    this.#nonces = {};
    this.#offchain = createOffchainOverlay();
    this.#chainId = config.chainId ?? mainnet.id;
    // Before the first client: the host's transports decide where the
    // initial chain is read from (a test's anvil, a proxied RPC, ...).
    this.#transports = config.transports;
    const initialTransport = this.#transportFor(this.#chainId);
    this.#chain = resolveChain(this.#chainId, initialTransport);
    if (!this.#chain) {
      throw new ErrorException(`Unknown chain id ${this.#chainId}`);
    }
    this.#client = createPublicClient({
      chain: this.#chain,
      transport: initialTransport ?? http(),
    }) as PublicClient;
    this.#account = config.account;
    this.#sender = config.sender;
    this.#logListeners = config.onLog ? [config.onLog] : [];
    this.#onOutput = config.onOutput;
    this.#stdin = config.stdin;
    this.#lineListeners = config.onLine ? [config.onLine] : [];
    this.#actionObservers = [];
    this.#onBox = config.onBox;
    this.#follow = config.follow ?? true;
    this.#boxes = this.#newBoxes();
    this.#prevMessages = [];
    this.#ipfsResolver = new IPFSResolver();

    this.#initStd();

    // Wire the unified interpreter. The ctx closes over `this`, so live
    // state (modules, client, ...) is read at call time — no rebuild
    // needed when modules load or chains switch.
    const liveChainId = () => this.#chainId;
    const ctx: InterpretCtx = {
      bindings: this.bindingsManager,
      // resolveCallExpression/resolveHelper read live state via closures;
      // chainId is also live so config-var default templates substitute the
      // active chain.
      get chainId() {
        return liveChainId();
      },
      get client() {
        return undefined;
      },
      onError: "throw",
      resolveHelper: makeExecutionResolveHelper({
        bindings: this.bindingsManager,
        std: () => this.#std,
        modules: () => this.#modules,
      }),
      resolveBlockExpression: makeResolveBlockExpression(this.bindingsManager),
      resolveCallExpression: makeExecutionResolveCallExpression({
        bindings: this.bindingsManager,
        getClient: () => this.#getClient(),
      }),
      // resolveCommand depends on executeWithCaptures, which depends on
      // interpretNode. Wire it up after we've built the interpreters.
      // Line notification doubles as the per-node abort checkpoint.
      notifyLine: (line) => {
        if (this.#signal?.aborted) {
          throw new ErrorException("Execution cancelled");
        }
        this.#notifyLine(line);
      },
    };
    const interpreters = createInterpreter(ctx);
    this.interpretNode = interpreters.interpretNode;
    this.interpretNodes = interpreters.interpretNodes;

    this.#executeWithCaptures = makeExecuteWithCaptures({
      bindings: this.bindingsManager,
      getClient: () => this.#getClient(),
      interpretNode: this.interpretNode,
      onActionDispatch: (action) => {
        for (const observer of this.#actionObservers) observer(action);
      },
      aroundSend: (action, send, simulated) =>
        this.#aroundSend(action, send, simulated),
    });

    ctx.resolveCommand = makeExecutionResolveCommand({
      bindings: this.bindingsManager,
      std: () => this.#std,
      modules: () => this.#modules,
      getClient: () => this.#getClient(),
      executeWithCaptures: this.#executeWithCaptures,
      outcomes: () => this.#outcomes,
      boxes: () => this.#boxes,
      realRun: () => this.#realRun,
    });
  }

  #newBoxes(): BoxRegistry {
    return new BoxRegistry({
      outcomes: this.#outcomes,
      emit: (snapshot) => this.#onBox?.(snapshot),
      log: (message, box) => this.log(message, { box }),
      aborted: () => this.#signal?.aborted === true,
    });
  }

  /** Sends one action: opens its transaction box, reports the hash and
   *  settles the action's outcome for boxes that follow it. */
  async #aroundSend(
    action: Action,
    send: (report?: ActionReport) => Promise<unknown>,
    simulated: boolean,
  ): Promise<unknown> {
    // Simulated sends (inside `sim:fork`) open no box: no wallet is
    // involved, and simulation output (CLI, MCP) stays unchanged. Their
    // outcomes still settle, so simulated followers work.
    const title = simulated ? undefined : this.#sendTitle(action);
    const box = title
      ? this.#boxes.open({
          title,
          detail: this.#waitingFor(action),
          simulated,
          realRun: () => this.#realRun,
        })
      : undefined;
    if (box) this.#outcomes.attachBox(action, box.id);
    const chainId = "chainId" in action ? action.chainId : undefined;
    let reported: `0x${string}` | undefined;
    const report: ActionReport = {
      sent: (hash) => {
        reported = hash;
        box?.update({
          detail: this.#sentDetail(hash, chainId),
          links: this.#txLink(hash, chainId),
        });
      },
    };
    try {
      const result = await this.#untilCancelled(send(report));
      const sends = this.#sendsTransaction(action);
      // A host that returns the bare hash (`wallet.sendTransaction`) sent
      // it without reporting: the hash is the report.
      if (sends && !reported && isTxHash(result)) report.sent(result);
      // Only sends are judged by their result: a wallet, RPC or terminal
      // action that returned has done its job.
      const { outcome, detail } = sends
        ? await this.#settleSend(result, reported, chainId, simulated)
        : {
            outcome: { kind: "confirmed", receipt: result } as const,
            detail: "Confirmed",
          };
      if (outcome.kind === "reverted") box?.fail(detail);
      else box?.done(detail);
      this.#outcomes.settle(action, outcome);
      return result;
    } catch (err) {
      // Cancelled mid-send. Before the host reported a hash nothing went
      // out: the outcome stays open and the run's unwinding settles it as
      // not sent. After it, the transaction may still confirm: say so,
      // and settle it as unknown rather than failed or not sent. Boxes
      // following it see the cancel and stop following.
      if (this.#signal?.aborted) {
        if (reported) {
          box?.cancel("Sent; stopped waiting for the receipt");
          this.#outcomes.settle(action, {
            kind: "unknown",
            reason: "Sent; outcome unknown",
          });
        } else box?.cancel("Cancelled");
        throw err;
      }
      const outcome = classifyError(err);
      // The full revert message stays in the outcome and the error.
      box?.fail(
        outcome.kind === "reverted"
          ? "Reverted"
          : outcome.kind === "confirmed"
            ? "Failed"
            : outcome.reason,
      );
      this.#outcomes.settle(action, outcome);
      throw err;
    }
  }

  /** How a send the host returned from ended. Only a mined receipt
   *  (`status: "success"`) confirms it; a host that queued the send
   *  (`status: "queued"`, e.g. a Safe App) or returned no receipt leaves it
   *  unconfirmed, unless the hash it reported has a receipt that says
   *  otherwise. */
  async #settleSend(
    result: unknown,
    reported: `0x${string}` | undefined,
    chainId: number | undefined,
    simulated: boolean,
  ): Promise<{ outcome: ActionOutcome; detail: string }> {
    const r = (result && typeof result === "object" ? result : {}) as {
      status?: unknown;
      blockNumber?: bigint;
      reason?: unknown;
    };
    const mined = (status: unknown, blockNumber?: bigint, receipt = result) =>
      status === "success"
        ? {
            outcome: { kind: "confirmed", receipt } as const,
            detail:
              blockNumber !== undefined
                ? `Confirmed in block ${blockNumber}`
                : "Confirmed",
          }
        : status === "reverted"
          ? {
              outcome: { kind: "reverted", reason: "Reverted" } as const,
              detail: "Reverted",
            }
          : undefined;
    const known = mined(r.status, r.blockNumber);
    if (known) return known;
    if (r.status === "queued") {
      const reason =
        typeof r.reason === "string" ? r.reason : "Queued; not executed yet";
      return { outcome: { kind: "unknown", reason }, detail: reason };
    }
    // A hash the host reported (`report.sent`) is on the action's chain:
    // its receipt says how the send ended.
    const hash = reported;
    if (hash && !simulated) {
      try {
        const receipt = await this.#untilCancelled(
          (await this.#clientFor(chainId)).waitForTransactionReceipt({ hash }),
        );
        const fetched = mined(receipt.status, receipt.blockNumber, receipt);
        if (fetched) return fetched;
      } catch (err) {
        if (this.#signal?.aborted) throw err;
      }
    }
    return {
      outcome: {
        kind: "unknown",
        reason: "Sent through the host; outcome unknown",
      },
      detail: "Sent; outcome unknown",
    };
  }

  /** Whether `action` sends a transaction (not a read, wallet, RPC or
   *  terminal action). */
  #sendsTransaction(action: Action): boolean {
    if (isTransactionAction(action)) return !action.readOnly;
    return isBatchedAction(action) || isSmartBatchAction(action);
  }

  /** A public client on `chainId` (the current one when omitted). */
  async #clientFor(chainId?: number): Promise<PublicClient> {
    if (chainId === undefined || chainId === this.#chainId)
      return this.#getClient();
    const transport = this.#transportFor(chainId);
    const chain = resolveChain(chainId, transport);
    return createPublicClient({
      chain,
      transport: transport ?? http(),
    }) as PublicClient;
  }

  /** The box detail of a sent hash: the full hash, linked on the explorer
   *  when the chain has one, so hosts without boxes (the CLI, plain log
   *  listeners) still say which transaction was sent. */
  #sentDetail(hash: `0x${string}`, chainId?: number): string {
    const link = this.#txLink(hash, chainId)?.Transaction;
    return link ? `Sent [${hash.slice(0, 10)}…](${link})` : `Sent ${hash}`;
  }

  /** The transaction box title of a send, or undefined when the action
   *  sends no transaction (reads, wallet/RPC/terminal actions). */
  #sendTitle(action: Action): string | undefined {
    if (isTransactionAction(action)) {
      if (action.readOnly) return undefined;
      return action.to
        ? `Transaction to ${truncateAddress(action.to)}`
        : "Contract deployment";
    }
    if (isBatchedAction(action))
      return `Batch of ${action.actions.length} calls on ${chainLabel(action.chainId)}`;
    if (isSmartBatchAction(action))
      return `Smart batch on ${chainLabel(action.chainId)}`;
    return undefined;
  }

  /** The first detail of a transaction box: the wallet, or the other
   *  signer a send from someone else waits for. */
  #waitingFor(action: Action): string {
    const from = isTransactionAction(action) ? action.from : undefined;
    return from &&
      this.#account &&
      from.toLowerCase() !== this.#account.toLowerCase()
      ? `Waiting for ${truncateAddress(from)}`
      : "Waiting for wallet…";
  }

  /** Races a send against the run's signal: a wallet prompt or receipt
   *  wait never settles on cancel, so the run stops waiting for it. */
  #untilCancelled<T>(pending: Promise<T>): Promise<T> {
    const signal = this.#signal;
    if (!signal) return pending;
    if (signal.aborted)
      return Promise.reject(new ErrorException("Execution cancelled"));
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(new ErrorException("Execution cancelled"));
      signal.addEventListener("abort", onAbort, { once: true });
      pending.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (err) => {
          signal.removeEventListener("abort", onAbort);
          reject(err);
        },
      );
    });
  }

  /** The explorer link of a sent hash, on the action's own chain (a
   *  routed or bridged action may not be on the current one). */
  #txLink(
    hash: `0x${string}`,
    chainId?: number,
  ): Record<string, string> | undefined {
    const chain =
      chainId !== undefined && chainId !== this.#chainId
        ? resolveChain(chainId, this.#transportFor(chainId))
        : this.#chain;
    const explorer = chain?.blockExplorers?.default.url;
    return explorer
      ? { Transaction: `${explorer.replace(/\/$/, "")}/tx/${hash}` }
      : undefined;
  }

  #buildStdBinding(): Binding {
    return {
      type: BindingsSpace.MODULE,
      identifier: "std",
      value: this.#std.toModuleData(),
    };
  }

  #createModuleContext(): ModuleContext {
    const self = this;
    return {
      stdin: this.#stdin,
      get signal() {
        return self.#signal;
      },
      bindingsManager: this.bindingsManager,
      nonces: this.#nonces,
      offchain: this.#offchain,
      ipfsResolver: this.#ipfsResolver,
      modules: this.#modules,
      getClient: () => this.getClient(),
      getChainId: () => this.getChainId(),
      getChain: () => this.getChain(),
      switchChainId: (chainId) => this.switchChainId(chainId),
      getConnectedAccount: (retreiveInjected) =>
        this.getConnectedAccount(retreiveInjected),
      getTransport: (chainId) => this.#transportFor(chainId) ?? http(),
      setClient: (client) => this.setClient(client),
      setConnectedAccount: (account) => this.setConnectedAccount(account),
      getSender: () => this.getSender(),
      setSender: (sender) => this.setSender(sender),
      log: (message) => this.log(message),
      output: (message) => this.output(message),
      getStd: () => this.#std,
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
      getSource: () => this.#source,
      endSimulatedBoxes: (detail) => this.#boxes.endSimulated(detail),
    };
  }

  #initStd(): void {
    this.#std = new Std(this.#createModuleContext());
  }

  // ---------------------------------------------------------------------------
  // Public API: interpret
  // ---------------------------------------------------------------------------

  async interpret(
    script: string,
    actionCallback?: ActionCallback,
    options: { signal?: AbortSignal } = {},
  ): Promise<Action[]> {
    this.#signal = options.signal;
    this.#source = script;
    const { ast, errors } = parseScript(script);

    if (errors.length) {
      throw new ErrorException(`Parse errors:\n${errors.join("\n")}`);
    }

    // Reset per-execution state
    this.#modules = [];
    this.#nonces = {};
    this.#offchain = createOffchainOverlay();
    this.#prevMessages = [];
    this.#outcomes = new OutcomeRegistry();
    this.#boxes = this.#newBoxes();
    this.#realRun = actionCallback !== undefined;
    this.#initStd();
    this.bindingsManager.setBindings(this.#buildStdBinding());

    try {
      const results = await this.interpretNodes(ast.body, true, {
        actionCallback,
      });
      const actions = results
        .flat()
        .filter((result) => typeof result !== "undefined");
      await this.#finishRun();
      return actions;
    } catch (err) {
      // `exit` is the clean stop: the run ends like a finished script
      // (holding boxes are still waited for), then the signal propagates.
      if (err instanceof ExitSignal) {
        await this.#finishRun();
        throw err;
      }
      this.#outcomes.settleUnsent("Not sent");
      if (this.#signal?.aborted) {
        this.#boxes.endLive("cancelled", () => STOPPED_FOLLOWING);
        // Whatever the cancel interrupted (a send, a wait, a command that
        // wrapped the error with its location), the run reports one plain
        // "Execution cancelled": hosts match that message to show a cancel.
        throw new ErrorException("Execution cancelled");
      }
      this.#boxes.stopOnFailure(
        err instanceof Error ? err.message : String(err),
      );
      // A `loop break` / `loop continue` / `def return` that reached the
      // top level was used outside its construct — surface it as a plain
      // error (its default message says where it belongs).
      if (err instanceof ControlFlowSignal) {
        throw new ErrorException(err.message);
      }
      throw err;
    } finally {
      this.#notifyLine(null);
    }
  }

  /** Every statement ran (or `exit` stopped the script): settle what was
   *  never sent, wait for holding boxes, then end the rest. */
  async #finishRun(): Promise<void> {
    // Actions the host never dispatched (a dry run, or returned actions
    // the host did not send) end their followers as not-sent.
    this.#outcomes.settleUnsent(
      this.#realRun ? "Not sent" : "Not sent (dry run)",
    );
    // Let watches see outcomes that just settled before live boxes end.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The script is done; boxes may still be live.
    this.#notifyLine(null);
    if (this.#realRun && this.#follow) {
      try {
        await this.#boxes.waitForHolding(this.#signal);
      } catch (err) {
        // Cancelled after every statement ran: the run succeeded and only
        // stops following (its live boxes already ended cancelled).
        if (!this.#signal?.aborted) throw err;
      }
    }
    this.#boxes.endLive("done", (box) =>
      box.simulated ? "Simulation ended" : STOPPED_FOLLOWING,
    );
  }

  /** How `actions` ended in the last run (resolves once they settle). */
  outcomeOf(actions: Action[]): Promise<ActionOutcome> {
    return this.#outcomes.outcomeOf(actions);
  }

  // ---------------------------------------------------------------------------
  // Client / account management
  // ---------------------------------------------------------------------------

  async getChainId(): Promise<number> {
    return this.#chainId;
  }

  setClient(client: PublicClient): void {
    this.#client = client;
    // Track the client's chain so subsequent helpers / commands see the
    // right chain id. Used by `sim:fork` to swap the active client to a
    // forked chain mid-execution.
    const chain = (client as any)?.chain as Chain | undefined;
    if (chain) {
      this.#chain = chain;
      this.#chainId = chain.id;
    }
  }

  async getClient(): Promise<PublicClient> {
    return this.#getClient();
  }

  setConnectedAccount(account: Address | undefined) {
    this.#account = account;
  }

  setSender(sender: Address | undefined) {
    this.#sender = sender;
  }

  /** The account the current calls are sent from: the one a block command
   *  set, else the connected account. */
  async getSender(): Promise<Address> {
    return this.#sender ?? this.getConnectedAccount(true);
  }

  async getConnectedAccount(_retreiveInjected = false): Promise<Address> {
    if (!this.#account) {
      throw Error(
        "No connected account found. Connect a wallet or use --from to specify a sender address.",
      );
    }
    return this.#account;
  }

  async getChain(): Promise<Chain | undefined> {
    return this.#chain;
  }

  /** Host-configured transport for a chain, else the transport a module
   *  declared for it (`ChainDef.rpcUrl`). Undefined for unknown chains. */
  #transportFor(chainId: number): Transport | undefined {
    return this.#transports?.[chainId] ?? defaultTransport(chainId);
  }

  switchChainId(chainId: number): PublicClient {
    this.#chainId = chainId;

    const transport = this.#transportFor(chainId);
    const chain = resolveChain(chainId, transport);
    this.#chain = chain;
    const client = chain
      ? (createPublicClient({
          chain,
          transport: transport ?? http(),
        }) as PublicClient)
      : undefined;
    this.#client = client;

    if (!client) throw Error("No client available");
    return client;
  }

  // ---------------------------------------------------------------------------
  // Bindings / modules
  // ---------------------------------------------------------------------------

  getBinding<BSpace extends BindingsSpace>(
    name: string,
    memSpace: BSpace,
  ): RelativeBinding<BSpace>["value"] | undefined {
    return this.bindingsManager.getBindingValue(name, memSpace);
  }

  getModule(name: string): Module | undefined {
    if (name === this.#std.name) {
      return this.#std;
    }

    return this.#modules.find((m) => m.name === name);
  }

  getAllModules(): Module[] {
    return [this.#std, ...this.#modules];
  }

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  registerLogListener(listener: LogListener): Interpreter {
    this.#logListeners.push(listener);
    return this;
  }

  registerLineListener(listener: (line: number | null) => void): Interpreter {
    this.#lineListeners.push(listener);
    return this;
  }

  /** Observes every action the first time it is dispatched for execution,
   *  including actions consumed inside `sim:fork` blocks (which never
   *  surface in `interpret()`'s return value). */
  registerActionObserver(observer: (action: Action) => void): Interpreter {
    this.#actionObservers.push(observer);
    return this;
  }

  #notifyLine(line: number | null): void {
    this.#lineListeners.forEach((l) => l(line));
  }

  output(message: string): void {
    if (this.#onOutput) this.#onOutput(message);
    else this.log(message);
  }

  /** `meta.box` tags a line that belongs to a status box. */
  log(message: string, meta?: { box?: string }): void {
    this.#logListeners.forEach((listener) =>
      listener(message, this.#prevMessages, meta),
    );
    this.#prevMessages.push(message);
  }

  // ---------------------------------------------------------------------------
  // Interpreters
  // ---------------------------------------------------------------------------
  //
  // All node-level interpretation lives in `./index`. Both fields are
  // assigned in the constructor — declare them here so the rest of the
  // class can reference them.

  interpretNode!: NodeInterpreter;
  interpretNodes!: NodesInterpreter;

  #getClient = async (): Promise<PublicClient> => {
    if (this.#client) {
      return this.#client;
    }
    throw Error("No client available");
  };
}
