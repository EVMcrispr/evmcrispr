---
title: "@assertions:blocknumber!"
---

The block number at assertion time (not at script build time).

**Returns**: `number`

## Syntax

```evml
@assertions:blocknumber!
```

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $gov 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

assertions:assert @num!($gov::{voteEnd()(uint256)} - @blocknumber!) > 100
```

## See Also

- [@assertions:timestamp!](timestamp.md), [assertions:assert-block-number](../commands/assert-block-number.md)
