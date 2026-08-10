---
title: "@vault:share"
---

Share token address of a vault. ERC-7575 vaults expose a separate share token; plain ERC-4626 vaults are their own share token, so the vault address itself is returned.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@vault:share(vault)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `vault` | `address` | Vault address (ERC-7575 or plain ERC-4626) |

## Examples

```evml
# Print the external share token of the Centrifuge JTRSY vault (ERC-7575)
load vault

switch mainnet
print "share:" @vault:share(0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A)

# Plain ERC-4626 vaults are their own share token, so the vault address is returned
print "share:" @vault:share(0xaf204776c7245bF4147c2612BF6e5972Ee483701)
```

<!-- HAND-WRITTEN -->

## Notes

ERC-7575 separates the vault (the per-asset entry point) from the share token, so several vaults can mint the same share. For those vaults this helper returns the external share token; for plain ERC-4626 vaults, which are their own share token, it returns the vault address itself. Use it wherever you need the token that actually holds the share balance.

## See Also

- [vault:request-redeem](../commands/request-redeem.md)
- [@vault:asset](./asset.md)

## On-chain face (@share!)

Read share() at assertion time, falling back to the vault address
itself through the core's orElse when share() is absent — plain
ERC-4626 vaults ARE their own share token, mirroring the plain face.

#
