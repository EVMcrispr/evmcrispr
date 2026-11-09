# Test wallet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A "Test wallet" in the terminal (experimental, loopback-RPC chains only) over anvil's public accounts, which shows every request decoded from its bytes and signs only on Approve, including type-0x06 frame transactions through `eth_signTransaction`.

**Architecture:** `packages/dev-wallet` is an EIP-1193 provider (no React, no wagmi, no EVML) that turns each signing request into a **request model** and asks the host's `approve(model)`; decoding is built in for standards and takes an optional `abiFor` from the host. The terminal adds a wagmi connector, a store of the pending request, the signing panel (an `Overlay` composed from `@repo/ui`, shown in the gallery in every state first) and an account picker.

**Spec:** `docs/superpowers/specs/2026-11-08-dev-wallet-design.md` (steps 1-4; step 5, ERC-7730, stays later).

## Decisions (taken without asking; recorded in the spec)

- Name "Test wallet"; every signature asks (both the spec's proposals).
- `@evmcrispr/dev-wallet` is a private workspace package for now (only the terminal uses it).
- The terminal adds viem's `foundry` chain (31337, `http://127.0.0.1:8545`) to the experimental networks, so a plain local anvil is a chain the wallet serves.
- The FrameAccount/FrameSponsor ABIs reach the wallet from the terminal through `abiFor` (the package knows nothing of the frames module).

## Global Constraints

- Keys only from the well-known mnemonic (`test test … junk`, `m/44'/60'/0'/0/i`, i < 10), derived in code, never stored.
- A chain is served only when its RPC host is `localhost`, `127.0.0.1` or `[::1]`; any other: signing requests and `wallet_switchEthereumChain` refused, naming the chain.
- `eth_sign` refused. Reject → EIP-1193 error code 4001, nothing signed.
- Every string shown comes from the model; the panel never renders the page's description.
- Terminal UI rules (`AGENTS.md` Terminal UI): `@repo/ui` components, tokens, `Overlay`, gallery first, `ui-conventions.test.ts` passes.

## Review Focus

1. A request for a chain whose RPC is not loopback (1337 through the public gateway): refused before the panel opens.
2. An `eth_sendTransaction` with no `to` (deployment): shown as a deployment; the created address remembered and labelled "deployed in this session".
3. A frame request whose `from` is not the selected account: refused, not signed with another key.
4. Rejecting a request while another is pending: each answers its own caller.
5. Switching account while connected emits `accountsChanged`; the next request uses the new one.

---

### Task 1: the provider, accounts and ordinary requests

Files: `packages/dev-wallet/{package.json,tsconfig.json,src/{index,accounts,loopback,model,provider}.ts}`, `test/unit/provider.test.ts`, `test/integration/anvil.test.ts`.

- `testAccounts(): HDAccount[]`; `isLoopbackUrl(url): boolean`.
- `createTestWallet({ chains: TestWalletChain[], chainId?, approve(model): Promise<boolean>, abiFor? })` → `{ provider: EIP1193Provider, accounts, account(), selectAccount(i), chainId() }`. `TestWalletChain = { id, name, rpcUrl, nativeCurrency }`.
- Answers: `eth_accounts`/`eth_requestAccounts`, `eth_chainId`, `wallet_switchEthereumChain` (4902 unknown; refused non-loopback), `personal_sign`, `eth_signTypedData_v4`, `eth_sendTransaction` (filled through the RPC, signed, `eth_sendRawTransaction`), `eth_signTransaction` (ordinary), `eth_sign` refused; every other method forwarded to the chain's RPC.
- Tests: #0/#1 addresses; each kind gives its model (`kind: "transaction" | "typed-data" | "message"`); non-loopback refused for signing and switch; `eth_sign` refused; Reject → 4001 and nothing signed; accountsChanged. Integration (anvil runner): a transfer approved lands on anvil.

### Task 2: frame transactions and decoding

Files: `src/frames.ts`, `src/decode.ts`, tests `test/unit/{frames,decode}.test.ts`, live `test/devnet/frames.devnet.test.ts`.

- `eth_signTransaction` with `type: "0x6"`: `parseFrameTransactionRequest`, `from` must be the selected account, model `kind: "frame-transaction"` (per frame: mode, gloss, scope, atomic, target or "the sender", value, decoded call, limits; payer, nonce, fees, most it can cost, sigHash, chain, sender); signed `v||r||s` canonical over `sigHash`, returned encoded.
- `decodeCall({ chainId, to, data })` → `{ selector, functionName?, args?: { name, type, value, shown }[], source: "verified" | "standard" | "session" | "none", sourceLabel, words }`: `abiFor` first ("verified on …" as the host labels it), then the contracts deployed in this session (named), then ERC-20/721/4626 by selector ("matches ERC-20"), else words. ERC-20 amounts formatted with the token's decimals and symbol read from the chain.
- Tests: frame signature recovers to the sender and is canonical; another `from` refused; a request that does not parse refused; decode sources and labels; token formatting; undecoded words. Live (opt-in): the frames module sends a plain sender's transaction through the test wallet on the quick devnet.

### Task 3: the terminal

Files: `apps/evmcrispr-terminal/src/wallet/test-wallet/{connector.ts,store.ts,SigningPanel.tsx,AccountPicker.tsx}`, `config/rpc.ts` (foundry), `config/wagmi.ts`, `components/wallet/SelectWalletModal.tsx`, `components/layout/Header.tsx`, gallery section `sections/TestWallet.tsx`, tests in `test/app` and `test/wallet`.

- Connector listed only with the experimental flag; chains = the terminal's networks whose RPC is loopback.
- The panel: one `Overlay` per pending request; Approve / Reject; states in the gallery (each kind, decoded and undecoded call, a frame transaction, refused chain).
- Account picker in the header's wallet chip when the test wallet is connected (a `Menu`).
- Tests: connector absent without the flag; store resolves approve/reject; `ui-conventions` and `foreign-writers` pass.
