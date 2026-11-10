import type { TestWallet } from "@evmcrispr/dev-wallet";
import { Button, Menu } from "@repo/ui";
import { Check } from "@repo/ui/icons";
import makeBlockie from "ethereum-blockies-base64";

const short = (address: string) =>
  `${address.slice(0, 6)}..${address.slice(-4)}`;

/** The test wallet's account, and the menu that changes it. */
export function AccountPicker({
  wallet,
  address,
}: {
  wallet: TestWallet;
  address: string;
}) {
  return (
    <Menu>
      <Menu.Trigger
        render={
          <Button
            variant="neutral"
            size="sm"
            aria-label="Test wallet account"
          />
        }
      >
        <img
          src={makeBlockie(address.toLowerCase())}
          alt=""
          className="size-4"
        />
        {short(address)}
      </Menu.Trigger>
      <Menu.Content align="end">
        {wallet.accounts.map((account, i) => (
          <Menu.Item
            key={account.address}
            onClick={() => wallet.selectAccount(i)}
            aria-checked={account.address === address}
          >
            {account.address === address ? (
              <Check aria-label="Selected" />
            ) : (
              <span aria-hidden className="size-4" />
            )}
            {`Anvil #${i} ${short(account.address)}`}
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu>
  );
}
