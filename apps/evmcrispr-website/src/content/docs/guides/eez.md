---
title: Cross-Chain Calls with EEZ
experimental: true
---

An EEZ L2 and its L1 share one sequencer, so a call can cross between
them inside a single transaction: the far side executes atomically with the
sending side, and its return value or revert comes back in the same
transaction. The `eez` module ships the two devnet chains, `eezL1` and
`eezL2`, so `switch` reaches them by name, plus a faucet for gas.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load eez

switch eezL1
eez:faucet @me
```

## Cross-chain proxies

Every contract has a deterministic *cross-chain proxy* on the other chain:
a contract whose address is computed from the original's address and the
chain it lives on, and that stands in for it there. Calling the proxy with
ordinary calldata runs the call on the other side. `@eez:proxy` resolves a
proxy before it exists, `eez:deploy-proxy` creates it, and `@eez:target` is
the reverse lookup.

```evml
load eez

set $registry 0x000000000000000000000000000000000000dEaD   # some contract on L1

switch eezL2
# Its proxy on L2: deterministic, so usable before it exists —
# as a constructor argument, for instance.
print "proxy on L2:" @eez:proxy(eezL1 $registry)
eez:deploy-proxy $registry
print "stands in for:" @eez:target(eezL2 @eez:proxy(eezL1 $registry))
```

## Calling across from a contract

A contract on one chain calls a contract on the other by calling its proxy.
Below, an L1 `Minter` hands out badges on L2: the `Badge` only
accepts calls from the minter's proxy, which it takes as a constructor
argument before that proxy exists.

```evml
load eez
load contracts

# ── L1: the minter ────────────────────────────────────────────────
switch eezL1
set $minterSrc <<<SOL
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
interface IBadge { function mint(address to) external; }
contract Minter {
  /// `badge` is the L1 proxy of the L2 Badge: this call runs on L2,
  /// atomically, inside this same transaction.
  function mintBadge(IBadge badge) external { badge.mint(msg.sender); }
}
SOL
contracts:deploy $minter @contracts:solidity($minterSrc)

# ── L2: a badge only the minter's proxy may mint ──────────────────
switch eezL2
set $badgeSrc <<<SOL
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
contract Badge {
  address public immutable minter;               // the Minter's proxy here
  mapping(address => uint256) public balanceOf;
  constructor(address m) { minter = m; }
  function mint(address to) external { require(msg.sender == minter, "only minter"); balanceOf[to] += 1; }
}
SOL
contracts:deploy $badge @contracts:solidity($badgeSrc) --constructor "constructor(address)" --constructor-args [@eez:proxy(eezL1 $minter)]
eez:deploy-proxy $minter                      # create the proxy the callback resolves to

# ── L1 → L2, in one transaction ───────────────────────────────
switch eezL1
eez:deploy-proxy $badge                       # the Badge's proxy on L1
exec $minter mintBadge(address) @eez:proxy(eezL2 $badge)
```

Two proxies are involved: the badge's proxy on L1, which the minter calls,
and the minter's proxy on L2, which the badge sees as `msg.sender`. Both
must exist before the call. The transaction that touches a proxy is an
ordinary L1 transaction; the EEZ RPC hands it to the cross-chain ingress,
and a receipt on L1 means the L2 effect was applied.

## Calling across from the wallet

Without a contract of your own, `eez:on` runs a block of commands on the
other chain. Every call the block produces goes out through its target's
proxy on the current chain; missing proxies are created first.

```evml
load eez

set $counter 0x000000000000000000000000000000000000bEEF   # a contract on L2

switch eezL1
eez:on eezL2 (
  exec $counter setValue(uint256) 42
)
```

Inside the block the script *is* on the target chain: `exec` encodes
against contracts there, helpers such as `@balance` and `::` reads resolve
there, and so do the conditions of `if` and `loop`.

L2 does not see your wallet as the sender, it sees your proxy there.
`@sender` inside the block is that proxy; `@me` stays the wallet:

```evml
load eez

set $vault 0x000000000000000000000000000000000000bEEF   # a contract on L2

switch eezL1
eez:on eezL2 (
  # msg.sender on L2 is @sender, the wallet's proxy there
  exec $vault setOwner(address) @sender
)
# The same proxy, computed on L2, from L1
print "my proxy on L2:" @eez:on(eezL2 @eez:proxy(eezL1 @me))
```

Gas is estimated by simulating the remote leg; pass `--gas` (or `--value`)
on the inner command when needed.

Blocks nest. A block inside a block comes back to the chain it started
from, still inside the same transaction, through a proxy of a proxy: L1
calls your L2 proxy, which calls the L1 proxy of the L1 contract. That is
how you act on L1 *as an L2 account*, for a contract on L1 that only listens
to L2 proxies, for instance. `@sender` in the inner block is the L1 proxy of
your L2 proxy.

```evml
load eez

