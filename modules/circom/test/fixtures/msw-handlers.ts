import { npmPackageHandlers } from "@evmcrispr/test-utils/msw/npm";
import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import { DEV_PTAU_8_B64 } from "./dev-ptau";
import {
  MULTIPLIER2_PLONK_ZKEY_B64,
  MULTIPLIER2_WASM_B64,
  MULTIPLIER2_ZKEY_B64,
} from "./multiplier2";

const binary = (b64: string) =>
  new HttpResponse(Buffer.from(b64, "base64"), {
    headers: { "Content-Type": "application/octet-stream" },
  });

// A fake "circomlib-style" include tree: square.circom includes a relative
// sibling, exercising crawl + rewrite without the real (large) circomlib.
export const FAKE_LIB_SQUARE = `pragma circom 2.0.0;
include "./double.circom";
template Square() { signal input x; signal output y; y <== x * x; }
`;
export const FAKE_LIB_DOUBLE = `pragma circom 2.0.0;
template Double() { signal input x; signal output y; y <== x + x; }
`;

export const zkArtifactHandlers = [
  http.get("https://zk.test/multiplier2/circuit.wasm", () =>
    binary(MULTIPLIER2_WASM_B64),
  ),
  http.get("https://zk.test/multiplier2/final.zkey", () =>
    binary(MULTIPLIER2_ZKEY_B64),
  ),
  http.get("https://zk.test/multiplier2/plonk.zkey", () =>
    binary(MULTIPLIER2_PLONK_ZKEY_B64),
  ),
  http.get("https://zk.test/missing/:file", () =>
    HttpResponse.text("not found", { status: 404 }),
  ),
  // Phase 2: circom include tree served as a mocked npm-registry package
  // (with a real integrity hash, exercising the verified tarball path) and
  // powers-of-tau downloads (the dev ptau is format-identical to the
  // published hez files).
  ...npmPackageHandlers("fakelib", "1.0.0", {
    "circuits/square.circom": FAKE_LIB_SQUARE,
    "circuits/double.circom": FAKE_LIB_DOUBLE,
  }),
  http.get(
    "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_08.ptau",
    () => binary(DEV_PTAU_8_B64),
  ),
  http.get("https://zk.test/dev.ptau", () => binary(DEV_PTAU_8_B64)),
];
