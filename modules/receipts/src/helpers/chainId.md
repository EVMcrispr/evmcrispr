---
title: "@receipts:chainId"
---

The chain id of the chain the script runs against.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:chainId
```

<!-- HAND-WRITTEN -->

## Examples

```evml
load receipts

assert @chainId! == 100 "wrong chain"
```

## See Also

- [assert](../../../std/src/commands/assert.md), [@receipts:block.timestamp!](block.timestamp.md), [@receipts:block.number!](block.number.md)

## On-chain face (@chainId!)

The chain the assertion is being judged on, read from the `CHAINID` opcode
through Operators. Takes no arguments.

Worth contrasting with the plain face: `@chainId` is the chain the SCRIPT was
composed against, which is a build-time fact. The two differ exactly when a
script is composed on one chain and judged on another, which is the case worth
asserting about.
