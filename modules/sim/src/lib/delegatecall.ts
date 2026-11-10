import {
  type Address,
  concatHex,
  getAddress,
  type Hex,
  keccak256,
  pad,
  toEventSelector,
  toHex,
} from "viem";

/**
 * A delegatecall from an account on a fork, the way a Safe makes one: the
 * target's code runs on the account's storage, balance and address.
 *
 * No transaction can ask an account to delegatecall, so for the length of
 * one transaction the account's code is swapped for `delegatecallStub`, and
 * its own code is parked at `DELEGATECALL_SHADOW`. The account then sends
 * itself `DELEGATECALL_MAGIC ++ target ++ data`, which the stub turns into
 * the delegatecall. Any other call the account receives meanwhile (a
 * callback from the target, a self-call) is delegated to the parked code,
 * so it answers as it always does. Both codes are put back afterwards.
 *
 * Inside the target `msg.sender` is the account itself, where on a real
 * Safe it is whoever executed the Safe transaction, and the account's
 * EXTCODEHASH is the stub's until the transaction ends.
 */

/** Where the account's own code is parked while the stub stands in. */
export const DELEGATECALL_SHADOW: Address = getAddress(
  `0x${keccak256(toHex("evmcrispr.sim.delegatecall.shadow")).slice(-40)}`,
);

/** The selector-sized prefix the stub answers to, only on a self-call
 *  sent by the account itself (`tx.origin`). */
export const DELEGATECALL_MAGIC: Hex = keccak256(
  toHex("evmcrispr.sim.delegatecall"),
).slice(0, 10) as Hex;

/**
 * The stub's runtime code:
 *
 *   if (caller == this && origin == this && calldatasize >= 24 &&
 *       calldata[0:4] == MAGIC)
 *     delegatecall(calldata[4:24], calldata[24:])
 *   else
 *     delegatecall(SHADOW, calldata)
 *   bubble the result (return or revert with its data)
 */
export function delegatecallStub(shadow: Address = DELEGATECALL_SHADOW): Hex {
  const magic = DELEGATECALL_MAGIC.slice(2);
  const code = [
    // 0x00 caller == this && origin == this
    "30",
    "33",
    "14",
    "30",
    "32",
    "14",
    "16",
    // 0x07 && calldatasize >= 24
    "6018",
    "36",
    "10",
    "15",
    "16",
    // 0x0d && calldata[0:4] == MAGIC
    "6000",
    "35",
    "60e0",
    "1c",
    `63${magic}`,
    "14",
    "16",
    // 0x1a jump to the self-call
    "6044",
    "57",
    // 0x1d forward: delegatecall(gas, SHADOW, 0, calldatasize, 0, 0)
    "36",
    "6000",
    "6000",
    "37",
    "6000",
    "6000",
    "36",
    "6000",
    `73${shadow.slice(2).toLowerCase()}`,
    "5a",
    "f4",
    // 0x41 to the result
    "6060",
    "56",
    // 0x44 self-call: copy calldata[24:] to 0
    "5b",
    "6018",
    "36",
    "03",
    "80",
    "6018",
    "6000",
    "37",
    // 0x4f delegatecall(gas, calldata[4:24], 0, len, 0, 0)
    "6000",
    "6000",
    "82",
    "6000",
    "6004",
    "35",
    "6060",
    "1c",
    "5a",
    "f4",
    // 0x5e drop len
    "90",
    "50",
    // 0x60 result: copy returndata, return it or revert with it
    "5b",
    "3d",
    "6000",
    "6000",
    "3e",
    "606e",
    "57",
    "3d",
    "6000",
    "fd",
    // 0x6e
    "5b",
    "3d",
    "6000",
    "f3",
  ].join("");
  return `0x${code}`;
}

/** The self-call that makes the account delegatecall `target` with `data`. */
export function delegatecallData(target: Address, data: Hex | undefined): Hex {
  return concatHex([DELEGATECALL_MAGIC, target, data ?? "0x"]);
}

/**
 * The event a run's suggestions see for each delegatecall: a delegatecall
 * can rewrite its account's storage without emitting anything, so the
 * simulator reports it, as if the account had emitted this. It reaches
 * only the suggestions, never a receipt. A module declares it (as the safe
 * module does) to pin down what such a call must leave alone.
 */
export const DELEGATECALL_EVENT =
  "event SimulatedDelegatecall(address indexed target)";

export function delegatecallSuggestionLog(
  account: Address,
  target: Address,
): { address: Address; topics: Hex[]; data: Hex } {
  return {
    address: getAddress(account),
    topics: [toEventSelector(DELEGATECALL_EVENT), pad(target)],
    data: "0x",
  };
}
