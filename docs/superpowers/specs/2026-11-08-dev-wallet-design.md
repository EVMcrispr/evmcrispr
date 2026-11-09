# A test wallet in the terminal, with clear signing

Status: design, awaiting approval (2026-11-08). Asked for by the owner on
2026-11-08, after `forshtat/hegota-demo` (live at
https://eip7906.forshtat.com/demo): "only the wallet functionality
(including the clear signing)". Replaces section 3 ("The dev wallet") and
the raw-hash request of `2026-11-08-frames-in-module-design.md`.

## Intent

People should be able to try every kind of transaction EVMcrispr builds,
frame transactions from a plain address included, from the terminal and
without a browser extension. And what they sign should be shown to them
the way a careful wallet shows it: decoded by the wallet from the bytes it
signs, not taken from the page that asks.

## What we take from the demo, and what we do not

Read from `forshtat/hegota-demo@master` (paths relative to it):

| Demo | Here |
|---|---|
| A wallet in the page (`frontend/src/devAutoWallet.ts`), offered next to MetaMask over EIP-6963 | **Taken**, as a wagmi connector in the wallet modal, not by replacing `window.ethereum` with an object that claims `isMetaMask` |
| Three random keys per browser, in `localStorage` | **Not taken** (owner, 2026-11-08): anvil's and hardhat's public accounts instead, on local chains only. Nothing secret is stored in the browser |
| Frame signing outside EIP-1193: page code calls `signAutoWalletDigest(digest)` ("there's no standard EIP-1193 method for this") | **Not taken**: a wallet request that carries the whole transaction, so the wallet can show what it signs |
| A signing panel built "directly from the real FrameTx object rather than a hand-authored description" (`frameSigning.ts:describeFrameTx`, `signingPreview.ts`, `components/hegotaWallet/deviceScreens.ts`): one screen per frame with its mode, a short gloss of what the mode means, the target, the decoded call and the value, then the signed digest with chain and sender | **Taken**: the principle and the per-frame layout |
| Hand-registered ABIs and per-function "curated rows" (`registerKnownInterface`, `registerCuratedRows`) | **Not taken**: decoding comes from verified ABIs and EVMcrispr's formatters, and later from ERC-7730 descriptors (see Decoding) |
| The hardware-wallet look, paced "steps", the relay key committed in `frontend/.env`, POST_TX "Safety check" screens and "Enforced State Change" | **Not taken**: a terminal needs none of it; ASSERT/POST_TX frames are out of scope (below) |

## Non-goals

- **ASSERT (POST_TX) frames, EIP-7906 state diffs, outcome constraints.**
  The devnets we use do not run them (owner, 2026-11-08). The architecture
  the demo links to (forshtat.com, "Architecture for Trustless Clear
  Signing on Ethereum") puts them on top of input clear signing; this spec
  is the input part only.
- Throwaway keys, keys held for the user, any key on a public chain.
- A hardware wallet, or a wallet outside the terminal's page.
- An ERC-8283 registry deployment or ERC-8176 attestations of our own.

## Design

### 1. Where it lives

- `packages/dev-wallet` (new): an EIP-1193 provider over local accounts,
  its request handling, and the **signing request model** (what is about to
  be signed, decoded). No React, no wagmi, no EVML: usable by any host.
  It depends on viem and `@evmcrispr/viem-frames` (to read frame
  transactions); it knows nothing of the frames module.
- `apps/evmcrispr-terminal`: a wagmi connector, **"Test wallet"**, added to
  `src/config/wagmi.ts`'s list only when the experimental flag is on and
  offered in `SelectWalletModal`; the signing panel that renders the
  request model; the account picker.
- `packages/ui` + gallery first, per the terminal UI rules: the signing
  panel is an `Overlay` (a dialog on desktop, a sheet on a phone), shown
  in the gallery in every state (each request kind, a decoded and an
  undecoded call, refused chain, rejected, signing) at desktop width and in
  the touch frame before it is used.

### 2. Accounts and chains

- Anvil's and hardhat's ten default accounts, derived in code from the
  well-known mnemonic (`test test … junk`, `m/44'/60'/0'/0/i`), never
  written out. The account is picked in the wallet's menu; changing it
  emits `accountsChanged`.
- **Local chains only.** The keys are public, so on a public chain anyone
  can use these accounts. The wallet serves a chain only when the
  terminal's RPC for it is a loopback address (`localhost`, `127.0.0.1`,
  `[::1]`), and refuses `wallet_switchEthereumChain` to any other, and every
  signing request on one, naming the chain. Chain ids cannot decide this:
  1337 is both viem's localhost and the public alt-mempool devnet.
- Ordinary transactions are signed locally and sent with
  `eth_sendRawTransaction` to the chain's RPC; reads go to that RPC.

### 3. Requests it answers

| Request | What the panel shows before signing |
|---|---|
| `eth_sendTransaction`, `eth_signTransaction` | chain, from, to (named), value (in the chain's currency), the decoded call, nonce, gas and fees, the most it can cost |
| `eth_signTypedData_v4` | the domain (name, version, chain, contract), the primary type, every field decoded by its type (addresses named, amounts of known tokens formatted) |
| `personal_sign` | the message as text when it is UTF-8, else hex |
| `wallet_signFrameTransaction` (ours, below) | the frame transaction, frame by frame |
| `eth_accounts`, `eth_requestAccounts`, `eth_chainId`, `wallet_switchEthereumChain` | nothing (no signature) |

`eth_sign` is refused: it signs a bare hash, which cannot be shown.

**Every signature asks first.** The panel shows the request; Approve signs,
Reject answers the standard user-rejection error (EIP-1193 code 4001).
The run's review stays what it is: the terminal reviews what the script
built, the wallet then shows what it is asked to sign, as with MetaMask.

### 4. Frame transactions: `wallet_signFrameTransaction`

A wallet that is only given a hash signs blind, so the request carries the
transaction:

```ts
wallet_signFrameTransaction([{
  transaction: Hex,   // the unsigned type-0x06 transaction, serialized
  profile: string,    // the hegota-support profile it is encoded under
  as:
    | { kind: "sender" }                       // a plain sender: secp256k1 over the sig hash
    | { kind: "typed-data"; typedData: … },    // a contract sender: EIP-712 by its owner
}]) → Hex
```

- The wallet decodes the transaction itself (viem-frames'
  `parseFrameTransaction` under the named profile) and computes the
  signature hash itself.
- `sender`: the transaction's sender must be the connected account; the
  wallet returns a canonical secp256k1 signature over the hash (recovery id
  0 or 1, low `s`).
- `typed-data`: the typed data must carry the transaction's signature
  hash as a `bytes32` field named `sigHash` (the FrameAccount's
  `FrameTransaction(bytes32 sigHash)`), else the wallet refuses: it would
  be signing a hash it cannot tie to the transaction shown. The typed data
  is shown with the frames.
- The panel, after the demo's layout: one entry per frame with its mode
  and a gloss of what the mode means ("approves the transaction for the
  sender", "a call made by the sender", "a call made by the entry point"),
  its approval scope and atomic flag, the target (named, "the sender" when
  empty), the value, the decoded call and the limits; then who pays, the
  nonce, the fees, the most it can cost, and the signature hash with the
  chain and the sender.
- The name is ours and not a standard: no wallet request for EIP-8141
  exists (viem's draft support keeps the type off wallet requests). The
  frames module asks it of any wallet, and a wallet that does not answer
  gets the error that names the test wallet or `--account`. For a frame
  account with a third-party wallet the module keeps asking plain
  `eth_signTypedData_v4`, as today.

This replaces the raw-hash request of `2026-11-08-frames-in-module-design.md`
section 2: the frames module's `send` asks `wallet_signFrameTransaction`
first and falls back to `eth_signTypedData_v4` for a frame account.

### 5. Decoding (the clear signing)

The panel decodes from the bytes, never from the page's description:

1. **Verified ABIs.** The target's ABI from a verified source, through the
   sdk's `fetchContractSource` (Etherscan when a key is set, Sourcify, then
   the EVMcrispr API), not from the script. On a local devnet nothing is
   verified, so:
2. **The contracts the wallet saw deployed** in this session (it signed
   their creation), matched by runtime code, and ABIs of well-known
   standards matched by selector (ERC-20, ERC-721, ERC-4626, ERC-2612,
   the FrameAccount and FrameSponsor), each labelled with where it came
   from ("verified on Sourcify", "matches ERC-20", "deployed in this
   session").
3. Otherwise the selector and the raw calldata, one 32-byte word per line,
   labelled "not decoded".

Values are formatted by what they are: addresses named (ENS where there is
one, the account's own label), token amounts with the token's decimals and
symbol, native value in the chain's currency (the sdk's
`tokenAmountFormatter` and `chainLabel`), never raw wei alone.

**ERC-7730 (step 2 of this spec, not v1):** descriptors that turn a call
into an intent ("Swap 100 USDC for at least 0.03 WETH"). Source: the
public descriptor repository (`LedgerHQ/clear-signing-erc7730-registry`),
pinned and verified like other fetched assets, and an ERC-8283 registry
when one is deployed on a chain we use (the reference implementation,
`forshtat/onchain-clear-signing-erc7730-registry`, is unaudited and
changing). A descriptor's rendering is shown above the decoded call, never
instead of it, labelled with its source.

### 6. Funding

The local devnets fund anvil's accounts (`frames-in-module` section 6:
`scripts/frame-devnet.ts`, our genesis copy for the chain-9 devnet,
`prefunded_accounts` for the Kurtosis one). A plain local anvil already
does.

## Tests

- **dev-wallet, unit**: the derived addresses equal a running anvil's
  `eth_accounts` (not a written list); each request kind produces the
  expected request model; a non-loopback RPC is refused for every signing
  request and for a switch; `eth_sign` refused; Reject answers 4001 and
  signs nothing.
- **Frame requests**: a signature for `sender` verifies against the hash
  the wallet computed, canonical form; `typed-data` without a matching
  `sigHash` is refused; a transaction under the wrong profile fails to
  decode and is refused.
- **Decoding**: verified-ABI decode against a mocked `fetchContractSource`; selector
  match labelled as such; undecoded calldata shown word by word; token and
  native formatting.
- **Terminal**: connector listed only with the experimental flag; the
  panel's gallery states; `ui-conventions.test.ts` covers the new
  components; `foreign-writers.test.ts` if the wallet's data reaches a
  space (it should not).
- **Live, opt-in**: against `frame-devnet up quick` and a local anvil, a
  run that deploys, sends an ordinary transaction and a plain-sender frame
  transaction through the test wallet, approved in the panel.

## Steps

1. `packages/dev-wallet`: accounts, the loopback rule, ordinary requests,
   the request model; tests.
2. The connector, the panel and the account picker in `packages/ui`, the
   gallery and the terminal.
3. `wallet_signFrameTransaction` in the wallet and in the frames module's
   `send` (needs module-owned actions, `frames-in-module` step 1, and the
   frame network table, step 3).
4. Decoding beyond selectors: verified ABIs, session deployments, token
   formatting.
5. ERC-7730 descriptors.

## Open questions for the owner

- **The name** "Test wallet" (or "Dev accounts", "Anvil accounts")?
- **Approval in the wallet**: every signature asks (proposed, as a real
  wallet does), or an "approve without asking" switch for long runs on a
  local chain?
- **`wallet_signFrameTransaction`**: worth proposing upstream (to the
  EIP-8141 discussion or viem) once it has run here, or kept ours?
