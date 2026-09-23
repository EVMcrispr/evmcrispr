---
title: "@safe:verify"
---

Verification report of a Safe transaction or Safe message as JSON: integrity-checked hashes, decoded calls, findings, owner signature checks, on-chain approvals, readiness and competing transactions, with the verdict safe:confirm and safe:execute would reach.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@safe:verify(safe target message:<value> abi:<value> no-rpc:<value>)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `safe` | `address` | Safe address |
| `target` | `number \| bytes32 \| string` | Nonce or safeTxHash of a queued transaction, a safeMessageHash with message:true, or Safe transaction or Safe message JSON |
| `message:` | `bool` | `message:true` — the hash is a safeMessageHash |
| `abi:` | `string` | `abi:<json>` — JSON mapping target addresses to explicit ABIs for local decoding |
| `no-rpc:` | `bool` | `no-rpc:true` — no network access at all (JSON only); owners, approvals, threshold and nonce stay unchecked |

<!-- HAND-WRITTEN -->

The report is a JSON string. A nonce or hash is fetched from the Safe
Transaction Service and rebuilt locally; it is refused unless it hashes back
to the requested hash, so a compromised service cannot change what you review.
Only trusted proposals (signed by an owner or delegate) are considered, and a
nonce shared by several queued transactions is an error listing their hashes.

Fields:

Each fact appears once:

- `kind`: `transaction` or `message`, and for a message its `content` (text
  or EIP-712 typed data)
- `typedData`: the EIP-712 typed data owners sign. Its `domain` names the
  Safe and chain, and its `message` holds the transaction's fields; pass it
  to `sign --typed` to sign with an external signer
- `hashes`: `domainHash`, `messageHash` and `safeTxHash` (or
  `safeMessageHash`) — compare them with your hardware wallet display
- `decodedCalls`: the call tree, decoded with `abi:`, the Safe's own
  management functions, SafeMigration and the MultiSend layout, with
  arguments by name. No explorer, selector-registry or ENS lookups: unknown
  calldata stays `unverified`, and only then is its `data` shown
- `findings`: each check that fired, its severity (`block` or `notice`), the
  `--allow-*` option that lifts it and the `values` (addresses or threshold)
  that option must name: delegatecalls to unknown contracts, owners added or
  removed, the new threshold, modules enabled, the transaction guard, module
  guard and fallback handler it sets, gas refunds and competing
  transactions; notices for SafeMigration upgrades, modules disabled, and
  nonce or signature problems. Owners, threshold, guards and the handler are
  compared with the Safe's current state (call by call with `no-rpc:true`)
- `verdict` (`pass` or `blocked`) and `requires`: what `safe:confirm`,
  `safe:confirm-onchain`, `safe:confirm-offline` and `safe:execute` would
  decide, and the options they would need, ready to paste (e.g.
  `--allow-new-owners 0x… --allow-change-threshold-to 3`)
- `signatures`: each signer's owner, type and status, plus on-chain
  confirmations. An owner Safe's signature still being collected is
  `incomplete` and shows its `progress` (e.g. `1 of 2`)
- `packedSignatures`, `chain`, `readiness` (`ready`,
  `insufficient-signatures`, `invalid-signatures`, `future-nonce`,
  `nonce-consumed`, or `unchecked` without RPC)
- `competing`: other safeTxHashes queued at the same nonce — only one can
  execute
- `skippedConfirmations`: service confirmations that are not EIP-712 owner
  signatures and were not counted

A `readiness` of `ready` means the nonce and signatures suffice; it does not guarantee
execution, funding, or acceptance by a guard. With `no-rpc:true` (JSON only)
nothing is read from the network: authorization and chain state stay
`unchecked`. Supplied ABIs describe encoding and do not prove a contract's
behavior. Only Safe >=1.3.0 is supported.

## Examples

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
print @safe:verify($mySafe 42)
```

```evml novalidate
load http
set $report @safe:verify($mySafe $tx no-rpc:true)
print @http:json($report hashes)
```
