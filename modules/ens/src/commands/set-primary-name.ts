import { defineCommand, encodeAction, normalizeEnsName } from "@evmcrispr/sdk";
import { parseAbi } from "viem";
import type Ens from "..";
import { requireAddress, reverseRegistrarMap } from "../addresses";
import { assertSupportedChain } from "../utils";

export default defineCommand<Ens>({
  name: "set-primary-name",
  description:
    "Set the primary ENS name (reverse record) of the calling account.",
  args: [
    { name: "name", type: "string", description: "ENS name (e.g. mydao.eth)" },
  ],
  opts: [
    {
      name: "for",
      type: "address",
      description:
        "Set the primary name of this contract instead (the caller must be the contract, its Ownable owner, or an approved operator)",
    },
  ],
  async run(module, { name }, { opts }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const reverseRegistrar = requireAddress(
      reverseRegistrarMap,
      chainId,
      "ReverseRegistrar",
    );
    const normalized = normalizeEnsName(name);

    if (opts.for) {
      const client = await module.getClient();
      const defaultResolver = await client.readContract({
        address: reverseRegistrar,
        abi: parseAbi(["function defaultResolver() view returns (address)"]),
        functionName: "defaultResolver",
      });
      return [
        encodeAction(
          reverseRegistrar,
          "setNameForAddr(address,address,address,string)",
          [
            opts.for,
            await module.getConnectedAccount(),
            defaultResolver,
            normalized,
          ],
        ),
      ];
    }

    return [encodeAction(reverseRegistrar, "setName(string)", [normalized])];
  },
});
