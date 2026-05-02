import type { Address } from "viem";
import { createEVMcrisprInstance } from "../lib/evmcrispr-factory.js";

function needsSimWrap(script: string): boolean {
  const normalized = script.toLowerCase();
  return !(normalized.includes("load sim") && normalized.includes("sim:fork"));
}

function wrapScript(
  script: string,
  options?: { blockNumber?: number; from?: Address },
): string {
  const forkOpts: string[] = [];
  if (options?.blockNumber) {
    forkOpts.push(`--block-number ${options.blockNumber}`);
  }
  if (options?.from) {
    forkOpts.push(`--from ${options.from}`);
  }

  const optsStr = forkOpts.length > 0 ? ` ${forkOpts.join(" ")}` : "";
  return `load sim\nsim:fork${optsStr} (\n${script}\n)`;
}

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

  const { evm, logs } = await createEVMcrisprInstance({
    chainId: args.chainId,
    rpcUrl: args.rpcUrl,
    from,
  });

  const script = needsSimWrap(args.script)
    ? wrapScript(args.script, {
        blockNumber: args.blockNumber,
        from,
      })
    : args.script;

  try {
    await evm.interpret(script);
    return { success: true, logs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, logs, error: message };
  }
}
