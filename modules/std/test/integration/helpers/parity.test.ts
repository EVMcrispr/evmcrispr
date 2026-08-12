import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import {
  describeParity,
  installConstantMock,
  installMockTarget,
  MOCK_TARGET_ADDRESS,
} from "@evmcrispr/test-utils/onchain";
import {
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  parseAbiParameters,
} from "viem";
import { helpers } from "../../../src/_generated";

/**
 * @std's both-faced helpers.
 *
 * `@num!`, `@bool!` and `@bytes!` are the expression engine's entry points
 * rather than single reads: each composes live calls and constants into on-chain
 * arithmetic, logic or word ops. Their parity matters more than most, because
 * everything else that takes an expression argument goes through them.
 */

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const HOLDER = "0xd0Dd6cEF72143E22cCED4867eb0d5F2328715533";

const SUPPLY = `${WXDAI}::{totalSupply()(uint256)}`;
const DEC = `${WXDAI}::{decimals()(uint8)}`;
/** A staticcall that reverts inside the token: nobody approved this. */
const REVERTING = `${WXDAI}::{transferFrom(address,address,uint256)(bool) ${HOLDER} ${WXDAI} 1000000000000000000000000000000}`;
/** The same reverting call, declared as returning a number so it can pair
 *  with a numeric fallback — @orElse! requires both branches to be the same
 *  kind of value, and the declared return never materializes anyway. */
const REVERTING_NUM = `${WXDAI}::{transferFrom(address,address,uint256)(uint256) ${HOLDER} ${WXDAI} 1000000000000000000000000000000}`;

/** The vendored MockTarget fixture: known custom errors to match. */
const MOCK = MOCK_TARGET_ADDRESS;
const MOCK_REVERTS = `${MOCK}::{revertsWithArgs()()}`;
const MOCK_VALUE = `${MOCK}::{getValue()(uint256)}`;

/** Constant mocks for @abi.decode!: a (uint256, bytes) report whose blob
 *  encodes (address, uint256), and a bare bytes note whose payload
 *  encodes (uint256, string). */
const REPORT_MOCK = "0x00000000000000000000000000000000000dec0d";
const BLOB_MOCK = "0x00000000000000000000000000000000000dec0e";
const REPORT_RETURN = encodeAbiParameters(
  parseAbiParameters("uint256, bytes"),
  [
    7n,
    encodeAbiParameters(parseAbiParameters("address, uint256"), [HOLDER, 42n]),
  ],
);
const NOTE_RETURN = encodeAbiParameters(parseAbiParameters("bytes"), [
  encodeAbiParameters(parseAbiParameters("uint256, string"), [5n, "hello"]),
]);
const REPORT_CALL = `${REPORT_MOCK}::{lastReport()(uint256,bytes)}`;
const BLOB_CALL = `${BLOB_MOCK}::{note()(bytes)}`;

/** A constant mock returning a bytes value holding full transfer calldata,
 *  for @abi.decodeCall!. The run spellings decode the args hex directly. */
const QUEUE_MOCK = "0x00000000000000000000000000000000000dec0f";
const TRANSFER_CALLDATA = encodeFunctionData({
  abi: parseAbi(["function transfer(address to, uint256 amount)"]),
  functionName: "transfer",
  args: [HOLDER, 42n],
});
const TRANSFER_ARGS_HEX = `0x${TRANSFER_CALLDATA.slice(10)}`;
const QUEUE_RETURN = encodeAbiParameters(parseAbiParameters("bytes"), [
  TRANSFER_CALLDATA,
]);
const QUEUE_CALL = `${QUEUE_MOCK}::{queuedCalldata()(bytes)}`;

/** Anvil account #0 and known-good signatures over "hello" and the Mail
 *  typed-data payload (the sigValid.md fixtures). */
const SIGNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const HELLO_SIG =
  "0xf16ea9a3478698f695fd1401bfe27e9e4a7e8e3da94aa72b021125e31fa899cc573c48ea3fe1d4ab61a9db10c19032026e3ed2dbccba5a178235ac27f94504311c";
