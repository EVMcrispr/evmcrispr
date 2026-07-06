---
title: "exec"
---

Call a contract function, encoding the arguments from its signature.

## Syntax

```evml
exec <contractAddress> <signature> [...params]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contractAddress` | `address` | Target contract address |
| `signature` | `write-abi` | Function signature (e.g. `"transfer(address,uint256)"`) |
| `[...params]` | `any` | Arguments matching the signature types |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--value` | `number` | ETH to send with the call (in wei) |
| `--from` | `address` | Sender address (requires simulation or connected wallet) |
| `--gas` | `number` | Gas limit |
| `--max-fee-per-gas` | `number` | Max fee per gas (EIP-1559) |
| `--max-priority-fee-per-gas` | `number` | Max priority fee per gas (EIP-1559) |
| `--nonce` | `number` | Transaction nonce override |

## Examples

```evml
# Approve a token
exec @token(DAI) "approve(address,uint256)" 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6 1200e18

# Send ETH with the call
exec 0xe91d153e0b41518a2ce8dd3d7944fa863463a97d "deposit()" --value 1e18

# Specify sender
exec @token(DAI) "approve(address,uint256)" 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6 1200e18 --from 0x44fA8E6f47987339850636F88629646662444217

# Capture events from the transaction
load sim
set $wxdai 0xe91d153e0b41518a2ce8dd3d7944fa863463a97d
sim:fork --using anvil (
  sim:set-balance @me 1e18
  exec $wxdai "deposit()" --value 0.001e18 -> Deposit(address indexed, uint) [_ $amount]
  exec $wxdai "withdraw(uint)" $amount
)

# Complex parameter types
exec 0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7 "addBatches(bytes32[],bytes)" [0x02732126661d25c59fd1cc2308ac883b422597fc3103f285f382c95d51cbe667] @bytes(QmTik4Zd7T5ALWv5tdMG8m2cLiHmqtTor5QmnCSGLUjLU2)
```

<!-- HAND-WRITTEN -->

## Error Captures

Error captures (`-!>` / `-?!>`) catch transaction reverts and decode the error data into variables. Three forms are available after the error name: nothing (assertion only), destructure (`[...]`), or a boolean variable (`$var`).

```evml
set $c 0x44fA8E6f47987339850636F88629646662444217

# Assert a specific error without capturing data
exec $c "deny()" -!> Unauthorized()

# Destructure error arguments into variables
exec $c "withdraw(uint256)" 200 -!> InsufficientBalance(uint256,uint256) [$balance $required]

# Catch a require/revert reason
exec $c "transfer(address,uint256)" @me 100e18 -!> Error(string) [$reason]

# Boolean variable: $e is "true" if the error matched
exec $c "deny()" -!> Unauthorized() $e

# Generic catch-all (no error name)
exec $c "doSomething()" -!> [$reason]
exec $c "doSomething()" -!> $e

# Optional: skip silently if tx succeeds
exec $c "maybeRevert()" -?!> Error(string) [$reason]
exec $c "maybeRevert()" -?!> Unauthorized() $e  # $e = "false" if tx succeeds or wrong error
```

- `-!>` expects the transaction to revert; throws if it succeeds
- `-?!>` captures the error if the tx reverts; silently continues if it succeeds
- With a boolean variable (`$e`), `-?!>` sets `$e = "false"` on success or mismatched error; `-!>` always sets `$e = "true"` (throws otherwise)
- Supported error types: custom named errors, `Error(string)` (require/revert), `Panic(uint256)` (assert), and empty reverts

## Notes

- The signature follows Solidity syntax: `"functionName(type1,type2)"`
- Parameters are automatically ABI-encoded based on the signature
- Use `--value` to send ETH with the call
- Use `--from` to impersonate a sender (requires simulation mode)
- Event captures (`->`) execute the transaction immediately and store decoded log values in variables
- Error captures (`-!>` / `-?!>`) catch and decode transaction reverts

## See Also

- [@get](../helpers/get.md) — read-only contract calls
- [batch](batch.md) — group multiple exec calls into one transaction
- [send](send.md) — send pre-encoded calldata or native value
