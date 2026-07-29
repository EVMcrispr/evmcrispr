---
title: "assertions:assert-no-code"
---

Assert an address has no deployed code, on-chain.

## Syntax

```evml
assertions:assert-no-code <target> [message]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `target` | `address` | Address to check |
| `[message]` | `string` | Revert message when the assertion fails |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

assertions:assert-no-code @me "expected an EOA"
```

## See Also
