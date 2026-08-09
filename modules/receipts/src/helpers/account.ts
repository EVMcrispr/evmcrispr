import type { Address } from "@evmcrispr/sdk";
import {
  classifyAddress,
  clientFor,
  defineHelper,
  ErrorException,
  resolveChainId,
} from "@evmcrispr/sdk";
import type Receipts from "..";
import { renderAccountSummary } from "../utils/renderAccountSummary";

export default defineHelper<Receipts>({
  name: "account",
  batchable: false,
  experimental: true,
  description:
    "Human-readable summary of an address: EOA / contract / EIP-7702-delegated EOA, verified contract name, proxy implementation, ENS name, balance and tx count.",
  returnType: "string",
  args: [
    { name: "address", type: "address", description: "Address to inspect" },
    {
      name: "chain",
      type: "chain",
      optional: true,
      description: "Chain to look on (default: current chain)",
    },
  ],
  async run(module, { address, chain }) {
    const chainId =
      chain !== undefined ? resolveChainId(chain) : await module.getChainId();
    const client = await clientFor(module, chainId);
    const info = await classifyAddress(address as Address, client, chainId);
    if (!info) {
      throw new ErrorException(`invalid address ${address}`);
    }
    return renderAccountSummary(info, chainId);
  },
});
