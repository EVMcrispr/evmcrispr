# `frames:post-verify`: POST_TX assertion frames on the Hegota devnet

Status: built, 2026-11-09 (plan docs/superpowers/plans/2026-11-09-post-verify.md).

## Intent

The Hegota devnet runs EIP-7906 (an early revision): a frame transaction can
end with POST_TX frames that check what the transaction actually did and, if
a check fails, cancel it. That is the point of the public hegota demo (six
attacks, each caught by a POST_TX check). EVMcrispr already writes frame
transactions for that chain (`frames:tx`, `hegotaDevnet`) and already has
on-chain assertions (`assert`). This adds the missing piece: checks that run
after everything else and cancel the whole transaction.

Owner's decisions, in their words where it matters:

- `assert` keeps its meaning everywhere ("check at this point":
  preconditions, mid-batch). In the body of `frames:tx` it stays what it is
  today: refused (an assertion is a read-only action, and `layoutFrames`
  refuses read-only actions, `modules/frames/src/layout.ts`). Making it a
  body frame is not part of this work (my call); the refusal's message
  points at `post-verify`.
- A new command, a verb: **`post-verify`** (`frames:post-verify`), with a
  block `( ... )`, written inside `frames:tx`. Its lines become the
  transaction's **last frames**.
- Inside the block, **only `assert` and `exec`**.
- **No sugar**: a check of the demo's kind is written as the demo writes it,
  `exec 0x643D… "assertExactBeneficiary(address)" $recipient`. No helper,
  no command per check.
- The demo's assertion contracts go in the docs as an address book (a table
  to copy from), not in code.
- **Deploy EVMcrispr's assertions contracts on the Hegota devnet**, so
  `assert` works there (inside `post-verify` and outside it).
- **`sim:fork` runs `post-verify` frames** (both in-process backends), which
  means modelling Hegota's trace opcodes.

## What a script looks like

```evml
load frames [tx post-verify]
switch hegotaDevnet

tx (
  exec $router "swapExactETHForTokens(uint256,address[],address,uint256)" 0 [$weth $usdc] @me 9999999999 --value 1e18 --gas 300000
  post-verify (
    # a state check, run by EVMcrispr's assertions contract
    assert @token(USDC)::!{balanceOf(address)(uint256) @me} >= 1900e6 "too little USDC"
    # the demo's checks, by address (see the guide's table)
    exec 0x643DfBbbA8a30f9b2e79c5b0B3589106E2fd8DbF "assertExactBeneficiary(address)" @me
    exec 0x42D1F899aBcdd79ADf8620e7b8008010093D9691 "assertNoImplementationChange()"
  )
)
```

## Goals

1. `frames:post-verify ( … )` inside `frames:tx`; each `assert` or `exec`
   line in it is one POST_TX frame, in order, after every other frame.
2. Sent on `hegotaDevnet` (the only frame network whose client runs
   POST_TX); refused by name, before anything is signed, on any network
   whose profile has no POST_TX mode.
3. `sim:fork` (ethereumjs and revm) runs POST_TX frames with TXTRACE and
   EVENTDATACOPY answered from the simulated transaction, and applies a
   failure the way Hegota does.
4. EVMcrispr's four assertions contracts (core, Operations, Collections,
   Expressions: `packages/sdk/src/onchain/addresses.ts`, at their usual
   addresses) deployed on the Hegota devnet (my call: all four, as every
   `assert` face may use any of them).
5. The frames guide documents `post-verify`, with a table of the demo's six
   assertion contracts on Hegota (name, address, function signature, what it
   checks), and the reference page of the command.
6. Live tests on Hegota: a passing and a failing check of each kind (an
   `assert`, a demo `exec`), the failing one showing what Hegota does.

## Non-goals

- Helpers, address-book code or commands per check (owner: no sugar).
- TXDIFF (0xb8) and the current EIP text's numbering (`ASSERT`, the nonce
  family): Hegota runs an earlier revision; a later devnet gets its own
  profile.
- POST_TX on any other network, local devnets included (their client does
  not run it).
- Writing assertion contracts of our own.

## Constraints and facts (verified 2026-11-09)

- **Profile:** `ethrexHegotaDevnetProfile` (viem-frames) has
  `frameModes.POST_TX = 3`. The tracer profile has no POST_TX: that is the
  test for "this network runs POST_TX".
- **Opcodes on Hegota:** TXTRACE `0xb6` (pops `param`, then `in2`; pushes
  one word), EVENTDATACOPY `0xb7` (pops `eventIndex`, `memOffset`,
  `dataOffset`, `length`). Only valid inside a POST_TX frame (elsewhere they
  halt). Byte values: hegota-support `yul/eip7906-workshop/`.
- **TXTRACE parameter numbering on Hegota** is the demo's (verified live by
  the demo; `contracts/shared/TxTraceLib.sol` of forshtat/hegota-demo), NOT
  the current EIP text's:
  `0x00` BALANCE_COUNT, `0x01` STORAGE_COUNT, `0x02` CONTRACT_COUNT,
  `0x03` BALANCE_ADDRESS, `0x04` BALANCE_BEFORE, `0x05` BALANCE_AFTER,
  `0x06` STORAGE_ADDRESS, `0x07` STORAGE_SLOT, `0x08` STORAGE_BEFORE,
  `0x09` STORAGE_AFTER, `0x0A` CONTRACT_ADDR, `0x0B` CONTRACT_HASH,
  `0x0C` EVENT_COUNT, `0x0D` EVENT_ADDRESS, `0x0E` EVENT_TOPIC_CNT,
  `0x0F`–`0x12` EVENT_TOPIC0–3, `0x13` EVENT_DATA_LEN.
  Where the demo's library is silent (ordering, net vs every write, halts on
  bad input, whether protocol logs such as EIP-7708 transfers are events),
  the builder follows the EIP text (net changes since the transaction's
  start, sorted by address then slot, events in emission order, halts on an
  out-of-range index or a missing topic) and checks each point against
  Hegota with a live probe; where Hegota differs, Hegota wins and the
  difference is written down.
