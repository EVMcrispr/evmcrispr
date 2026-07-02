# @evmcrispr/core

[![](https://img.shields.io/npm/v/@evmcrispr/core.svg?logo=npm)](https://www.npmjs.com/package/@evmcrispr/core)

**_EVMcrispr is still in active development and its API might change until it reaches 1.0._**

EVMcrispr parses and runs **EVML** scripts — a DSL for encoding batches of on-chain actions (contract calls, DAO operations, token transfers, deployments) that can be simulated on a fork and then executed with any viem wallet.

## Quick start

```sh
bun add @evmcrispr/core viem
```

```ts
import { evml } from "@evmcrispr/core";

const script = evml`
  exec ${tokenAddress} transfer(address,uint256) ${recipient} 100e18
`;

const actions = await script.interpret();  // dry run: resolve Action[]
await script.execute(walletClient);        // sign & send with a viem WalletClient
```

Values interpolated with `${...}` are serialized into EVML literals safely: addresses and hex strings splice bare, other strings are quoted and escaped (injection-safe), numbers and bigints (including negatives) become numeric literals, arrays become `[a b c]`, and nested `evml` fragments compose. Use `evml.raw("...")` to splice text verbatim.

## Modules

Language modules ship as separate packages and are registered with `use()` — registration makes `load <name>` work inside scripts; `std` is always available:

```ts
import { evml } from "@evmcrispr/core";
import aragonos from "@evmcrispr/module-aragonos";

evml.use(aragonos); // eager

// or lazy, keeping code-splitting in bundled apps:
evml.use({ name: "aragonos", load: () => import("@evmcrispr/module-aragonos") });

const script = evml`
  load aragonos
  connect mydao (
    exec token-manager mint ${recipient} 100e18
  )
`;
```

## Configuration

Environment config lives on the tag; `with()` returns a derived tag that shares the module registry:

```ts
const gnosisEvml = evml.with({
  account: "0x...",                       // sender account
  chainId: 100,                           // initial chain (default mainnet)
  transports: { 100: http("https://rpc.gnosischain.com") },
  onLog: (message) => console.log(message),
});

await gnosisEvml`print @token(WETH)`.interpret();
```

Per-run options go on the method instead:

```ts
await script.execute(walletClient, {
  signal: abortController.signal,
  maximizeGasLimit: true,
  handlers: { batched: mySafeBatchHandler }, // override any action type
});
```

## Simulation

With `@evmcrispr/module-sim` registered, `simulate()` runs the script inside a fork (`anvil`, `hardhat`, `tenderly` or the in-process `ethereumjs` backend) and never throws on script failure:

```ts
import sim from "@evmcrispr/module-sim";
evml.use(sim);

const { success, logs, error } = await script.simulate({ blockNumber: 21000000 });
```

## Editor tooling

`evml.workspace()` returns a long-lived `EvmlWorkspace` with the LSP-style surface: `getCompletions`, `getHoverInfo`, `getSignatureHelp`, `getDiagnostics`, `getDocumentSymbols` and `prewarm`. Prewarm is incremental: it checkpoints per command and only re-resolves from the first edited command on each keystroke.

```ts
const workspace = evml.with({ transports }).workspace();
await workspace.prewarm(source);
const hover = await workspace.getHoverInfo(source, { line: 2, col: 10 });
```

## Low-level access

`Interpreter` is the underlying runtime (`new Interpreter(evml.registry, config)`), exposing `interpret`, `interpretNode`, `bindingsManager` and module accessors — useful for tests and advanced embedding. `parseScript(source)` returns the raw AST.

## Other examples

- [Commons Upgrade script](https://github.com/CommonsSwarm/commons-upgrade)

## Contributing

We welcome community contributions!

Please check out our open [Issues](https://github.com/EVMcrispr/evmcrispr/issues) to get started.
