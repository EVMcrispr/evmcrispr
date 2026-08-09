# ens module

ENS domain operations: renewal and content hash encoding.

```evml
load ens
```

## Commands

| Command | Description |
|---------|-------------|
| [ens:create-subname](src/commands/create-subname.md) ⚗️ | Create a subname under an ENS name you own. |
| [ens:register](src/commands/register.md) | Register a .eth name via the controller's commit/reveal flow (commits, waits and reveals in one go by default). |
| [ens:renew](src/commands/renew.md) | Renew ENS domain registrations via bulk renewal. |
| [ens:set-addr](src/commands/set-addr.md) | Set the address record of an ENS name. |
| [ens:set-contenthash](src/commands/set-contenthash.md) | Set the content hash of an ENS name. |
| [ens:set-fuses](src/commands/set-fuses.md) ⚗️ | Burn NameWrapper fuses on a wrapped ENS name. |
| [ens:set-primary-name](src/commands/set-primary-name.md) | Set the primary ENS name (reverse record) of the calling account. |
| [ens:set-resolver](src/commands/set-resolver.md) | Set the resolver contract of an ENS name. |
| [ens:set-text](src/commands/set-text.md) | Set a text record on an ENS name. |
| [ens:transfer](src/commands/transfer.md) | Transfer ownership of an ENS name. For unwrapped .eth names this hands over both the registrant NFT and the Registry controller (reclaim); transferring to the current registrant just reclaims the controller role. |
| [ens:unwrap](src/commands/unwrap.md) ⚗️ | Unwrap an ENS name from the NameWrapper. |
| [ens:wrap](src/commands/wrap.md) ⚗️ | Wrap an ENS name in the NameWrapper. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@ens:addr](src/helpers/addr.md) | `address` | Resolve an ENS name to an address, optionally per coin type. As @addr! the resolution happens on-chain at assertion time: cond on an unset resolver returns the zero word, else the registry.resolver(node) -> addr(node) chain resolves the name (the namehash still computes at composition time). |
| [@ens:available](src/helpers/available.md) | `bool` | Check whether a .eth name is available for registration. |
| [@ens:avatar](src/helpers/avatar.md) | `string` | Get the avatar URI for an ENS name. |
| [@ens:cointype](src/helpers/cointype.md) | `number` | ENSIP-11 coin type of an EVM chain, for multichain address records. |
| [@ens:cointype.decode](src/helpers/cointype.decode.md) | `string` | Chain name of an ENSIP-11 coin type (the inverse of @ens:cointype). |
| [@ens:contenthash](src/helpers/contenthash.md) | `bytes` | Encode a content hash (ipfs, ipns, skynet) for ENS records. |
| [@ens:contenthash.of](src/helpers/contenthash.of.md) | `string` | Read the decoded content hash of an ENS name (e.g. ipfs://…). |
| [@ens:expiry](src/helpers/expiry.md) | `number` | Registration expiry timestamp of a .eth name. |
| [@ens:fuses](src/helpers/fuses.md) ⚗️ | `number` | Combine NameWrapper fuse names into their uint32 bitmap. |
| [@ens:fuses.decode](src/helpers/fuses.decode.md) ⚗️ | `array` | Decode a NameWrapper fuse bitmap into its fuse names. |
| [@ens:fuses.of](src/helpers/fuses.of.md) ⚗️ | `array` | Get the burned fuse names of a wrapped ENS name. |
| [@ens:labelhash](src/helpers/labelhash.md) | `bytes32` | Compute the ENS labelhash of a single label. |
| [@ens:name](src/helpers/name.md) | `string` | Reverse-resolve an address to its primary ENS name. |
| [@ens:namehash](src/helpers/namehash.md) | `bytes32` | Compute the ENS namehash of a domain name. |
| [@ens:normalize](src/helpers/normalize.md) | `string` | Normalize an ENS name per ENSIP-15. |
| [@ens:owner](src/helpers/owner.md) | `address` | Get the owner of an ENS name (the real owner when the name is wrapped). |
| [@ens:rentPrice](src/helpers/rentPrice.md) | `number` | Total price in wei to register or renew a .eth name for a duration. |
| [@ens:resolver](src/helpers/resolver.md) | `address` | Get the resolver contract address of an ENS name. |
| [@ens:text](src/helpers/text.md) | `string` | Read a text record from an ENS name. |

