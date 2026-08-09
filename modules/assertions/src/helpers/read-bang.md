---
title: "@assertions:read!"
---

Call a read-only function with live arguments at assertion time: the target and any argument may be a `::` call or an on-chain helper, compiled to the core `read` primitive.

**Returns**: `any`

## Syntax

```evml
@assertions:read!(target abi ...params)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `target` | `address` | Contract address, or a `::` call expression resolving to one |
| `abi` | `read-abi` | Signature with return types, e.g. `balanceOf(address)(uint256)` |
| `[...params]` | `any` | Function arguments: constants, `::` calls or on-chain helpers |

<!-- HAND-WRITTEN -->

Where std's `@get` calls the function at script *build* time and freezes the result, `@read!` constructs the call at *assertion* time on-chain: the core resolves the target and every live argument, concatenates the calldata segments and staticcalls the function when the batch executes. Reach for it when an argument (or the target itself) is only known on-chain — the same live-argument compilation the `::{...}` syntax uses for nested calls, exposed as a helper for any deployed view or pure function.

Any deployed view/pure contract extends the assertion vocabulary this way: deploy the function once, `@read!` it with composed operands.

## Examples

```evml
load assertions

set $vault 0x83F20F44975D03b1b09e64809B757c47f942BEeA

# Convert the vault's LIVE total supply to assets, on-chain
assertions:assert @read!($vault "convertToAssets(uint256)(uint256)" $vault::{totalSupply()(uint256)}) > 0

# The target itself is runtime-resolved: balanceOf on whatever token the vault reports
assertions:assert @read!($vault::{asset()(address)} "balanceOf(address)(uint256)" $vault) > 0

# Compose with arithmetic helpers as arguments
assertions:assert @read!($vault "previewRedeem(uint256)(uint256)" @num!($vault::{balanceOf(address)(uint256) @me} / 2)) >= 1e18
```

## Notes

- The signature must declare exactly one return type; it decides how the
  value is judged (`uint`/`int`/`address`/`bool`/`bytes32` as words,
  `string`/`bytes` via keccak of the decoded payload).
- Live word arguments fill single-word parameters (uint/int, address,
  bool, bytes32); a dynamic-typed live argument (array/string/bytes
  selected by a lens) must be the last argument of its call, at most one
  per call.
- With only constant arguments prefer the plain `::{...}` call syntax —
  the calldata is fixed at build time and needs no core hop.

## See Also

- [assertions:assert](../commands/assert.md)
