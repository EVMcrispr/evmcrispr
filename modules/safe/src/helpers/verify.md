---
title: "@safe:verify"
---

Verification report of a Safe transaction or Safe message as JSON: integrity-checked hashes, decoded calls, warnings, owner signature checks, on-chain approvals, readiness and competing transactions.

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

- `safeTransaction` or `safeMessage`: the normalized item, with its signatures
- `typedData`: the EIP-712 typed data owners sign
- `signingBytes`: the exact bytes an owner Safe signs as a nested owner
- `hashes`: domain, message and final hashes — compare them with your
  hardware wallet display
- `decodedCalls`: calldata decoded with `abi:` and the MultiSend layout; no
  explorer, selector-registry or ENS lookups, unknown calldata stays
  `unverified`
- `warnings`: delegatecalls to anything but MultiSend, custom gas tokens or
  refund receivers, non-zero gas prices
- `signatures`: each signer's owner, type and status, plus on-chain
  confirmations. An owner Safe's signature still being collected is
  `incomplete` and shows its `progress` (e.g. `1 of 2`)
- `packedSignatures`, `chain`, `ready`, `readiness` (`ready`,
  `insufficient-signatures`, `invalid-signatures`, `future-nonce`,
  `nonce-consumed`)
- `competing`: other safeTxHashes queued at the same nonce — only one can
  execute
- `skippedConfirmations`: service confirmations that are not EIP-712 owner
  signatures and were not counted

`ready` means the nonce and signatures suffice; it does not guarantee
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
