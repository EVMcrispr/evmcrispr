---
title: "aragonosx:propose"
---

Wrap actions into a proposal on one of the DAO's governance plugins.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. This command opens a separate atomic execution context; nested atomic blocks are unsupported.

## Syntax

```evml
aragonosx:propose <plugin> <block>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `plugin` | `plugin` | Build time | Governance plugin creating the proposal |
| `block` | `block` | Build time | Actions to propose |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--metadata` | `string` | Build time | Proposal metadata (conventionally an IPFS URI) |
| `--start` | `number` | Build time | Start date (unix seconds); defaults to now |
| `--end` | `number` | Build time | End date (unix seconds); defaults to the minimum duration |
| `--vote` | `string` | Build time | Vote on creation (token-voting): yes, no or abstain |
| `--approve` | `bool` | Build time | Approve on creation (multisig) |
| `--try-execution` | `bool` | Build time | Execute in the same call if the proposal already passes |
| `--allow-failure-map` | `number` | Build time | Bitmap of actions allowed to fail (default none) |

## Examples

```evml
# Propose a treasury transfer through the token-voting plugin, voting yes on creation
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  aragonosx:propose token-voting --metadata "ipfs://QmMetadata" --vote yes (
    exec 0x6B175474E89094C44Da98b954EedeAC495271d0F transfer(address,uint256) 0xc125218F4Df091eE40624784caF7F47B9738086f 100e18
  )
)
```

<!-- HAND-WRITTEN -->

## See Also
