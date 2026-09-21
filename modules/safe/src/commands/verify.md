---
title: "safe:verify"
---

Verify Safe transaction hashes and flag dangerous fields, using the service queue or a command block or exported transaction JSON with --no-api.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
safe:verify <safe> <proposal>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `safe` | `address` | Safe address |
| `proposal` | `number \| bytes32 \| block \| string` | Nonce or hash of a queued transaction, or a command block or exported transaction JSON with --no-api |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--as` | `variable` | Bind the JSON verification report (requires --no-api) |
| `--offline` | `bool` | Inspect an exported package without any network access |
| `--abi` | `string` | JSON mapping target addresses to explicit ABIs for local decoding |
| `--no-api` | `bool` | Verify a command block or exported transaction JSON without contacting the Safe Transaction Service |
| `--nonce` | `number` | Nonce override for a command block (requires --no-api; defaults to the on-chain nonce) |
| `--nested-safe` | `address` | Owner Safe that will approve the transaction via approveHash; also prints the hashes its owners must sign |
| `--nested-safe-nonce` | `number` | Nonce override for the nested Safe approveHash transaction |

<!-- HAND-WRITTEN -->

The command fetches the queued transaction from the Safe Transaction Service,
recomputes the three EIP-712 hashes (domain hash, message hash and safeTxHash)
locally from the raw fields, and refuses to continue if the service-reported
safeTxHash does not match — so a compromised service cannot make you sign
different data. It also warns about dangerous parameters: delegatecalls to
contracts other than the canonical MultiSend, custom gas tokens, custom refund
receivers and non-zero gas prices.

Compare the printed hashes with the ones your hardware wallet displays before
signing. Only Safe >=1.3.0 is supported.

## Examples

Verify the transaction queued at nonce 42 before signing it:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:verify $mySafe 42
```

Verify a queued transaction by its safeTxHash:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:verify $mySafe 0x2c9c1f8f2a816f9ffe3ee902e08c02e01e9060e353fa892ee7d1cf27454935cb
```

When another Safe is an owner of `$mySafe`, print the `approveHash`
transaction hashes its owners have to sign as well:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
set $ownerSafe 0x1111111111111111111111111111111111111111
safe:verify $mySafe 42 --nested-safe $ownerSafe
```

## Without the Safe API

Use `--no-api true` with the portable JSON produced by `safe:propose`. Store
the complete JSON in a string variable `$tx`:

```evml novalidate
safe:verify $mySafe $tx --no-api true
```

The command validates the chain and Safe address and recomputes the hash from
the exact transaction fields. It rejects a mismatched `safeTxHash` and prints
the same hashes and warnings as service-backed verification. With RPC it also checks current owner signatures, contract signatures, on-chain
approvals, threshold, and nonce. Execution repeats these checks before sending.

You can also inspect a command block before signing it:

```evml novalidate
safe:verify $mySafe (
  safe:change-threshold 2
) --no-api true --nonce 42
```

Block verification defaults to the current on-chain nonce. `--nonce` only
applies to blocks; an imported transaction keeps its original nonce. Both
forms support `--nested-safe` and `--nested-safe-nonce`. RPC access is still
required, but no Safe API request is made. A nonce or hash alone cannot
identify the transaction fields without the service.

## Structured reports and offline inspection

```evml novalidate
load http
safe:verify $mySafe $tx --no-api true --as $review
print @http:json($review hashes)
print @http:json($review readiness)
```

The report contains `package`, `typedData`, `signingBytes`, `hashes`,
`decodedCalls`, `signatures`, `packedSignatures`, `chain`, `ready`, `readiness`,
and `warnings`. `ready` means the current nonce and signature requirements are
satisfied; it does not guarantee execution, funding, or acceptance by a guard.
A consumed nonce does not prove that this particular transaction executed.

Add `--offline true` with an imported package for **zero network access**.
Authorization and chain state then remain `unchecked`, and `ready` is false.
Offline inspection does not accept blocks or nested approval previews.

`--abi` accepts a JSON object mapping addresses to ABI arrays. Decoding uses
only supplied ABIs and the known MultiSend layout; there are no explorer,
selector-registry or ENS lookups. Unknown calldata is retained as `unverified`.
Supplied ABIs describe encoding and do not prove a contract's behavior.

## See Also

- [safe:propose](propose.md)
- [safe:execute](execute.md)
- [safe:verify-message](verify-message.md)
