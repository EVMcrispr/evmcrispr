---
title: "@superfluid:netflow"
---

Net flow rate of an account (all incoming minus all outgoing streams, CFA plus GDA), in wei per second. Negative means the balance is draining.

**Returns**: `number`

## Syntax

```evml
@superfluid:netflow(token account)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `supertoken` | SuperToken symbol or address |
| `account` | `address` | Account to inspect |

## Examples

```evml
# Assert your xDAIx balance is not draining before ending the script
print "Net flow:" @superfluid:netflow(xDAIx @me)
```

<!-- HAND-WRITTEN -->

## See Also
