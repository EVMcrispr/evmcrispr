---
title: "@assertions:chainid"
---

The chain id. Unlike assert-chainid it composes into expressions.

**Returns**: `number`

## Syntax

```evml
@assertions:chainid
```

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

assertions:assert @chainid! == 100 "wrong chain"
```

## See Also

- [assertions:assert-chainid](../commands/assert-chainid.md), [@receipts:block.timestamp!](../../../receipts/src/helpers/block.timestamp.md), [@receipts:block.number!](../../../receipts/src/helpers/block.number.md)

## On-chain face (@chainid!)

The chain the assertion is being judged on, read from the `CHAINID` opcode
through Operators. Takes no arguments.

Worth contrasting with the plain face: `@chainid` is the chain the SCRIPT was
composed against, which is a build-time fact. The two differ exactly when a
script is composed on one chain and judged on another, which is the case worth
asserting about.
