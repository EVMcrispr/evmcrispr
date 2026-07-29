---
title: "assertions:assert-code"
---

Assert an address has deployed code, on-chain.

## Syntax

```evml
assertions:assert-code <target> [message]
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

assertions:assert-code 0x6B175474E89094C44Da98b954EedeAC495271d0F "not deployed"
```

## See Also
