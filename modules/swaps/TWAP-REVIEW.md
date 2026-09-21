# Experimental CoW TWAP integration: review handoff

This is an independent-review handoff, not an audit or a claim of production
safety. Upstream contract audits do not cover this integration.

## Trust boundaries and invariants

- `commands/twap.ts` resolves the effective controller and requires one limit
  mode. Live checks finish before funding actions are returned. Offline mode
  is explicit, is mandatory in simulation, and cannot bypass creation support.
- `twap/preflight.ts` treats HTTP as untrusted data. One-part ERC-1271 quote
  properties, validity, amounts, and fees are checked; prices use rational
  arithmetic. Quotes are observations, not liquidity reservations.
- `twap/account.ts` owns deterministic discovery, Safe configuration, nonce
  history, allowance clearance, and revalidation. Only the expected proxy and
  singleton with the sole controller, threshold one, canonical handler/domain,
  and no guards/modules are eligible. Unknown or incomplete history fails closed.
- Deployment/funding and Safe execution are ordinary actions. In the execution
  batch, funding pull, relayer approval, and registration revert together.
  Earlier deployment/controller-approval actions may have executed separately
  if a later transaction fails. The controller retains direct Safe authority.
- Portable references are untrusted: `twap/reference.ts` validates their shape,
  schedule, hash, and recognized deployment; management verifies deterministic
  account identity, controller authority, current compatibility, and history.
- `twap/evidence.ts` accepts API candidates only after receipt/header checks and
  exact deployed-contract `Trade` matching. UID does not contain parent salt, so
  verified registration and removal positions bound attribution. Elapsed time,
  account balance, indexer labels, and mutable fill counters cannot prove fills.
- `twap/status.ts` anchors reads and discards evidence when the anchor changes.
  Receipts are cached only during a request. Complete requires every distinct
  part. RPC history completeness and canonical/finalized headers remain trusted.
- `twap-recover` accepts early recovery only with complete on-chain settlement
  evidence; it removes authorization and zeroes the allowance before transfer.
  Reuse always requires compatible state, verified history, no live order, and
  cleared allowances regardless of API completion claims.

## Review focus

Review Safe batch encoding and prevalidated owner signatures, supported Safe
bytecode/storage assumptions, Safe event history completeness, allowlisted inner
calls and private authorizations, funding/fee token behavior, conditional-order
hash versus child UID identity, reorg and budget failure paths, cancellation
ordering, and early recovery. Exotic fee-on-transfer/rebasing/native tokens and
concurrent orders per execution Safe are outside the supported model.

Encoding checks cannot reserve state across independently prepared governance
proposals. Safe nonce checks constrain replay, but proposals need fresh simulation
before execution. Recovery reads a fixed transfer amount; later donations or
balance changes may require another recovery. Finality depends on RPC support.

## Reproduction and support evidence

Run swaps and Safe regression suites in separate Bun processes. TWAP settlement
tests impersonate an authorized solver only on a local Gnosis fork and execute
the canonical settlement contract: minimum rejection, replay rejection, all-part
settlement, cancellation invalidation, and fill-counter cleanup. Separate lifecycle
smokes deploy/register/cancel/recover/reuse on local forks of all five networks.
HTTP behavior is mocked in CI. These tests do not establish future solver execution.

`src/twap/support-evidence.json` records read-only service observations and pinned
upstream revisions. Refresh explicitly with:

```sh
bun modules/swaps/scripts/check-twap-services.ts
```

The checker only reads the programmatic-order and orderbook APIs. Its fulfilled
ERC-1271 samples demonstrate observed service operation, not receipt-verified
user fill evidence or an uptime guarantee. It does not change the creation
allowlist automatically. Keep recognized historical deployments when disabling
creation support so existing references can still be managed.
