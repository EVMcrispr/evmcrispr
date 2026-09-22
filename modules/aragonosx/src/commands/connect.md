---
title: "aragonosx:connect"
---

Connect to an Aragon OSx DAO and execute commands within its context.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: build-time inputs only. DAO selection and ABI discovery happen at build time; the block expands into the surrounding execution context.

## Syntax

```evml
aragonosx:connect <dao> <block>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `dao` | `dao` | Build time | DAO address or ENS subdomain (e.g. `mydao` for mydao.dao.eth) |
| `block` | `block` | Build time | Commands to execute in DAO context |

## Examples

```evml
# Connect to a DAO and grant a permission through its token-voting plugin
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:propose token-voting --metadata "ipfs://QmMetadata" (
    aragonosx:grant EXECUTE on token-voting to 0xc125218F4Df091eE40624784caF7F47B9738086f
  )
)
```

<!-- HAND-WRITTEN -->

## See Also