set $counter 0x000000000000000000000000000000000000bEEF   # on L2
set $treasury 0x000000000000000000000000000000000000dEaD  # on L1, open to L2 proxies only

switch eezL1
eez:on eezL2 (
  exec $counter increment()
  eez:on eezL1 (
    # L1 → L2 → L1: back home, but as the L1 proxy of your L2 proxy
    exec $treasury claim(address) @sender
  )
)
```

Every hop adds its own overhead to the gas estimate, and deeper nesting
works the same way (`eezL1` → `eezL2` → `eezL1` → `eezL2`, and so on).

`switch` and contract deployments are not allowed inside the block: a proxy
only forwards calls.

## Reading the other chain

`@eez:on` evaluates an expression as if the script were on the other chain
and returns the value, without a transaction:

```evml
load eez

switch eezL1
print "balance on L2:" @eez:on(eezL2 @balance(ETH @me))
```

Inside an `assert`, the on-chain helpers `@eez:on!`, `@eez:proxy!` and
`@eez:target!` do the same at execution time, so an assertion on L1 can check
L2 state synchronously. The assertion becomes a transaction (only a
transaction reaches the sequencer's composer), it crosses one chain boundary,
and the proxy of the Assertions core on the other chain must exist first.

On its own such an assertion proves little: it earns its keep guarding a
write in the same transaction. A browser wallet only batches on the chains
it lists, and a devnet is not one of them, so `batch` is refused there. A
Safe batches anywhere: `safe:execute` sends one ordinary transaction to the
Safe, which runs the block atomically, cross-chain calls and assertions
included. Like any on-chain helper, `@eez:on!` is welcome there: the read
happens when the Safe executes, not when the transaction is built. The
devnet has no canonical Safe contracts; the `safe` module carries its own
deployment of them, at the same addresses on both chains.

That makes the Safe a fitting whale. Fund it on L2, then let it earn a
badge from the [minter above](#calling-across-from-a-contract), on the
condition that it holds 100 ETH or more there. The assertion reads L2 and
the mint writes L2, both from L1, inside the Safe's one transaction: no
balance, no badge.

```evml
load eez
load safe

set $minter 0x000000000000000000000000000000000000dEaD   # the Minter on L1
set $badge 0x000000000000000000000000000000000000bEEF    # the Badge on L2

switch eezL1
safe:new @me -> ProxyCreation(address indexed, address) [$safe _]

switch eezL2
eez:faucet $safe --amount 100e18              # the Safe's stash on L2

switch eezL1
safe:execute $safe (
  assert @eez:on!(eezL2 @balance!(ETH $safe)) >= 100e18 "not a whale on L2"
  exec $minter mintBadge(address) @eez:proxy(eezL2 $badge)
)
print "badges:" @eez:on(eezL2 $badge::{balanceOf(address)(uint256) $safe})
```

The minter mints to `msg.sender`, and that is the Safe, so the badge lands
on the Safe's address on L2. Both proxies from the minter section must
exist. `safe:new` is deterministic: a second run with the same owner needs
a `--salt`.

## Simulation

Proxy resolution and `@eez:on` reads work inside `sim:fork`, since they are
reads. A cross-chain transaction does not: a fork has no composer, so the
call to a proxy reverts there. Test the cross-chain leg on the devnet.

## Combining with circom

The minter above trusts anyone. Replace it with a gate that admits only
whoever proves knowledge of a secret, as built in the
[circom guide](/guides/circom/), and the badge on L2 becomes a badge
for proven members, minted in the same transaction as the proof:

```solidity
/// Admits whoever proves membership; can hand out badges on L2.
contract Gate {
  // ... verifier, commitment and admit() as in the circom guide ...
  function mintBadge(IBadge badge) external {
    require(admitted[msg.sender], "not admitted");
    badge.mint(msg.sender);   // `badge` is the L1 proxy of the L2 Badge
  }
}
```

```evml novalidate
# L1: prove and admit
exec $gate "admit(uint256[2],uint256[2][2],uint256[2],uint256[1])" $a $b $c $signals
# L2: the Badge is pinned to the Gate's proxy there
contracts:deploy $badge @contracts:solidity($badgeSrc) --constructor "constructor(address)" --constructor-args [@eez:proxy(eezL1 $gate)]
# L1 → L2: mint, atomically with this transaction
exec $gate mintBadge(address) @eez:proxy(eezL2 $badge)
```

The full composition, with every contract compiled, deployed and verified
inline, runs against the devnet as the eez module's end-to-end test
(`modules/eez/test/integration/demo.test.ts`).
