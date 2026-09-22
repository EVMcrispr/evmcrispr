import { afterAll, describe, it } from "bun:test";
import Ens from "@evmcrispr/module-ens";
import Safe from "@evmcrispr/module-safe";
import Semaphore from "@evmcrispr/module-semaphore";
import {
  createPublicClient,
  custom,
  encodeAbiParameters,
  parseAbiParameters,
  toFunctionSelector,
} from "viem";
import type { TestInterpreter } from "../../../../test-utils/src/evml/evml";
import { checkSmartCommandFields } from "../../../../test-utils/src/evml/testing/smartCommand";
import { createEvml, Interpreter, parseScript } from "../../../src";

const account = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const third = "0x3333333333333333333333333333333333333333";
const wrapper = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const wasExperimental = process.env.VITE_PUBLIC_EXPERIMENTAL;
process.env.VITE_PUBLIC_EXPERIMENTAL = "true";
afterAll(() => {
  if (wasExperimental === undefined)
    delete process.env.VITE_PUBLIC_EXPERIMENTAL;
  else process.env.VITE_PUBLIC_EXPERIMENTAL = wasExperimental;
});
const answers: [string, string, unknown[]][] = [
  ["owner(bytes32)", "address", [wrapper]],
  ["resolver(bytes32)", "address", [other]],
  ["defaultResolver()", "address", [other]],
  ["getData(uint256)", "address,uint32,uint64", [account, 65537, 9999999999n]],
  ["getOwners()", "address[]", [[account, other]]],
  ["getThreshold()", "uint256", [1n]],
  ["VERSION()", "string", ["1.4.1"]],
  ["groupCounter()", "uint256", [7n]],
  ["rentPrice(string[],uint256)", "uint256", [1n]],
];
const transport = custom({
  request: async ({ method, params }) => {
    if (method === "eth_chainId") return "0x1";
    if (method === "eth_getCode") return "0x6000";
    if (method === "eth_blockNumber") return "0x10";
    if (method === "eth_call") {
      const data = (params as any)[0].data as string;
      const entry = answers.find(([sig]) =>
        data.startsWith(toFunctionSelector(sig)),
      );
      if (entry)
        return encodeAbiParameters(parseAbiParameters(entry[1]), entry[2]);
    }
    throw Error(`Unexpected RPC ${method}`);
  },
});
const client = createPublicClient({ transport });
const tag = createEvml().use(Ens, Safe, Semaphore);
const factory = (script: string): TestInterpreter => {
  const evm = new Interpreter(tag.registry, {
    account,
    chainId: 1,
    transports: { 1: transport },
  });
  return {
    evm,
    script,
    ast: parseScript(script).ast,
    interpret: () => evm.interpret(script),
    bindingsManager: evm.bindingsManager,
    getBinding: evm.getBinding.bind(evm),
    getModule: evm.getModule.bind(evm),
    getAllModules: evm.getAllModules.bind(evm),
    registerLogListener: evm.registerLogListener.bind(evm),
  };
};
const proof = JSON.stringify({
  merkleTreeDepth: 1,
  merkleTreeRoot: "1",
  nullifier: "2",
  message: "3",
  scope: "4",
  points: Array(8).fill("0"),
});
const cases: Record<string, string[]> = {
  ens: [
    `set-text alice.eth url "https://example.com"`,
    `set-addr alice.eth ${other} 60`,
    `set-contenthash alice.eth 0xe3010170`,
    `set-resolver alice.eth ${other}`,
    `set-primary-name alice.eth --for ${other}`,
    `create-subname alice.eth bob ${other} --resolver ${third}`,
    `renew alice.eth 1y`,
    `wrap alice.eth --resolver ${other}`,
    `set-fuses bob.alice.eth can-extend-expiry --expiry 9999999999`,
    `transfer alice.eth to ${other}`,
  ],
  safe: [
    `add-owner ${third} --threshold 1`,
    `change-threshold 1`,
    `remove-owner ${other} --threshold 1`,
    `swap-owner ${other} for ${third}`,
    `enable-module ${third}`,
    `set-guard ${third}`,
    `set-fallback-handler ${third}`,
  ],
  semaphore: [
    `create-group $group --admin ${other}`,
    `add-member [123 456] to 7`,
    `validate '${proof}' for 7`,
  ],
};
describe("runtime field coverage for context-dependent commands", () => {
  for (const [module, scripts] of Object.entries(cases))
    for (const body of scripts) {
      const command = body.split(" ")[0];
      it(`${module}:${command}`, async () => {
        const preamble = `load ${module}`;
        // Ordinary encoding parity remains covered by the module's existing suites.
        await factory(`${preamble}\n${module}:${body}`).interpret();
        await checkSmartCommandFields(
          command,
          {
            module,
            preamble,
            cases: [{ name: command, script: `${module}:${body}` }],
          },
          client,
          factory,
        );
      });
    }
});
