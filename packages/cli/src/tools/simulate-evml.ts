import type { Address } from "viem";
import { createEvmlTag } from "../lib/evmcrispr-factory.js";

export async function simulateEvml(args: {
  script: string;
  chainId?: number;
  blockNumber?: number;
  from?: string;
  rpcUrl?: string;
}): Promise<{
  success: boolean;
  logs: string[];
  error?: string;
}> {
  const from = args.from as Address | undefined;

  const { tag } = createEvmlTag({
    chainId: args.chainId,
    rpcUrl: args.rpcUrl,
    from,
  });

  const { success, logs, error } = await tag.script(args.script).simulate({
    blockNumber: args.blockNumber,
    from,
  });

  return error === undefined ? { success, logs } : { success, logs, error };
}
