import {
  defineCommand,
  ErrorException,
  encodeAction,
  encodeSignatureCall,
} from "@evmcrispr/sdk";
import type { Hex } from "viem";
import type Proxies from "..";
import { ADMIN_SLOT, IMPLEMENTATION_SLOT, readSlotAddress } from "../utils";

export default defineCommand<Proxies>({
  name: "upgrade",
  description:
    "Upgrade an ERC-1967 proxy to a new implementation, detecting whether it is a transparent proxy (upgraded through its ProxyAdmin) or a UUPS proxy (upgraded through itself). Optionally calls an initializer on the new implementation.",
  args: [
    { name: "proxy", type: "address", description: "Proxy address" },
    {
      name: "implementation",
      type: "address",
      description: "New implementation address",
    },
    {
      name: "signature",
      type: "write-abi",
      description:
        "Function to call on the new implementation after upgrading (e.g. a reinitializer)",
      optional: true,
    },
    {
      name: "params",
      type: "any",
      description: "Arguments matching the signature types",
      rest: true,
    },
  ],
  async run(module, { proxy, implementation, signature, params }) {
    const data: Hex = signature
      ? encodeSignatureCall(signature, params ?? [])
      : "0x";

    const client = await module.getClient();

    const admin = await readSlotAddress(client, proxy, ADMIN_SLOT);
    if (admin) {
      const adminCode = await client.getCode({ address: admin });
      if (adminCode && adminCode !== "0x") {
        // Transparent proxy owned by a ProxyAdmin contract
        return [
          encodeAction(admin, "upgradeAndCall(address,address,bytes)", [
            proxy,
            implementation,
            data,
          ]),
        ];
      }
      // Transparent proxy administered directly by an EOA (pre-v5 setups):
      // the admin calls the proxy itself
      return [
        encodeAction(proxy, "upgradeToAndCall(address,bytes)", [
          implementation,
          data,
        ]),
      ];
    }

    const currentImplementation = await readSlotAddress(
      client,
      proxy,
      IMPLEMENTATION_SLOT,
    );
    if (currentImplementation) {
      // UUPS proxy: the upgrade function lives in the implementation
      return [
        encodeAction(proxy, "upgradeToAndCall(address,bytes)", [
          implementation,
          data,
        ]),
      ];
    }

    throw new ErrorException(
      `${proxy} is not an ERC-1967 proxy (its admin and implementation slots are empty)`,
    );
  },
});
