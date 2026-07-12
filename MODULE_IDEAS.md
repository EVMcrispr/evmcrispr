# Module ideas: what's missing for the common blockchain user

A survey of modules, commands, and helpers EVMcrispr could add. The current surface
(std, lang, sim, assertions, http, aragonos, safe, token, ens, giveth, access-control,
governor, proxies) covers *governance and admin* work very well, but the everyday
things a normal user does on-chain — swap, bridge, lend, stake, get paid — still
require hand-writing `exec` calls against protocol ABIs.

## What makes a good EVMcrispr module

The proposals below are filtered by these criteria:

1. **The user knows the intent, not the ABI.** "Swap 1 ETH for USDC" is easy to say
   and miserable to encode (router addresses, path encoding, deadlines, sqrtPriceLimits).
   The bigger the gap between intent and calldata, the more valuable the command.
2. **Standardized or few dominant implementations.** ERC-4626, CCTP, Aave v3, Uniswap —
   one adapter covers most real usage. Avoid protocols that need a new adapter per fork.
3. **Composes with what exists.** The killer feature is not the command in isolation —
   it's `swap` inside a `safe:propose` batch, `assert-balance` after a `bridge`,
   `sim:fork` to preview a whole DeFi position change atomically.
4. **Fits the `--using <adapter>` pattern** from the user's examples: the command
   expresses intent, the flag picks the venue, and a sensible default exists.

---

## Tier 1 — highest value, clearly feasible

### 1. `swaps` module ✅ (implemented 2026-07)

The single most common on-chain action, and today it's unwritable without knowing
router internals. Shipped with `swap`, `swap-to`, `wrap`, `unwrap`, `@swaps:quote`,
`@swaps:price`, auto-approval, and adapters for Delora (default), UniswapV4/V3/V2,
SushiSwap, Honeyswap, Balancer, and CoWSwap.

```evml
load swaps [swap]

swap @token.amount(ETH 1) @token(ETH) to @token(USDC) --min @token.amount(USDC 1700) --using UniswapV4
```

**Commands**

