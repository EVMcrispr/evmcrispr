import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import { MULTIPLIER2_WASM_B64, MULTIPLIER2_ZKEY_B64 } from "./multiplier2";

const binary = (b64: string) =>
  new HttpResponse(Buffer.from(b64, "base64"), {
    headers: { "Content-Type": "application/octet-stream" },
  });

export const zkArtifactHandlers = [
  http.get("https://zk.test/multiplier2/circuit.wasm", () =>
    binary(MULTIPLIER2_WASM_B64),
  ),
  http.get("https://zk.test/multiplier2/final.zkey", () =>
    binary(MULTIPLIER2_ZKEY_B64),
  ),
  http.get("https://zk.test/missing/:file", () =>
    HttpResponse.text("not found", { status: 404 }),
  ),
];
