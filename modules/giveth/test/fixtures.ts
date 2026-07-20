/**
 * Giveth contracts on the pinned Gnosis fork (see scripts/anvil-config.ts)
 * and mocked-API constants used as fixtures for giveth tests.
 */

/** GIV token on Gnosis. */
export const GIV = "0x4f4F9b8D5B4d0Dc10506e5551B0513B61fD59e75";

/** gGIV: GIV wrapped through the GIVgarden, balance = raw staked GIV. */
export const GGIV = "0xfFBAbEb49be77E5254333d5fdfF72920B989425f";

/** GIVgarden HookedTokenManager (wrap/unwrap). */
export const GARDEN = "0x24F2d06446AF8D6E89fEbC205e7936a602a87b60";

/** GIVpower LM on Gnosis (lock/unlock/rounds/rewards). */
export const GIVPOWER_LM = "0xD93d3bDBa18ebcB3317a57119ea44ed2Cf41C2F2";

/** TokenDistro (GIVstream) on Gnosis. */
export const TOKEN_DISTRO = "0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1";

/** Giveth DonationHandler on Gnosis. */
export const DONATION_HANDLER = "0x97b2cb568e0880B99Cd16EFc6edFF5272Aa02676";

/** Giveth DonationHandler on Optimism (unipool-flavor encode checks). */
export const DONATION_HANDLER_OPTIMISM =
  "0x8D685A56C51Cf54685d3dB0Ea50748D3A2c2e0dC";

/** GIVpower LM (UnipoolGIVpower) on Optimism. */
export const GIVPOWER_LM_OPTIMISM =
  "0x301C739CF6bfb6B47A74878BdEB13f92F13Ae5E7";

/** GIV token on Optimism. */
export const GIV_OPTIMISM = "0x528CDc92eAB044E1E39FE43B9514bfdAB4412B98";

/** Mocked "evmcrispr" project: recipient on chains 1/10/100/137. */
export const PROJECT_RECIPIENT = "0xeafFF6dB1965886348657E79195EB6f1A84657eB";

/** Mocked "evmcrispr" project: recipient on chains 42161/8453/1101/42220. */
export const PROJECT_RECIPIENT_L2 =
  "0x0035cC37599241D007D0AbA1Fb931C5FA757f7A1";

/** Mocked "evmcrispr" project anchors (recurring donations). */
export const PROJECT_ANCHOR_OPTIMISM =
  "0x98e0b1e46025b1b29bd5582d86f7e3efd1b5af7e";
export const PROJECT_ANCHOR_BASE = "0x31f1589e650cc2c7944f5f94e17141368755deba";

/** Mocked anchor on Gnosis so recurring flows run on the pinned fork
 *  (streams accept any receiver; real anchors exist on Optimism/Base only). */
export const PROJECT_ANCHOR_GNOSIS =
  "0x5ac1e266b5f2f4a11c96ee076c414421c15ff9c1";

/** Mocked Giveth tip project ("the-giveth-community-of-makers") recipient. */
export const TIP_RECIPIENT = "0x4D9339dd97db55e3B9bCBE65dE39fF9c04d1C2cd";

/** Mocked tip project anchor on Gnosis (recurring --tip stream). */
export const TIP_ANCHOR_GNOSIS = "0x7e9c0ff6dc79b34a731b21a582b1f4c1af3a5f6d";

/** WXDAI: an ERC-20 with healthy balances on the pinned Gnosis fork. */
export const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

/** xDAIx — the native-asset SuperToken on Gnosis (payable upgradeByETH). */
export const XDAIX = "0x59988e47A3503AaFaA0368b9deF095c818Fdca01";

/** USDCx on Gnosis — wrapper SuperToken over 6-decimal USDC. */
export const USDCX = "0x1234756ccf0660E866305289267211823Ae86eEc";

/** USDC on Gnosis — USDCx's 6-decimal underlying. */
export const USDC = "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83";

/** Arbitrary address (no contract) used as a recipient in tests. */
export const SOME_ADDRESS = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