/** HELLO_SIG with one nibble of r flipped: recovers a different address. */
const TAMPERED_SIG = `0xe16e${HELLO_SIG.slice(6)}`;
/** HELLO_SIG with an impossible v byte: malformed, folds to false. */
const BAD_V_SIG = `${HELLO_SIG.slice(0, 130)}05`;
const TYPED_PAYLOAD =
  '{"types":{"Mail":[{"name":"to","type":"address"}]},"primaryType":"Mail","domain":{"name":"App"},"message":{"to":"0x1234567890abcdef1234567890abcdef12345678"}}';
const TYPED_SIG =
  "0x4213e2cd76eace2bcd180816df8088417f604b11db39a7478003e2fcb5c6d9201c771a631284a46d504baf815580904e1afc89a702bdb21dff5ce7bc17f6f8ec1c";

/** ERC-1271 mocks: one answering the magic value, one rejecting, and one
 *  serving a signature blob for the live-signature splice. */
const MAGIC_MOCK = "0x0000000000000000000000000000000000127101";
const REJECT_MOCK = "0x0000000000000000000000000000000000127102";
const SIG_MOCK = "0x0000000000000000000000000000000000127103";
const SIG_CALL = `${SIG_MOCK}::{sig()(bytes)}`;

describeParity("@std", {
  helpers,
  setup: async (client) => {
    await installMockTarget(client);
    await installConstantMock(client, REPORT_MOCK, REPORT_RETURN);
    await installConstantMock(client, BLOB_MOCK, NOTE_RETURN);
    await installConstantMock(client, QUEUE_MOCK, QUEUE_RETURN);
    await installConstantMock(
      client,
      MAGIC_MOCK,
      encodeAbiParameters([{ type: "bytes4" }], ["0x1626ba7e"]),
    );
    await installConstantMock(
      client,
      REJECT_MOCK,
      encodeAbiParameters([{ type: "bytes4" }], ["0xffffffff"]),
    );
    await installConstantMock(
      client,
      SIG_MOCK,
      encodeAbiParameters([{ type: "bytes" }], [HELLO_SIG]),
    );
  },
  cases: [
    // ---- @num!: arithmetic over live reads ---------------------------------
    {
      name: "num adds a constant to a live read",
      run: `@num(${DEC} + 4)`,
      compile: `@num!(${DEC} + 4)`,
    },
    {
      // A division that divides evenly: the only kind on which the two
      // faces agree.
      name: "num divides evenly",
      run: `@num(${DEC} / 2)`,
      compile: `@num!(${DEC} / 2)`,
    },
    {
      // And one that does not. Off-chain `/` is EXACT RATIONAL arithmetic, so
      // 18/4 is 9/2; on-chain a word is an integer and the division floors to
      // 4. Nothing warns, and the same source text means two different things
      // — which is why the case is written to divide unevenly on purpose
      // rather than left to whatever a live read happens to be.
      name: "diverges: an uneven division is exact off-chain and floored on-chain",
      run: `@num(${DEC} / 4)`,
      compile: `@num!(${DEC} / 4)`,
      helper: "num",
      diverges: {
        reason: "off-chain / is exact rational, on-chain it floors",
      },
    },
    {
      name: "num applies precedence across several live terms",
      run: `@num(${DEC} * 2 + 1)`,
      compile: `@num!(${DEC} * 2 + 1)`,
    },
    {
      name: "num takes a modulus",
      run: `@num(${SUPPLY} % 1000)`,
      compile: `@num!(${SUPPLY} % 1000)`,
    },

    // ---- @bool!: comparison and logic --------------------------------------
    {
      name: "bool compares a live read against a constant",
      run: `@bool(${DEC} == 18)`,
      compile: `@bool!(${DEC} == 18)`,
    },
    {
      name: "bool ands two live comparisons",
      run: `@bool(${DEC} == 18 and ${SUPPLY} > 0)`,
      compile: `@bool!(${DEC} == 18 and ${SUPPLY} > 0)`,
    },
    {
      // The false branch matters as much: a predicate that does not hold must
      // come back false rather than merely failing to come back true.
      name: "bool is false when the comparison does not hold",
      run: `@bool(${DEC} == 6)`,
      compile: `@bool!(${DEC} == 6)`,
    },
    {
      name: "bool negates",
      run: `@bool(not ${DEC} == 6)`,
      compile: `@bool!(not ${DEC} == 6)`,
    },

    // ---- @bytes!: word operations ------------------------------------------
    {
      // Declared: off-chain the result is minimal hex (`0x12`), on-chain it is
      // the raw 32-byte word, which resolve hands back as the number 18. The
      // two agree on the VALUE and differ on the width, which is what the
      // compileDescription means by "the raw word cast".
      name: "diverges: bytes is minimal hex off-chain, a full word on-chain",
      run: `@bytes(${DEC})`,
      compile: `@bytes!(${DEC})`,
      helper: "bytes",
      diverges: { reason: "the on-chain face works on full 32-byte words" },
    },
    {
      name: "diverges: a shifted word keeps that width difference",
      run: `@bytes(${DEC} "<<" 8)`,
      compile: `@bytes!(${DEC} "<<" 8)`,
      helper: "bytes",
      diverges: { reason: "the on-chain face works on full 32-byte words" },
    },
    {
      // `^` was on-chain only until now: @bytes! accepted it and @bytes threw
      // "Operator ^ not recognized", so the same expression compiled but would
      // not run. The width difference below is the declared part.
      name: "diverges: xor agrees on the value, differs on the width",
      run: `@bytes(${DEC} "xor" 255)`,
      compile: `@bytes!(${DEC} "xor" 255)`,
      helper: "bytes",
      diverges: { reason: "the on-chain face works on full 32-byte words" },
    },

    // ---- @hash! -------------------------------------------------------------
    {
      // Hashes the DECODED payload a call returns, not its ABI envelope, so
      // this is keccak of the symbol string itself.
      name: "hash digests the decoded string a call returns",
      run: `@hash(${WXDAI}::{symbol()(string)})`,
      compile: `@hash!(${WXDAI}::{symbol()(string)})`,
    },

    // ---- @balance! ----------------------------------------------------------
    {
      // The token list has no ETH on Gnosis, whose native token is xDAI, so
      // this reads an ERC-20 balance by address instead.
      name: "balance reads an ERC-20 balance",
      run: `@balance(${WXDAI} ${HOLDER})`,
      compile: `@balance!(${WXDAI} ${HOLDER})`,
    },

    // ---- @reverts! and @orElse!: the revert probe and its fallback ----------
    //
    // These are the two faces most at risk of quietly disagreeing, because
    // the off-chain side infers "the chain refused this read" from an error
    // object while the on-chain side gets it from the EVM. Both directions
    // are pinned: a call that resolves and one that reverts.
    {
      name: "reverts is false for a call that resolves",
      run: `@reverts(${DEC})`,
      compile: `@reverts!(${DEC})`,
    },
    {
      name: "reverts is true for a call that reverts",
      run: `@reverts(${REVERTING})`,
      compile: `@reverts!(${REVERTING})`,
    },
    {
      name: "orElse keeps the first branch when it resolves",
      run: `@orElse(${DEC} 99)`,
      compile: `@orElse!(${DEC} 99)`,
    },
    {
      name: "orElse takes the fallback when the first branch reverts",
      run: `@orElse(${REVERTING_NUM} ${DEC})`,
      compile: `@orElse!(${REVERTING_NUM} ${DEC})`,
    },
    {
      name: "orElse takes a constant fallback when the first branch reverts",
      run: `@orElse(${REVERTING_NUM} 7)`,
      compile: `@orElse!(${REVERTING_NUM} 7)`,
    },

    // ---- the @reverts arrow: match the reason, select its arguments ---------
    //
    // The compile face routes through `revertData`, which re-performs the
    // call IN-FRAME so the target's revert data survives; the run face
    // decodes the same data out of the RPC error. Matching, mismatching,
    // and the selected-argument value are all pinned against the vendored
    // MockTarget fixture.
    {
      name: "arrow matches the expected custom error",
      run: `@reverts(${MOCK_REVERTS} -!> InsufficientBalance(uint256,uint256))`,
      compile: `@reverts!(${MOCK_REVERTS} -!> InsufficientBalance(uint256,uint256))`,
    },
    {
      name: "arrow is false for a different error",
      run: `@reverts(${MOCK_REVERTS} -!> Unauthorized())`,
      compile: `@reverts!(${MOCK_REVERTS} -!> Unauthorized())`,
    },
    {
      name: "arrow is false when the call resolves",
      run: `@reverts(${MOCK_VALUE} -!> Unauthorized())`,
      compile: `@reverts!(${MOCK_VALUE} -!> Unauthorized())`,
    },
    {
      name: "arrow is false for a bare revert with no data",
      run: `@reverts(${MOCK}::{revertsBare()()} -!> Unauthorized())`,
      compile: `@reverts!(${MOCK}::{revertsBare()()} -!> Unauthorized())`,
    },
    {
      name: "a lens selects an error argument as the value",
      run: `@reverts(${MOCK_REVERTS} -!> InsufficientBalance(uint256,uint256) [_ $])`,
      compile: `@reverts!(${MOCK_REVERTS} -!> InsufficientBalance(uint256,uint256) [_ $])`,
    },
    {
      name: "a lens decodes an Error(string) reason",
      run: `@reverts(${MOCK}::{revertingFunction()()} -!> Error(string) [$])`,
      compile: `@reverts!(${MOCK}::{revertingFunction()()} -!> Error(string) [$])`,
    },
    {
      name: "a nested lens descends into an array error argument",
      run: `@reverts(${MOCK}::{revertsWithRedirect()()} -!> Redirect(address,address[]) [_ [$]])`,
      compile: `@reverts!(${MOCK}::{revertsWithRedirect()()} -!> Redirect(address,address[]) [_ [$]])`,
    },
    {
      // The payoff of word-aligned error arguments: the selected address
      // is a live account, so the probe's result seeds a further read —
      // a revert reason as a stepping stone.
      name: "a lens-selected address continues a chain",
      run: `@reverts(${MOCK}::{revertsWithRedirect()()} -!> Redirect(address,address[]) [_ [$]])::{getValue()(uint256)}`,
      compile: `@reverts!(${MOCK}::{revertsWithRedirect()()} -!> Redirect(address,address[]) [_ [$]])::!{getValue()(uint256)}`,
    },
    {
      // Reason-matching needs the target's OWN revert data, which only a
      // direct call preserves — a live-argument read routes through the
      // core and the reason drowns in CallFailed. The off-chain face has
      // the real error object and can afford to be permissive.
      name: "arrow refuses a core-routed probe",
      helper: "reverts",
      run: `@reverts(${MOCK}::{checkValue(uint256)() ${MOCK_VALUE}} -!> Error(string))`,
      compile: `@reverts!(${MOCK}::{checkValue(uint256)() ${MOCK_VALUE}} -!> Error(string))`,
      refuses: "DIRECT call",
    },

    // ---- @ifElse: the lazy ternary over the core's cond ---------------------
    {
      name: "ifElse takes the then branch on a true live condition",
      run: `@ifElse(${MOCK_VALUE} > 41 ? 7 : 9)`,
      compile: `@ifElse!(${MOCK_VALUE} > 41 ? 7 : 9)`,
    },
    {
      name: "ifElse takes the else branch on a false live condition",
      run: `@ifElse(${MOCK_VALUE} > 100 ? 7 : 9)`,
      compile: `@ifElse!(${MOCK_VALUE} > 100 ? 7 : 9)`,
    },
    {
      name: "ifElse judges a bare word by truthiness",
      run: `@ifElse(${MOCK_VALUE} ? 7 : 9)`,
      compile: `@ifElse!(${MOCK_VALUE} ? 7 : 9)`,
    },
    {
      // The losing branch reverts — and is never resolved, on either face.
      name: "ifElse never resolves the losing branch",
      run: `@ifElse(${MOCK_VALUE} > 41 ? ${MOCK_VALUE} : ${MOCK}::{revertsWithArgs()(uint256)})`,
      compile: `@ifElse!(${MOCK_VALUE} > 41 ? ${MOCK_VALUE} : ${MOCK}::{revertsWithArgs()(uint256)})`,
    },
    {
      // A build-time condition folds: the compiled operand IS the winning
      // branch, no cond wrapper at all.
      name: "ifElse folds a constant condition",
      run: `@ifElse(true ? ${MOCK_VALUE} : 5)`,
      compile: `@ifElse!(true ? ${MOCK_VALUE} : 5)`,
    },
    {
      // Dynamic winners pass through raw as their canonical envelope.
      name: "ifElse selects between live string reads",
      run: `@ifElse(${MOCK_VALUE} > 41 ? ${WXDAI}::{symbol()(string)} : ${WXDAI}::{name()(string)})`,
      compile: `@ifElse!(${MOCK_VALUE} > 41 ? ${WXDAI}::{symbol()(string)} : ${WXDAI}::{name()(string)})`,
    },
    {
      name: "ifElse refuses branches of different kinds",
      helper: "ifElse",
      run: `@ifElse(${MOCK_VALUE} > 41 ? 7 : ${WXDAI}::{symbol()(string)})`,
      compile: `@ifElse!(${MOCK_VALUE} > 41 ? 7 : ${WXDAI}::{symbol()(string)})`,
      refuses: "same kind of value",
    },
    {
      // The off-chain face happily returns a string constant; on-chain the
      // core splices words, so a string constant cannot ride a branch.
      name: "ifElse refuses a string constant branch",
      helper: "ifElse",
      run: `@ifElse(${MOCK_VALUE} > 41 ? "yes" : "no")`,
      compile: `@ifElse!(${MOCK_VALUE} > 41 ? "yes" : "no")`,
      refuses: "string or bytes constant",
    },
    {
      name: "ifElse branches can be expressions",
      run: `@ifElse(${MOCK_VALUE} > 41 ? ${MOCK_VALUE} + 8 : ${MOCK_VALUE} - 8)`,
      compile: `@ifElse!(${MOCK_VALUE} > 41 ? ${MOCK_VALUE} + 8 : ${MOCK_VALUE} - 8)`,
    },
    {
      // A parenthesized ternary rides a branch: cond inside cond, with the
      // inner losing read never resolved on either face.
      name: "ifElse nests parenthesized ternaries",
      run: `@ifElse(${MOCK_VALUE} > 41 ? (${MOCK_VALUE} > 100 ? ${MOCK}::{revertsWithArgs()(uint256)} : ${MOCK_VALUE} - 40) : 3)`,
      compile: `@ifElse!(${MOCK_VALUE} > 41 ? (${MOCK_VALUE} > 100 ? ${MOCK}::{revertsWithArgs()(uint256)} : ${MOCK_VALUE} - 40) : 3)`,
    },

    // ---- @abi.decode!: typed re-entry into an encoded blob ----
    {
      // The flagship shape: the blob's payload is re-entered in place, so
      // the compiled form is nav over nav with a PAYLOAD-terminated inner
      // path — one frame for the strip, one for the claim.
      name: "abi.decode selects a word out of a blob field",
      run: `@abi.decode("address,uint256" ${REPORT_CALL}[_ $] [_ $])`,
      compile: `@abi.decode!("address,uint256" ${REPORT_CALL}[_ $] [_ $])`,
    },
    {
      name: "abi.decode selects the address",
      run: `@abi.decode("address,uint256" ${REPORT_CALL}[_ $] [$ _])`,
      compile: `@abi.decode!("address,uint256" ${REPORT_CALL}[_ $] [$ _])`,
    },
    {
      // A dynamic member inside the payload: its offset is payload-relative,
      // which is exactly what the in-place re-entry preserves.
      name: "abi.decode reaches a string inside the payload",
      run: `@abi.decode("uint256,string" ${BLOB_CALL} [_ $])`,
      compile: `@abi.decode!("uint256,string" ${BLOB_CALL} [_ $])`,
    },
    {
      name: "abi.decode refuses a missing lens",
      helper: "abi.decode",
      run: `@abi.decode("address,uint256" ${REPORT_CALL}[_ $])`,
      compile: `@abi.decode!("address,uint256" ${REPORT_CALL}[_ $])`,
      refuses: "needs a lens",
    },
    {
      // The off-chain face decodes constants happily; on-chain a constant
      // has nothing to assert about.
      name: "abi.decode refuses a constant blob",
      helper: "abi.decode",
      run: `@abi.decode("uint256" 0x0000000000000000000000000000000000000000000000000000000000000064 [$])`,
      compile: `@abi.decode!("uint256" 0x0000000000000000000000000000000000000000000000000000000000000064 [$])`,
      refuses: "call expression",
    },
    {
      // The call's own lens guard fires first: a word field is not a
      // navigable dynamic selection, let alone a bytes blob.
      name: "abi.decode refuses a non-bytes field as the blob",
      helper: "abi.decode",
      run: `@abi.decode("uint256" ${REPORT_CALL}[$ _] [$])`,
      compile: `@abi.decode!("uint256" ${REPORT_CALL}[$ _] [$])`,
      refuses: "the selection in lastReport is uint256",
    },
    {
      name: "abi.decode refuses a struct selection",
      helper: "abi.decode",
      run: `@abi.decode("(address,uint256),uint256" ${REPORT_CALL}[_ $] [$ _])`,
      compile: `@abi.decode!("(address,uint256),uint256" ${REPORT_CALL}[_ $] [$ _])`,
      refuses: "must select a single value",
    },
    {
      name: "abi.decode refuses an array selection",
      helper: "abi.decode",
      run: `@abi.decode("uint256[],uint256" ${REPORT_CALL}[_ $] [$ _])`,
      compile: `@abi.decode!("uint256[],uint256" ${REPORT_CALL}[_ $] [$ _])`,
      refuses: "array selection",
    },
    {
      // The type list is the author's claim: a claim wider than the payload
      // compiles, then the out-of-payload read reverts at judge time.
      name: "abi.decode reverts on a claim wider than the payload",
      helper: "abi.decode",
      run: `@abi.decode("address,uint256,uint256" ${REPORT_CALL}[_ $] [_ _ $])`,
      compile: `@abi.decode!("address,uint256,uint256" ${REPORT_CALL}[_ $] [_ _ $])`,
      reverts: /reverted/i,
    },

    // ---- @abi.decodeCall!: judged calldata with a selector guard ----
    {
      // The selector is sliced off with a live length so the args realign;
      // the run spelling decodes the same args hex directly.
      name: "abi.decodeCall selects the amount out of live calldata",
      run: `@abi.decode("address,uint256" ${TRANSFER_ARGS_HEX} [_ $])`,
      compile: `@abi.decodeCall!(${QUEUE_CALL} transfer(address,uint256) [_ $])`,
    },
    {
      name: "abi.decodeCall selects the recipient",
      run: `@abi.decode("address,uint256" ${TRANSFER_ARGS_HEX} [$ _])`,
      compile: `@abi.decodeCall!(${QUEUE_CALL} transfer(address,uint256) [$ _])`,
    },
    {
      // The guard, doing its one job: claiming approve over transfer
      // calldata compiles, then the selector constraint reverts the cond.
      name: "abi.decodeCall reverts on a selector mismatch",
      helper: "abi.decodeCall",
      run: `@abi.decode("address,uint256" ${TRANSFER_ARGS_HEX} [_ $])`,
      compile: `@abi.decodeCall!(${QUEUE_CALL} approve(address,uint256) [_ $])`,
      reverts: /reverted/i,
    },
    {
      name: "abi.decodeCall refuses a missing lens",
      helper: "abi.decodeCall",
      run: `@abi.decode("address,uint256" ${TRANSFER_ARGS_HEX} [_ $])`,
      compile: `@abi.decodeCall!(${QUEUE_CALL} transfer(address,uint256))`,
      refuses: "needs a lens",
    },
    {
      name: "abi.decodeCall refuses a missing signature",
      helper: "abi.decodeCall",
      run: `@abi.decode("address,uint256" ${TRANSFER_ARGS_HEX} [_ $])`,
      compile: `@abi.decodeCall!(${QUEUE_CALL} [_ $])`,
      refuses: "function signature",
    },
    {
      name: "abi.decodeCall refuses a constant blob",
      helper: "abi.decodeCall",
      run: `@abi.decode("address,uint256" ${TRANSFER_ARGS_HEX} [_ $])`,
      compile: `@abi.decodeCall!(${TRANSFER_CALLDATA} transfer(address,uint256) [_ $])`,
      refuses: "call expression",
    },

    // ---- @abi.encodePacked!: byte concatenation over live parts -----------
    {
      name: "encodePacked of constants folds to the plain answer",
      run: `@abi.encodePacked("address,uint256" ${HOLDER} 42)`,
      compile: `@abi.encodePacked!("address,uint256" ${HOLDER} 42)`,
    },
    {
      name: "encodePacked splices a live full-width word",
      run: `@abi.encodePacked("uint256,uint256" ${MOCK_VALUE} 7)`,
      compile: `@abi.encodePacked!("uint256,uint256" ${MOCK_VALUE} 7)`,
    },
    {
      // uint64 cuts the live word to its packed width through one slice.
      name: "encodePacked narrows a live word to its type width",
      run: `@abi.encodePacked("uint64,address" ${MOCK_VALUE} ${HOLDER})`,
      compile: `@abi.encodePacked!("uint64,address" ${MOCK_VALUE} ${HOLDER})`,
    },
    {
      // A live string part passes its decoded payload through raw.
      name: "encodePacked passes a live string payload through",
      run: `@abi.encodePacked("string,uint8" ${WXDAI}::{symbol()(string)} 7)`,
      compile: `@abi.encodePacked!("string,uint8" ${WXDAI}::{symbol()(string)} 7)`,
    },
    {
      name: "encodePacked refuses a live value at an array position",
      helper: "abi.encodePacked",
      run: `@abi.encodePacked("uint256" 1)`,
      compile: `@abi.encodePacked!("uint256[]" ${MOCK_VALUE})`,
      refuses: /elementary and string\/bytes values/,
    },
    {
      name: "encodePacked refuses five live values",
      helper: "abi.encodePacked",
      run: `@abi.encodePacked("uint256" 1)`,
      compile: `@abi.encodePacked!("uint256,uint256,uint256,uint256,uint256" ${MOCK_VALUE} ${MOCK_VALUE} ${MOCK_VALUE} ${MOCK_VALUE} ${MOCK_VALUE})`,
      refuses: /at most 4 live values/,
    },

    // ---- @abi.encode!: static head words -----------------------------------
    {
      name: "encode of constants folds to the plain answer",
      run: `@abi.encode("uint256,address" 42 ${HOLDER})`,
      compile: `@abi.encode!("uint256,address" 42 ${HOLDER})`,
    },
    {
      name: "encode splices a live word among constant heads",
      run: `@abi.encode("uint256,uint256,address" 1 ${MOCK_VALUE} ${HOLDER})`,
      compile: `@abi.encode!("uint256,uint256,address" 1 ${MOCK_VALUE} ${HOLDER})`,
    },
    {
      name: "encode refuses a dynamic type when a value is live",
      helper: "abi.encode",
      run: `@abi.encode("uint256" 1)`,
      compile: `@abi.encode!("string,uint256" note ${MOCK_VALUE})`,
      refuses: /elementary static types/,
    },

    // ---- @abi.encodeCall!: selector plus argument words --------------------
    {
      name: "encodeCall of constants folds to the plain answer",
      run: `@abi.encodeCall("transfer(address,uint256)" ${HOLDER} 42)`,
      compile: `@abi.encodeCall!("transfer(address,uint256)" ${HOLDER} 42)`,
    },
    {
      name: "encodeCall splices a live argument after the selector",
      run: `@abi.encodeCall("transfer(address,uint256)" ${HOLDER} ${MOCK_VALUE})`,
      compile: `@abi.encodeCall!("transfer(address,uint256)" ${HOLDER} ${MOCK_VALUE})`,
    },
    {
      name: "encodeCall refuses a dynamic parameter with a live argument",
      helper: "abi.encodeCall",
      run: `@abi.encodeCall("transfer(address,uint256)" ${HOLDER} 1)`,
      compile: `@abi.encodeCall!("post(string,uint256)" note ${MOCK_VALUE})`,
      refuses: /elementary static types/,
    },

    // ---- @sigValid!: recovery and ERC-1271 at judgement --------------------
    {
      name: "sigValid verifies a personal-message signature",
      run: `@sigValid(${SIGNER} "hello" ${HELLO_SIG})`,
      compile: `@sigValid!(${SIGNER} "hello" ${HELLO_SIG})`,
    },
    {
      name: "sigValid rejects the wrong expected signer",
      run: `@sigValid(${HOLDER} "hello" ${HELLO_SIG})`,
      compile: `@sigValid!(${HOLDER} "hello" ${HELLO_SIG})`,
    },
    {
      name: "sigValid rejects a tampered signature",
      run: `@sigValid(${SIGNER} "hello" ${TAMPERED_SIG})`,
      compile: `@sigValid!(${SIGNER} "hello" ${TAMPERED_SIG})`,
    },
    {
      // An impossible v byte folds to constant false, like the plain
      // face's catch-all.
      name: "sigValid folds a malformed signature to false",
      run: `@sigValid(${SIGNER} "hello" ${BAD_V_SIG})`,
      compile: `@sigValid!(${SIGNER} "hello" ${BAD_V_SIG})`,
    },
    {
      name: "sigValid verifies an EIP-712 typed-data signature",
      run: `@sigValid(${SIGNER} '${TYPED_PAYLOAD}' ${TYPED_SIG})`,
      compile: `@sigValid!(${SIGNER} '${TYPED_PAYLOAD}' ${TYPED_SIG})`,
    },
    {
      // The plain face only recovers ECDSA signatures, so a contract
      // signer is exactly where the faces part company — declared, not
      // papered over.
      name: "sigValid accepts a contract signer answering the magic value",
      run: `@sigValid(${MAGIC_MOCK} "hello" ${HELLO_SIG})`,
      compile: `@sigValid!(${MAGIC_MOCK} "hello" ${HELLO_SIG})`,
      helper: "sigValid",
      diverges: {
        reason: "ERC-1271 verification has no off-chain counterpart",
        expect: (run, chain) => {
          expect(run.v).to.equal("false");
          expect(chain.v).to.equal(true);
        },
      },
    },
    {
      name: "sigValid rejects a contract signer answering garbage",
      run: `@sigValid(${REJECT_MOCK} "hello" ${HELLO_SIG})`,
      compile: `@sigValid!(${REJECT_MOCK} "hello" ${HELLO_SIG})`,
    },
    {
      // The signature itself read live off a contract, spliced into the
      // ERC-1271 call.
      name: "sigValid splices a live signature for a contract signer",
      run: `@sigValid(${MAGIC_MOCK} "hello" ${HELLO_SIG})`,
      compile: `@sigValid!(${MAGIC_MOCK} "hello" ${SIG_CALL})`,
      helper: "sigValid",
      diverges: {
        reason: "ERC-1271 verification has no off-chain counterpart",
        expect: (run, chain) => {
          expect(run.v).to.equal("false");
          expect(chain.v).to.equal(true);
        },
      },
    },
    {
      name: "sigValid refuses a live message",
      helper: "sigValid",
      run: `@sigValid(${SIGNER} "hello" ${HELLO_SIG})`,
      compile: `@sigValid!(${SIGNER} ${WXDAI}::{symbol()(string)} ${HELLO_SIG})`,
      refuses: /signer and message must be constants/,
    },
    {
      name: "sigValid refuses a live signature for an EOA signer",
      helper: "sigValid",
      run: `@sigValid(${SIGNER} "hello" ${HELLO_SIG})`,
      compile: `@sigValid!(${SIGNER} "hello" ${SIG_CALL})`,
      refuses: /contract signer implementing ERC-1271/,
    },
  ],
});
