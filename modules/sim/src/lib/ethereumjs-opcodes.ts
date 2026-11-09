// A module simulation's extra opcodes on ethereumjs. ethereumjs takes
// custom opcodes only when its EVM is created, so every byte the hardfork
// leaves undefined gets a handler that asks the table of the moment
// (`withOpcodes`); with none there, the byte is the invalid opcode it was.
import type { Common } from "@ethereumjs/common";
import {
  EVMError,
  type EVMOpts,
  getOpcodesForHF,
  paramsEVM,
} from "@ethereumjs/evm";
import type { SimOpcode, SimOpcodeResult } from "@evmcrispr/sdk";
import { hexToBytes } from "viem";

type CustomOpcode = NonNullable<EVMOpts["customOpcodes"]>[number];

export interface OpcodeSlot {
  table?: Map<number, SimOpcode>;
  /** Why the last call's added opcode failed, for its result. */
  failure?: string;
}

/** The bytes the hardfork does not define. */
export function freeOpcodes(common: Common): Set<number> {
  // The EVM adds its parameters to its Common when it is created.
  const withParams = common.copy();
  withParams.updateParams(paramsEVM);
  const { opcodes } = getOpcodesForHF(withParams);
  const free = new Set<number>();
  for (let b = 0; b < 256; b++) if (!opcodes.has(b)) free.add(b);
  return free;
}

// ethereumjs' own memory expansion charge (`subMemUsage`, not exported).
function memoryCost(
  runState: any,
  offset: bigint,
  length: bigint,
  common: Common,
): bigint {
  if (length === 0n) return 0n;
  const words = (offset + length + 31n) / 32n;
  if (words <= runState.memoryWordCount) return 0n;
  let cost =
    words * common.param("memoryGas") +
    (words * words) / common.param("quadCoefficientDivGas");
  if (cost > runState.highestMemCost) {
    const highest = runState.highestMemCost;
    runState.highestMemCost = cost;
    cost -= highest;
  }
  runState.memoryWordCount = words;
  return cost;
}

const invalid = () => {
  throw new EVMError(EVMError.errorMessages.INVALID_OPCODE);
};

export function customOpcodes(
  common: Common,
  slot: OpcodeSlot,
): CustomOpcode[] {
  // The answer computed while charging gas, applied by the logic after it.
  const answers = new WeakMap<object, SimOpcodeResult>();
  // A module's answer that throws is the opcode failing, not the run.
  const ask = (runState: any, op: SimOpcode): SimOpcodeResult => {
    try {
      return op.run({
        address: runState.interpreter.getAddress().toString(),
        operands: runState.stack.peek(op.pops),
        isStatic: runState.interpreter.isStatic(),
      });
    } catch (error) {
      return { fail: `threw: ${String(error)}` };
    }
  };
  return [...freeOpcodes(common)].map((byte) => ({
    opcode: byte,
    opcodeName: `SIM_${byte.toString(16).toUpperCase()}`,
    baseFee: 3,
    gasFunction(runState: any, gas: bigint) {
      const op = slot.table?.get(byte);
      if (!op) return gas;
      const answer = ask(runState, op);
      answers.set(runState, answer);
      if ("write" in answer) {
        const size = BigInt(hexToBytes(answer.write.data).length);
        return (
          gas +
          memoryCost(runState, answer.write.offset, size, common) +
          3n * ((size + 31n) / 32n)
        );
      }
      if ("return" in answer)
        return (
          gas +
          memoryCost(runState, answer.return.offset, answer.return.size, common)
        );
      return gas;
    },
    logicFunction(runState: any) {
      const op = slot.table?.get(byte);
      if (!op) return invalid();
      const answer = answers.get(runState) ?? ask(runState, op);
      answers.delete(runState);
      runState.stack.popN(op.pops);
      if ("push" in answer) runState.stack.push(answer.push);
      else if ("write" in answer) {
        const bytes = hexToBytes(answer.write.data);
        runState.memory.write(Number(answer.write.offset), bytes.length, bytes);
      } else if ("return" in answer) {
        const { offset, size } = answer.return;
        runState.interpreter.finish(
          size === 0n
            ? new Uint8Array()
            : runState.memory.read(Number(offset), Number(size)),
        );
      } else {
        slot.failure = `${op.name}: ${answer.fail}`;
        invalid();
      }
    },
  }));
}