| Command | Purpose |
|---------|---------|
| `swap <amount> <tokenIn> to <tokenOut> [--min <out>] [--slippage <pct>] [--using <venue>] [--to <recipient>] [--deadline <ts>]` | Exact-in swap. Auto-inserts an `approve` action when allowance is insufficient (huge UX win — approvals are the #1 stumbling block). |
| `swap-to <amountOut> <tokenOut> from <tokenIn> [--max <in>]` | Exact-out variant ("I need exactly 5000 USDC"). |
| `wrap <amount>` / `unwrap <amount>` | ETH ⇄ WETH. Tiny, constantly needed, currently requires knowing WETH's ABI. |

**Helpers**

| Helper | Returns |
|--------|---------|
| `@swaps:quote(amountIn tokenIn tokenOut)` | Expected output in base units — feeds `--min`, `print`, and `assertions`. |
| `@swaps:price(tokenA tokenB)` | Spot price, for scripts that branch on market state with `if`. |

**Adapters (`--using`)**: `UniswapV4` (default), `UniswapV3`, `CurveV2`, `Balancer`,
`CoWSwap` (intent-based: builds an order + `sign` instead of a tx — pairs naturally
with the existing `sign` command), `1inch`/`0x` (aggregator APIs via the same
machinery the `http` module uses).

**Design notes**
- `--slippage 0.5` computes `--min` from the quote at build time; explicit `--min` wins.
- Quotes during `sim:fork` runs should come from the fork, not live APIs, so
  simulations stay deterministic.
- The venue registry should be pluggable the same way the Safe module resolves
  Zodiac mastercopies at runtime.

### 2. `bridges` module ✅ (implemented 2026-07)

Multichain is now the default user experience, and EVMcrispr already has `switch` —
bridging is the missing link that makes true cross-chain scripts possible.

Shipped with `bridge`, `claim`, `@bridges:fee`, `@bridges:status`, auto-approval, and
adapters for CCTPv2 (default for USDC), Across (default otherwise), NativeBridge
(OP Stack + Arbitrum, with real prove/finalize withdrawals), LayerZero OFT and CCIP.
`sim:fork` became multichain at the same time: `switch` inside a fork moves between
one fork per chain and bridge transfers **auto-relay** to the destination fork
(mocked Circle attestation, impersonated relayer fill, impersonated `lzReceive`), so
a whole cross-chain script is simulatable end to end without a `claim`.

```evml
load bridges [bridge]

bridge @token.amount(USDC 1) @token(USDC) optimism --using CCTPv2
```

**Commands**

| Command | Purpose |
|---------|---------|
| `bridge <amount> <token> <destChain> [--to <recipient>] [--using <adapter>]` | Initiate a bridge from the current chain. |
| `claim <transferId> [--using <adapter>]` | Finalize two-step bridges (CCTP attestations, native rollup withdrawals) on the destination chain. |

**Helpers**

| Helper | Returns |
|--------|---------|
| `@bridges:fee(amount token destChain)` | Cost estimate before committing. |
| `@bridges:status(transferId)` | Pending / attested / claimable / done — enables `loop until` polling scripts. |

**Adapters**: `CCTPv2` (default for USDC — canonical, no liquidity risk), `Across`,
`Hop`, `NativeBridge` (the chain's own standard bridge: OP Stack, Arbitrum, Polygon PoS).

**Design notes**
- The dream script this unlocks — and a great docs example:

  ```evml
  bridge @token.amount(USDC 500) @token(USDC) optimism --using CCTPv2
  switch optimism
  loop until @bridges:status($transferId) == claimable
    wait 30s
  claim $transferId
  ```
- `sim` needs a story for cross-chain simulation (two forks, or simulate only the
  source leg and mock the destination). Worth designing early since it also affects
  how `switch` behaves under `sim:fork`.

### 3. `lending` module

Second-most common DeFi action. Aave v3 alone covers most users; Compound v3 and
Morpho as follow-up adapters.

```evml
load lending [supply borrow]

supply @token.amount(WETH 10) @token(WETH) --using AaveV3
borrow @token.amount(USDC 5000) @token(USDC)
print "Health factor:" @lending:healthFactor(@me)
```

**Commands**: `supply`, `withdraw`, `borrow`, `repay` (with `max` sugar:
`repay max @token(USDC)` — repaying dust-exact debt by hand is notoriously fiddly),
`set-collateral <token> <on|off>`, `set-emode <categoryId>`.

**Helpers**: `@lending:healthFactor(account)`, `@lending:apy(token supply|borrow)`,
`@lending:maxBorrow(account token)`, `@lending:debt(account token)`.

**Composes with**: `assertions` (`assert @lending:healthFactor(@me) >= 1.5e18` after a
borrow — atomic safety rails no wallet UI offers), `safe` (DAO treasury management
proposals that supply/borrow in one reviewed batch).

### 4. `vault` module (ERC-4626)

A real standard — one implementation serves Yearn, Morpho vaults, sDAI, and
everything else 4626-shaped. Cheapest module on this list relative to its coverage.

```evml
load vault [deposit]

deposit @token.amount(DAI 1000) into $sDAI
print "Share price:" @vault:convertToAssets($sDAI @token.amount(sDAI 1))
```

**Commands**: `deposit <assets> into <vault>`, `mint <shares> of <vault>`,
`withdraw <assets> from <vault>`, `redeem <shares|max> of <vault>` — with the same
auto-approve behavior as `swaps`.

**Helpers**: `@vault:convertToAssets`, `@vault:convertToShares`, `@vault:maxWithdraw`,
`@vault:asset`, `@vault:totalAssets`.

### 5. Complete the `token` module ✅ (implemented 2026-07)

The current module (approve, mint, burn, burn-from, set-approval-for-all) is missing
the operations users actually perform daily:

| Addition | Why |
|----------|-----|
| `transfer <amount> <token> <to>` | The most basic action on a blockchain has no command. `exec $token transfer(address,uint256) ...` works but fails criterion 1. |
| `transfer-from <amount> <token> <from> <to>` | Completes the ERC-20 set. |
| `permit <amount> <token> <spender> [--deadline <ts>]` | EIP-2612 signature via the existing `sign` infrastructure; gasless approvals. A `Permit2` adapter extends it to every token. |
| `disperse <token> <recipients> <amounts>` | Batch payouts — salaries, grants, airdrops. Pairs beautifully with `http`'s `fetch`/`json` (pull a CSV, disperse it) and lang's `@map`/`@zip`. |
| `@token.allowance(token owner spender)` | `@token.balance` exists; allowance doesn't. Needed by scripts *and* by the auto-approve logic in swaps/lending/vault. |
| `@token.decimals` / `@token.symbol` / `@token.totalSupply` | Small read helpers that scripts currently do via `@get`. |

---

## Tier 2 — strong candidates

### 6. `streams` module (Sablier / Superfluid / LlamaPay)

Streaming payments are core DAO infrastructure — contributor salaries, vesting,
grants — which is exactly EVMcrispr's home turf (aragonos, safe, giveth users).

```evml
load streams [stream]

stream @token.amount(DAI 12000) @token(DAI) to $contributor over 365d --cliff 90d --using SablierV2
```

Commands: `stream`, `cancel-stream`, `withdraw-stream`. Helpers:
`@streams:withdrawable(streamId)`, `@streams:streamed(streamId)`.
The `over 365d --cliff 90d` duration syntax already has a precedent in `wait`.

### 7. `staking` module (liquid staking)

```evml
load staking [stake]

stake @token.amount(ETH 32) --using Lido
print "Rate:" @staking:rate(wstETH)
```

Commands: `stake`, `unstake` (request withdrawal), `claim`, `wrap`/`unwrap`
(stETH ⇄ wstETH). Helpers: `@staking:rate`, `@staking:apr`. Adapters: `Lido`,
`RocketPool`, `EtherFi`.

### 8. `oracle` helpers (possibly folded into std)

Price awareness unlocks conditional scripts and safer assertions everywhere:

| Helper | Source |
|--------|--------|
| `@price(ETH USD)` | Chainlink feed registry (default), Uniswap TWAP fallback |
| `@price.at(ETH USD <timestamp>)` | Historical rounds, for reporting scripts |

```evml
if @price(ETH USD) > 4000
  swap @token.amount(ETH 5) @token(ETH) to @token(USDC) --slippage 0.5
```

This is the piece that turns EVMcrispr scripts from "transaction batches" into
"strategies", and `assertions` + `@price` gives on-chain-verified price guards.

### 9. `nft` module

`set-approval-for-all` currently lives in `token`, but 721/1155 transfers still need
raw `exec`. Commands: `transfer <collection> <tokenId> <to>` (safeTransferFrom,
auto-detecting 721 vs 1155), `mint` where a standard mint function is detectable.
Helpers: `@nft:owner(collection tokenId)`, `@nft:uri`, `@nft:balance(collection owner [tokenId])`.
Marketplace integration (Seaport) is probably a Tier-3 adapter, not a v1 goal.

### 10. `merkle` module (airdrops & claims)

The other half of `disperse`: for large recipient sets, build a Merkle distribution
instead of N transfers.

Commands: `create-distribution <token> <recipients> <amounts>` (builds the tree,
uploads leaves via the existing `@ipfs` helper, deploys a standard distributor with
`deploy`), `claim <distributor> [--proof <proof>]` (auto-fetches the proof from IPFS).
Helpers: `@merkle:root(leaves)`, `@merkle:proof(leaves index)`, `@merkle:verify` —
useful beyond airdrops (allowlists, governance snapshots).

---

## Tier 3 — forward-looking

### 11. `attest` module (EAS)

Ethereum Attestation Service is becoming the standard identity/reputation primitive
(used by Optimism, Gitcoin, Coinbase Verifications). Commands: `attest <schema> <recipient> <data...>`,
`revoke <uid>`. Helpers: `@attest:get(uid)`, `@attest:isValid(uid)`. Natural fit for
DAOs recording contributor work on-chain.

### 12. `account` module (AA / EIP-7702)

As smart accounts become the default wallet, EVMcrispr scripts should be able to
target them: `upgrade-account --using <implementation>` (7702 delegation),
session keys (`add-session-key <key> --allow <selector...> --until <ts>`), and
sponsored execution (`--sponsor <paymaster>` as a global execution flag rather than a
command). Speculative, but 7702 sponsorship would let *any* EVMcrispr script run
gasless — a differentiator worth prototyping.

### 13. `snapshot` module (off-chain voting)

`governor` covers on-chain voting; most DAO voting is on Snapshot. Since Snapshot
votes are just EIP-712 signatures + an HTTP POST, this is thin glue over the existing
`sign` and `http` machinery: `snapshot:vote <space> <proposal> <choice>`,
`snapshot:propose ...`, `@snapshot:results(proposal)`.

### 14. `notify` command (std or http)

Long-running scripts (`loop until` + `wait`) have no way to tell a human something
happened. `notify "Bridge claimable" --via <webhook-url>` is sugar over `http:fetch`,
but the ergonomics matter for the monitoring/automation use case.

---

## Cross-cutting conventions to establish first

These decisions affect every module above, so they're worth settling before writing
the first adapter:

1. **`--using <adapter>` registry.** A shared mechanism for venue/protocol adapters:
   per-chain address books, a default per command, and a runtime fallback pattern like
   the Safe module's Zodiac mastercopy resolution. Third parties should be able to
   ship an adapter without forking the module.
2. **Auto-approval.** `swap`/`supply`/`deposit`/`stream` should check
   `@token.allowance` and prepend an exact-amount `approve` automatically (with a
   `--no-approve` escape hatch). This removes the single most common failure mode
   for non-expert users.
3. **Slippage/limit conventions.** One vocabulary across modules: `--min` / `--max`
   for absolute bounds, `--slippage <pct>` for quote-relative bounds, `--deadline <ts>`
   for time bounds.
4. **Amount-with-token sugar.** Every example above writes
   `@token.amount(USDC 100) @token(USDC)` — the symbol twice. Worth considering a
   combined literal (`100 USDC` or `@amt(USDC 100)` resolving to both) since these
   modules would multiply the repetition.
5. **Live-data helpers under `sim`.** Quotes, prices, and bridge fees must resolve
   against the fork during simulation, not live APIs, or `sim:expect` becomes flaky.

## Suggested order of attack

1. **Token module completion** (transfer, permit, disperse, allowance helpers) — small,
   unblocks conventions #2 and #4.
2. **`swaps`** with UniswapV4 + CoWSwap adapters — proves the `--using` registry.
3. **`vault`** — near-free after swaps (same approve/deposit shape, no routing).
4. **`bridges`** with CCTPv2 + NativeBridge — proves the cross-chain story with `switch`.
5. **`lending`** (Aave v3), then **`oracle`**, **`streams`**, and the rest by demand.
