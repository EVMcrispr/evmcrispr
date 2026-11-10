import { describe, expect, test } from "bun:test";
import { frameTxGas } from "../../src/simulate/intrinsic";

const SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ONE_FRAME = [{ target: null, data: "0x" as const, value: 0n }];
// 12000 intrinsic + 475 for the frame + 2800 for a secp256k1 signature.
const BASE = 15_275n;

describe("a frame transaction's intrinsic gas and calldata floor", () => {
  // ethrex prices rlp(nonce_keys) || rlp(nonce_seq) (EIP-8250) and
  // rlp(recent_root_references) (EIP-8272) as calldata: two empty lists
  // (0xc0) around the nonce, which grows a byte at 128 and again at 256.
  test.each([
    // 0x80; the signature's 65 bytes priced as non-zero.
    [0n, BASE + 16n * 68n, BASE + 64n * 68n],
    // 0x05
    [5n, BASE + 16n * 68n, BASE + 64n * 68n],
    // 0x81 0x80
    [128n, BASE + 16n * 69n, BASE + 64n * 69n],
    // 0x82 0x01 0x00: a zero byte, at 4.
    [256n, BASE + 16n * 69n + 4n, BASE + 64n * 70n],
  ])("at nonce %p", (nonce, intrinsic, floor) => {
    expect(frameTxGas(ONE_FRAME, SENDER, nonce, "secp256k1")).toEqual({
      intrinsic,
      floor,
    });
  });
});
