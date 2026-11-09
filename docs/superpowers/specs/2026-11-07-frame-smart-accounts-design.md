# Frame transactions from smart accounts, signed by a wallet

Status: design, awaiting approval (2026-11-07). Builds on `frames:tx`
(docs/superpowers/specs/2026-11-06-frame-tx-design.md), merged in `next`.

## Intent

The prize demo (ETHGlobal Mumbai, EF "Best Use of the Frame Transaction
Alternative Mempool") is the owner in the EVMcrispr **terminal with
MetaMask**: a script creates a smart account and a sponsor, then sends a
frame transaction from the account, authorized by one MetaMask signature
and paid by the sponsor. Today `frames:tx` can only be sent from the CLI with
a local key, because a wallet cannot sign a type `0x06` transaction. A
frame-aware account whose VERIFY frame checks an EIP-712 signature removes
that limit: MetaMask signs typed data, which it does readily.

Two throwaway spikes (2026-11-06/07, not in the repo) proved the whole path
on the public alt-mempool devnet (chain 1337):

- An account approved by an EIP-712 signature read with `SIGDATACOPY` was
  admitted by the alt mempool (`0x1d768184…86b6`). A wrong signer is refused.
- From the terminal, MetaMask (sem-the-bee.eth) signed, the account sent,
  and a sponsor funded by another address paid: mined in block 7495,
  `0xca674cec015344e7cfaca618304a0c14e9eb6500324e76ee5d59452964b71875`,
  receipt payer = the sponsor, 3 frames succeeded.
- No staking is needed: neither contract reads storage or uses a banned
  opcode. Gas actually used by the checks: account 15k, sponsor 10.5k.

## Goals

- `frames:new-account` and `frames:new-sponsor`: EVML commands that deploy the
  two contracts with ordinary transactions (signed by the wallet as usual)
  and bind the new addresses to variables.
- `frames:tx --account <account>`: the transaction's sender is that account;
  the connected wallet only signs, as typed data.
- `--paymaster <sponsor>` works with no `--paymaster-data`: the sponsor's
  call is filled in.
- The terminal sends such a transaction (MetaMask), and so does the CLI with
  `--wallet-rpc`/`--account` (an external wallet), through one shared
  handler. The CLI's local-key path for plain senders stays as it is.
- `switch 1337` in the terminal leaves MetaMask on a chain-1337 network whose
  RPC is the devnet gateway.
- The demo script below runs top to bottom in the terminal.

```evml
load frames [tx new-account new-sponsor]
switch 1337

new-account $account --owner @me
send $account --value 0.001e18
new-sponsor $sponsor --for $account --fund 0.05e18

tx --account $account --paymaster $sponsor --state-gas 200000 (
  send 0x8943545177806ED17B9F23F0a21ee5948eCaa776 --value 1e9 --gas 50000
)
```

## Non-goals

- Account recovery, key rotation, several owners, session keys, upgrades.
- A factory or counterfactual (CREATE2) addresses; `deploy` frames.
- Staking, reputation, sponsors that charge the account or check budgets.
- Gas estimation for these accounts (the sidecar's estimate drops
  signatures, so the account's check fails in it): limits are explicit, or
  sized with `--size-by-simulation`, which here means a second wallet
  signature (see Gas).
- Any chain but 1337; the Hegotá devnet; POST_TX.

## Anti-goals

- **The wallet must see what it authorizes.** The typed data it signs names
  the account, the chain and the transaction hash, and the terminal's review
  shows every frame, the payer and the typed data's shape before the run.
  The frames signed are the frames reviewed: the handler builds the
  transaction from the action as it was reviewed, adding only the nonce,
  the fees and the generated check calls.
- **The sponsor must not pay for strangers.** It approves payment only when
  the transaction's sender is the one account it was made for.
- **No private key in the browser** and none in a script.
- `@evmcrispr/core` and `@evmcrispr/sdk` do not depend on viem-frames or
  hegota-support (the frame `FrameAction` stays the only core-visible type).

## Contracts

Two Solidity contracts, sources in `modules/frames/contracts/`, compiled with
solc 0.8.28 and the optimizer against `@forshtat/hegota-support` 0.0.1's
`HegotaSupport(Devnet.ERC8421_WORKSHOP)`. The creation bytecode and ABI are
committed as generated TypeScript (the repo's assertions-bytecode precedent),
with a script that regenerates them and a test that the committed bytecode
matches a fresh compile. The spike's sources are the starting point:

- **FrameAccount(owner)**: immutable `owner` and EIP-712 `domainSeparator`
  (name "EVMcrispr Frame Account", version "1", chainId, verifyingContract =
  itself); `receive()`; `verify(uint8 scope)`: read `TXPARAM(SIG_HASH)`,
  read the 65-byte signature of entry 0 with `SIGDATACOPY`, require
  `ecrecover(digest) == owner` where `digest =
  keccak256(0x1901 ‖ domainSeparator ‖ keccak256(abi.encode(TYPEHASH,
  sigHash)))`, `TYPEHASH = keccak256("FrameTransaction(bytes32 sigHash)")`,
  then `APPROVE(scope)`. Calls from SENDER frames are made by the protocol
  as the account, so the account needs no `execute`.
- **FrameSponsor(owner, sponsored)**: immutable `owner` and `sponsored`;
  `receive()` for funding; `verify()`: require `TXPARAM(SENDER) ==
  sponsored`, then `APPROVE(PAYMENT)`; `withdraw(to, amount)` by `owner`.
  No `BALANCE`/`SELFBALANCE` (banned for an unstaked payer).

Deployment costs about 4.2M gas each (HegotaSupport's constructor deploys
nine opcode helpers); the commands pass an explicit gas limit (6M), since
the devnet's `eth_estimateGas` may be unavailable through the gateway.

## Language

| Written | Does |
|---|---|
| `frames:new-account <$var> --owner <address>` | deploys a FrameAccount owned by `<address>` (default `@me`), binds its address |
| `frames:new-sponsor <$var> --for <account> [--fund <wei>] [--owner <address>]` | deploys a FrameSponsor paying only for `<account>`, owned by `--owner` (default `@me`), sending `--fund` as creation value; binds its address |
| `frames:tx --account <account> ( … )` | the account is `tx.sender`; inside the block `@sender` is the account (as in `safe:propose`), `@me` stays the wallet |
| `--paymaster <sponsor>` without `--paymaster-data` | the pay frame calls the sponsor's `verify()` |

- With `--account`, the generated validation frame calls
  `verify(scope)` with the scope its flags allow (`both` when the account
  pays, `execution` with a paymaster), gas 40,000; the generated pay frame
  calls `verify()` with gas 50,000. Both fit the strict mempool's
  `MAX_VERIFY_GAS` (100,000) with the signature's intrinsic cost.
- A written `verify --account`'s own `verify` frames stay possible but are
  out of scope for the shortcut; the commands document the generated shape.
- The variable binding follows the existing command that binds a deployed
  address (builder: use the repo's convention for a `variable` argument,
  e.g. `contracts:deploy`'s capture or `sign <variable>`).

## Execution

- `FrameAction` gains `account?: { kind: "frame-account"; owner: Address }`
  (or an equivalent marker): present when the sender is a FrameAccount and
  the signature is typed data by `owner`. Core still refuses frame actions
  by default.
- **One handler in viem-frames**, used by both hosts: given the action, a
  wallet client (JSON-RPC account: MetaMask or `--wallet-rpc`) and the
  gateway, it builds the transaction (nonce of the account, fees, frames,
  one `ARBITRARY` signature entry with empty `msg`), computes the signature
  hash, asks `eth_signTypedData_v4` for the typed data above, fills the
  signature, optionally dry-runs on the node, submits with
  `eth_sendFrameTransaction`, checks the returned hash against its own, and
  waits for the receipt as the CLI handler does (120 s, then stop).
  viem-frames gains the `ARBITRARY` scheme in its serializer for this.
- **Terminal:** its `frame` handler (today `gated(pass)`, which refuses)
  uses that handler for `account` actions and still refuses the others. The
  action goes through the run's gate like any wallet-bound action.
  **Review (owner's decision: the existing review).** The run's action list
  (`runs/action-summary.ts` and the review's `ActionList`) describes an
  account frame action: "Frame transaction from account <account>", each
  frame (mode, scope, target, value, call, limits), the payer (the sponsor
  or the account), and the typed data that will be requested (domain name,
  version, chain, verifying contract = the account; type
  `FrameTransaction(bytes32 sigHash)`). The nonce, fees and the hash itself
  are fetched at send time and are not shown there; MetaMask's own prompt
  shows the account, the chain and the hash. Any new visual element goes
  into `packages/ui` and the gallery first (AGENTS.md).
- **CLI:** with `--wallet-rpc`/`--account`, the same handler; with the local
  key, a frame action carrying `account` is signed as typed data by the
  local key through the existing confirmation (the confirmation shows the
  typed data and the frames).

## Network switching (terminal)

`switch 1337` today switches MetaMask to any chain-1337 network it already
has, typically "Localhost 8545", whose RPC is not the devnet. The terminal
calls `wallet_addEthereumChain` for chain 1337 with the gateway RPC before
switching, so MetaMask offers to add the gateway to that network. Ordinary
transactions (the deployments, `send`) go through MetaMask's RPC, so this
matters for them; the frame handler itself talks to the gateway directly.
The chain is declared only in the terminal's network list (not as a module
chain: the 2026-11-06 security ruling against registering 1337 globally
stands).

Calls made while designing (builder check, 2026-11-07):

- **Gated on the experimental flag.** The terminal's chain-1337 entry and the
  `wallet_addEthereumChain` call exist only when `VITE_PUBLIC_EXPERIMENTAL`
  is on (next.evmcrispr.com and dev), like the frames module itself. Stable
  builds keep treating 1337 as viem's localhost.
- **MetaMask's network is checked, not assumed.** `wallet_addEthereumChain`
  for a chain id MetaMask already has was not verified to make the gateway
  the network's default RPC. After switching to 1337, the terminal compares
  the latest block hash MetaMask's RPC reports with the gateway's; if they
  differ, the run stops before any transaction with: point MetaMask's
  chain-1337 network at `https://altmempoolgateway.forshtat.com/rpc`.
- **Deployed addresses are checked.** `new-account` / `new-sponsor` bind the
  address from the deployment receipt (`contractAddress`), not from a
  predicted nonce, so a nonce mismatch can never bind the wrong address.

## Gas

- Body frames need `--gas` and `frames:tx --state-gas`, as today.
- `--size-by-simulation` for a FrameAccount sender means two wallet
  signatures: a provisional transaction (labelled provisional in the review)
  to dry-run, then the final one. Builder: implement it only if it falls out
  of the shared handler; otherwise refuse with the message saying to give
  limits. (Owner's call pending; see Open points.)

## Tests

- Contracts: compile-matches-committed test; an EVML-level unit test that
  `new-account`/`new-sponsor` produce the expected deployment actions.
- Layout: `--account` sets the sender and generates `verify(scope)`
  (both / execution) and the sponsor's `verify()`; existing rules unchanged.
- Shared handler: against a mocked sidecar and a mocked JSON-RPC wallet, the
  typed data asked for, the signature placed in an `ARBITRARY` entry, the
  hash check, the wire JSON.
- Terminal: the `frame` handler routes account actions to the shared
  handler and refuses others; the review shows the frames and typed data.
- Live, opt-in (`EVMCRISPR_FRAME_DEVNET=1`): the demo script through the CLI
  with `--wallet-rpc` pointed at a local signer (anvil `--fork`? no: a small
  JSON-RPC signer stub holding a throwaway key) or with the local key,
  asserting admission and the sponsor as payer once mined.

## Docs

The frame guide gains a "From a smart account" section: the two commands,
`--account`, the typed data MetaMask shows, the sponsor, the gas defaults,
and the MetaMask network note. Command `.md` files for the two commands.

## Where it runs (owner's decision)

On the experimental deployment (next.evmcrispr.com) and the dev terminal.
The frames module stays experimental; nothing is exposed on evmcrispr.com.

## Decisions taken in review

- The existing review describes account frame actions; no send-time
  confirmation in the terminal (owner).
- The demo runs on next.evmcrispr.com / dev (owner).
- Chain 1337 in the terminal only behind the experimental flag; MetaMask's
  network checked against the gateway; deployed addresses from receipts
  (builder's calls, above).
- `--size-by-simulation` with a smart-account sender: implemented only if it
  falls out of the shared handler, otherwise refused with a message to give
  limits (builder's call).

## Left to the builder

- Where the generated-bytecode module lives and the regeneration script.
- The exact `FrameAction` marker and how `frames:tx` learns the account is a
  FrameAccount (the `--account` option is enough; no on-chain check needed).
- Error wording within the repo's message conventions.
