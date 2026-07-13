---
title: "aragonosx:propose"
---

Wrap actions into a proposal on one of the DAO's governance plugins.

## Syntax

```evml
aragonosx:propose <plugin> <block>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `plugin` | `plugin` | Governance plugin creating the proposal |
| `block` | `block` | Actions to propose |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--metadata` | `string` | Proposal metadata (conventionally an IPFS URI) |
| `--start` | `number` | Start date (unix seconds); defaults to now |
| `--end` | `number` | End date (unix seconds); defaults to the minimum duration |
| `--vote` | `string` | Vote on creation (token-voting): yes, no or abstain |
| `--approve` | `bool` | Approve on creation (multisig) |
| `--try-execution` | `bool` | Execute in the same call if the proposal already passes |
| `--allow-failure-map` | `number` | Bitmap of actions allowed to fail (default none) |

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
