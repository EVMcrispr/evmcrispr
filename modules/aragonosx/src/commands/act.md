---
title: "aragonosx:act"
---

Execute actions directly through the DAO (the caller needs EXECUTE_PERMISSION on it).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
aragonosx:act <block>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `block` | `block` | Actions to execute |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--call-id` | `string` | bytes32 identifier attached to the execution (default 0x0) |
| `--allow-failure-map` | `number` | Bitmap of actions allowed to fail (default none) |

## Examples

```evml
# Execute directly through the DAO when the caller holds EXECUTE_PERMISSION
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:act (
    aragonosx:grant ROOT on dao to 0xc125218F4Df091eE40624784caF7F47B9738086f
  )
)
```

<!-- HAND-WRITTEN -->

## See Also