- **What a failing POST_TX frame does on Hegota** is not settled: the EIP
  text says the body is reverted and the transaction stays in the block; the
  demo's contracts say it is excluded from the block. Measured live first
  (one transaction from anvil #0, which the owner agreed to send from), then
  the simulation and the receipts follow it.
- **Sending** (owner): a transaction with `post-verify` is sent as written.
  EVMcrispr does no check of its own before sending (no pre-flight run of
  the checks): a check guards against what happens between signing and
  inclusion, so passing before signing would prove nothing; `sim:fork` is
  there to preview it. If the chain drops the transaction (if Hegota
  excludes one whose check fails), the send reports why ("a post-verify
  check failed: the chain dropped the transaction"), naming the failing
  frame when it can tell, instead of waiting for a receipt; if Hegota keeps
  it in the block with the body reverted, the receipt is reported as
  failed, naming the failing check. How the drop is detected is the
  builder's (for example the node's simulation of the sent transaction once
  it leaves the mempool without a receipt); it must not wait forever. The
  live tests send failing transactions on purpose, from anvil #0 on Hegota
  (the owner agreed to sending test transactions from it).
- **POST_TX frames** are called by the entry point, as static calls, with no
  state gas; they may not carry the atomic flag, nor may the frame before
  them (EIP text; checked live). `post-verify` frames therefore get state
  gas 0 and no atomic flag, and `frames:tx` refuses a `batch` as the last
  thing before `post-verify` if Hegota refuses it.
- **An `assert` line** compiles as today (`compileAssertion`): a read-only
  call to EVMcrispr's assertions core. Inside `post-verify` (and only there)
  the layout accepts that read-only action, and the call is the POST_TX
  frame (a static call, which an assertion is).
- **Gas:** each line's `--gas`; without it, `frames:tx --gas`; there is no
  sizing at send time (as for every frame). The simulation reports the gas
  each POST_TX frame used, as it does for body frames.
- **Simulation gaps already known** (not this work): EIP-8037 state gas, and
  EIP-7708 transfer logs (our simulation emits none, so an event check on
  ETH transfers sees fewer events than Hegota; the guide says so).

## Measured on Hegota (2026-11-09, `test/devnet/hegota-post-tx-probe.devnet.test.ts`)

- **(a) A failing POST_TX frame:** the transaction is **mined**, not
  dropped: receipt `status` `0x0`, the body reverted (a 7 wei transfer did
  not land), per-frame statuses `[0x1, 0x1, 0x0]` (the reverted body frame
  still says `0x1`; the failing POST_TX frame `0x0`). Tx
  `0x0fa9d9e54354938c3b99f9bd9234ee53e94531dc226a18dd9ed5a1bcf2fe30b0`.
  The node's own simulation of it says `executionStatus: "reverted"`,
  `valid: true`. So a failing check is reported from the receipt; "dropped"
  stays only as the fallback for a transaction that leaves the mempool
  unmined.
- **(b) Atomic flag:** accepted on the frame before a POST_TX frame and on a
  POST_TX frame itself (both simulated `valid`, `success`). Nothing to
  refuse.
- **(c) TXTRACE:** the **index (`in2`) is the top stack operand, the
  parameter below it** (the reverse of the EIP text; the demo's oracle and
  hegota-support's helper agree). Parameter numbering is the demo's
  (`0x03` BALANCE_ADDRESS, `0x04` BALANCE_BEFORE, `0x0C` EVENT_COUNT).
  Balances: after one transfer, 2 entries (the recipient and the sender,
  sorted ascending by address; the coinbase is not one); after a
  rolled-back transfer, 1 (the sender, charged gas). Storage: net (a slot
  written twice is one entry, AFTER = the last value). Events: the EIP-7708
  transfer log of an ETH transfer counts (1 event). An out-of-range index
  halts the frame.
- **(d)** A POST_TX frame is called by the entry point `0x…aa` and is
  static (a write fails it).
- **EVENTDATACOPY** (measured after the final review): `eventIndex` on top,
  then `memOffset`, `dataOffset`, `length`, as the EIP text says (unlike
  TXTRACE). A probe copying the EIP-7708 log's data to memory 0x40 read the
  transferred value; the same probe with a wrong expected word failed.

## Decided by the builder (my calls, stated for review)

- `post-verify` is allowed once per `frames:tx`, as the last statement of
  its block; anything after it, or a second one, is refused at
  interpretation with a message saying where it goes.
- A line other than `assert` or `exec` inside `post-verify` is refused by
  name ("only assert and exec").
- The review (`describe`) shows POST_TX frames as their own steps, "post
  verify", after the body.
- The simulation answers TXTRACE from a record of the transaction kept by
  the frame simulator: every account's balance, every written slot and every
  account's code hash at the transaction's start (read through the backend
  before the first frame runs, and as frames touch new accounts), the
  current values at the POST_TX frame, and the frames' logs in order. The
  sim context (`ModuleActionSimCtx`) gains what that needs (the accounts,
  slots and code a call touched); both backends implement it.
- Deploying the assertions contracts uses the existing deployment route of
  those contracts (the one used for the EEZ devnet: the deterministic
  deployer and the mined salts), from anvil #0 on Hegota.

## Open for the builder

- The exact sim-context API for touched state, per backend.
- How POST_TX frames' receipts look in our simulated receipt (follow
  Hegota's, measured).
- Test layout, beyond goal 6.
