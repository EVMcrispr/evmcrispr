import {
  defineHelper,
  encodeAction,
  HelperFunctionError,
} from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "gas.estimate",
  description: "Estimate the gas required for a contract call.",
  returnType: "number",
  args: [
    { name: "address", type: "address", description: "Target contract address" },
    { name: "signature", type: "write-abi", description: 'Function signature (e.g. "transfer(address,uint256)")' },
    { name: "params", type: "any", description: "Arguments matching the signature types", rest: true },
  ],
  async run(module, { address, signature, params }, { node }) {
    const action = encodeAction(address, signature, params);
    const client = await module.getClient();

    try {
      const gas = await client.estimateGas({
        to: action.to,
        data: action.data,
      });
      return gas.toString();
    } catch (err) {
      throw new HelperFunctionError(
        node,
        `gas estimation failed: ${(err as Error).message}`,
      );
    }
  },
});
