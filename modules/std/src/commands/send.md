---
title: "send"
---

Send a low-level transaction. Provide [to] for a call/transfer, --data for raw calldata, --value for native value, or any combination.

## Syntax

```evml
send [to]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[to]` | `address` | Target address. Omit for a CREATE-style deployment (use the `deploy` command for address binding). |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--data` | `bytes` | Pre-encoded calldata or init code |
| `--value` | `number` | Native value to send (in wei) |
| `--from` | `address` | Sender address (requires simulation or connected wallet) |
| `--gas` | `number` | Gas limit |
| `--max-fee-per-gas` | `number` | Max fee per gas (EIP-1559) |
| `--max-priority-fee-per-gas` | `number` | Max priority fee per gas (EIP-1559) |
| `--nonce` | `number` | Transaction nonce override |

## Examples

```evml
# Send pre-encoded calldata
set $data @abi.encodeCall("transfer(address,uint256)" 0x44fA8E6f47987339850636F88629646662444217 100e18)
send @token(DAI) --data $data

# Native value transfer
send 0x44fA8E6f47987339850636F88629646662444217 --value 1e18
```

<!-- HAND-WRITTEN -->

## Error Captures

Like `exec`, `send` supports error captures (`-!>` / `-?!>`):

```evml
set $contract 0x44fA8E6f47987339850636F88629646662444217
set $calldata 0xa3fdfee3

# Assert the call reverts with a specific error
send $contract --data 0xa3fdfee3 -!> Unauthorized()

# Capture the revert reason
send $contract --data $calldata -!> Error(string) [$reason]

# Boolean variable
send $contract --data $calldata -?!> Unauthorized() $e
```

## Notes

- Either `<to>` or `--data` must be provided. Sending without either is a
  no-op and is rejected.
- Omitting `<to>` while supplying `--data` produces a CREATE-style
  deployment transaction. For deployments where you also want the predicted
  contract address bound to a variable, use the [deploy](../../../contracts/src/commands/deploy.md) command
  instead.

## See Also

- [exec](exec.md) — call a contract by signature (auto-encodes)
- [deploy](../../../contracts/src/commands/deploy.md) — deploy a contract from raw creation bytecode
- [@abi.encodeCall](../helpers/abi.encodeCall.md) — encode calldata from a signature
