// The Hegota devnet's gas schedule for one call on the ethereumjs EVM
// (ethrex `hegota-devnet`, whose frame transactions run after Amsterdam):
// Amsterdam's rules (EIP-8037 state gas, EIP-2780, EIP-7708, EIP-8038), with
// ethrex's EIP-8038 values (ethereumjs carries another revision of them), and
// each frame's state gas drawn from its own pool (EIP-8141): a state charge
// the pool cannot cover halts the call as out of gas rather than spilling
// into execution gas. Everything is restored after the call.
import { EVMError, getOpcodesForHF } from "@ethereumjs/evm";
import { hexToBytes } from "@ethereumjs/util";

/** EIP-8037's cost per state byte there (ethrex's constant). */
export const HEGOTA_COST_PER_STATE_BYTE = 1530n;

/** ethrex's EIP-8038 values, by ethereumjs's parameter names. */
const EIP8038_PARAMS = {
  coldaccountaccessGas: 3_000,
  coldsloadGas: 3_000,
  storageWriteGas: 10_000,
  refundStorageClearGas: 12_480,
  callValueTransferGas: 10_300,
  accountWriteGas: 8_000,
  createGas: 11_000,
  create2Gas: 11_000,
};

const outOfGas = () => new EVMError(EVMError.errorMessages.OUT_OF_GAS);
/** A reservoir no frame can drain. */
const UNBOUNDED = 2n ** 62n;

type OpEntry = {
  opcodeInfo: unknown;
  opHandler: (runState: any, common: any) => any;
  gasHandler?: (runState: any, gas: bigint, common: any) => Promise<bigint>;
};

/** Runs `run` under the schedule, `stateGas` the call's state-gas pool;
 *  returns its result and the state gas it used. */
export async function withHegotaSchedule<T>(
  evm: any,
  stateGas: bigint,
  run: () => Promise<T>,
  succeeded: (result: T) => boolean,
  /** Whether a module's opcode is installed at `byte` for this call. */
  isModuleOpcode: (byte: number) => boolean,
): Promise<{ result: T; stateGasUsed: bigint }> {
  const common = evm.common;
  const hardfork = common.hardfork();
  const params = JSON.parse(JSON.stringify(common._params));
  common.setHardfork("amsterdam");
  // 8038 merges after 8037 (Amsterdam's order), so these values win; the
  // opcode table copies static fees from the parameters, so it is rebuilt.
  common.updateParams({ 8038: EIP8038_PARAMS });
  evm.getActiveOpcodes();

  // Precompiles are warm from a transaction's start (runCall, unlike runTx,
  // does not warm them).
  for (const address of evm.precompiles.keys())
    evm.journal.addWarmedAddress(hexToBytes(`0x${address}`));

  const map: OpEntry[] = evm._opcodeMap.slice();
  // The backend's slots for module opcodes cover every byte Prague leaves
  // free, which Amsterdam's new opcodes (CLZ, SLOTNUM, DUPN…) now use:
  // those bytes get Amsterdam's opcode back, unless a module's is there.
  const amsterdam = getOpcodesForHF(common).opcodeMap as OpEntry[];
  for (let op = 0; op < 256; op++) {
    const real = amsterdam[op] as OpEntry & { opcodeInfo: { name: string } };
    if (real && real.opcodeInfo.name !== "INVALID" && !isModuleOpcode(op))
      map[op] = real;
  }
  // RETURN from init code deposits the code: its state gas comes from the
  // pool, and a pool that cannot pay it halts the create.
  const ret = map[0xf3]!;
  map[0xf3] = {
    ...ret,
    opHandler: (runState, c) => {
      if (runState.interpreter._env.isCreate) {
        const [, length] = runState.stack.peek(2);
        const deposit = length * HEGOTA_COST_PER_STATE_BYTE;
        if (deposit > evm.__poolLeft) throw outOfGas();
        evm.__poolLeft -= deposit;
      }
      return ret.opHandler(runState, c);
    },
  };
  // The interpreter class is not exported: the first opcode of the call
  // installs the pool on its prototype, before any state charge.
  for (let op = 0; op < map.length; op++) {
    const entry = map[op]!;
    map[op] = {
      ...entry,
      opHandler: (runState, c) => {
        installFramePool(Object.getPrototypeOf(runState.interpreter));
        return entry.opHandler(runState, c);
      },
    };
  }
  evm._opcodeMap = map;

  // Amsterdam's EIP-7928 records a block access list as the call runs;
  // no block is built here, so nothing is kept (it prices nothing).
  const accessList = evm.blockLevelAccessList;
  evm.blockLevelAccessList = new Proxy({}, { get: () => () => {} });
  const reservoir: bigint = evm.stateGasReservoir;
  const used: bigint = evm.executionStateGasUsed;
  // The frame's pool only shrinks (ethrex): a refill or a reverted call's
  // state charges go back to a reservoir frames do not draw from. So the
  // EVM's own reservoir is made too large to run out, and the pool is kept
  // here, charged by every state charge (`installFramePool`).
  evm.stateGasReservoir = UNBOUNDED;
  evm.__poolLeft = stateGas;
  evm.__framePool = true;
  try {
    const result = await run();
    // What the frame's state changes cost, net of refills, never below 0.
    const net = (evm.executionStateGasUsed as bigint) - used;
    const stateGasUsed = succeeded(result) && net > 0n ? net : 0n;
    return { result, stateGasUsed };
  } finally {
    evm.__framePool = false;
    evm.blockLevelAccessList = accessList;
    evm.stateGasReservoir = reservoir;
    evm.executionStateGasUsed = used;
    common.resetParams(params);
    // Rebuilds the opcode map, dropping the wrappers.
    common.setHardfork(hardfork);
  }
}

/** A frame's state charges draw from its pool alone: wraps the
 *  interpreter's charge once (it reads the EVM's flag per call). */
function installFramePool(interpreterPrototype: any): void {
  if (interpreterPrototype.__framePoolInstalled) return;
  const charge = interpreterPrototype.chargeStateGas;
  interpreterPrototype.chargeStateGas = function (
    this: any,
    amount: bigint,
    context?: string,
  ) {
    const evm = this._evm;
    if (evm.__framePool) {
      if (amount > evm.__poolLeft) throw outOfGas();
      evm.__poolLeft -= amount;
    }
    return charge.call(this, amount, context);
  };
  interpreterPrototype.__framePoolInstalled = true;
}
