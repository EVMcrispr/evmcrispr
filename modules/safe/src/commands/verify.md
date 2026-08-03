---
title: "safe:verify"
---

Recompute the EIP-712 domain, message and safeTxHash of a queued Safe transaction locally, check them against the Safe Transaction Service and flag dangerous fields, so signers can verify what their wallet displays.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
safe:verify <safe> <proposal>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `safe` | `address` | Safe address |
| `proposal` | `number \| bytes32` | Nonce or safeTxHash of the queued transaction |

## Options

| Name | Type | Description |
|------|------|-------------|
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

## See Also

- [safe:propose](propose.md)
- [safe:execute](execute.md)
- [safe:verify-message](verify-message.md)
