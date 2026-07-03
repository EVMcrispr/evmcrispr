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
| [token:mint](src/commands/mint.md) | Mint tokens to an account. Calls the mint(address,uint256) function commonly exposed by OpenZeppelin-based ERC20 tokens (usually role- or owner-gated). |
| [token:set-approval-for-all](src/commands/set-approval-for-all.md) | Approve or revoke an operator for all ERC721 or ERC1155 tokens of the connected account. |

