---
title: "raw"
---

Send a raw transaction with pre-encoded calldata.

## Syntax

```evml
raw <contractAddress> <data> [value]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `contractAddress` | `address` | Target contract address |
| `data` | `bytes` | ABI-encoded calldata |
| `[value]` | `number` | ETH to send (in wei) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--from` | `address` | Sender address (requires simulation) |
| `--gas` | `number` | Gas limit |
| `--max-fee-per-gas` | `number` | Max fee per gas (EIP-1559) |
| `--max-priority-fee-per-gas` | `number` | Max priority fee per gas (EIP-1559) |
| `--nonce` | `number` | Transaction nonce override |

## Examples

```evml
# Send pre-encoded calldata
set $data @abi.encodeCall("transfer(address,uint256)" 0x44fA8E6f47987339850636F88629646662444217 100e18)
raw @token(DAI) $data
```

<!-- HAND-WRITTEN -->

## See Also

- [exec](exec.md) — call a contract by signature (auto-encodes)
- [@abi.encodeCall](../helpers/abi.encodeCall.md) — encode calldata from a signature
