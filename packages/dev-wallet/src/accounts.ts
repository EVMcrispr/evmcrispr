import { type HDAccount, mnemonicToAccount } from "viem/accounts";

/**
 * The mnemonic anvil and hardhat derive their default accounts from. It is
 * public: anyone can use these accounts on any chain, which is why the test
 * wallet serves local chains only.
 */
const PUBLIC_TEST_MNEMONIC =
  "test test test test test test test test test test test junk";

/** Anvil's and hardhat's ten default accounts, `m/44'/60'/0'/0/i`. */
export function testAccounts(): HDAccount[] {
  return Array.from({ length: 10 }, (_, addressIndex) =>
    mnemonicToAccount(PUBLIC_TEST_MNEMONIC, { addressIndex }),
  );
}
