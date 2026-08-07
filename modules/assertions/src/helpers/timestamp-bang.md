---
title: "@assertions:timestamp!"
---

The block timestamp at assertion time (not at script build time).

**Returns**: `number`

## Syntax

```evml
@assertions:timestamp!
```

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $vesting 0x0102030405060708090a0b0c0d0e0f1011121314

# Seconds until unlock, computed at assertion time
assertions:assert @num!($vesting::{unlockTime()(uint256)} - @timestamp!) > 86400
```

## See Also

- [@assertions:blocknumber!](blocknumber-bang.md), [assertions:assert-timestamp](../commands/assert-timestamp.md)
