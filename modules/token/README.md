# token module

Token operations: mint, burn, and approvals.

```evml
load token
```

## Commands

| Command | Description |
|---------|-------------|
| [token:approve](src/commands/approve.md) | Approve a spender for an ERC20 token allowance. |
| [token:burn](src/commands/burn.md) | Burn tokens from the connected account (ERC20Burnable burn function). |
| [token:burn-from](src/commands/burn-from.md) | Burn tokens from another account, consuming the sender allowance (ERC20Burnable burnFrom function). |
| [token:disperse](src/commands/disperse.md) | Transfer a token to multiple recipients, encoding one transfer per recipient. |
| [token:mint](src/commands/mint.md) | Mint tokens to an account. Calls the mint(address,uint256) function commonly exposed by OpenZeppelin-based ERC20 tokens (usually role- or owner-gated). |
| [token:permit](src/commands/permit.md) | Approve a spender through an EIP-2612 permit signed by the connected wallet, encoded as a permit() call anyone can submit. |
| [token:set-approval-for-all](src/commands/set-approval-for-all.md) | Approve or revoke an operator for all ERC721 or ERC1155 tokens of the connected account. |
| [token:transfer](src/commands/transfer.md) | Transfer ERC20 tokens from the connected account to a recipient. |
| [token:transfer-from](src/commands/transfer-from.md) | Transfer ERC20 tokens from one account to another, consuming the sender allowance. |

