import "../setup";
import { describe, expect, it } from "bun:test";
import { evml } from "@evmcrispr/test-utils/evml";
import { RECEIVER, XDAIX } from "../fixtures";

const WHO = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";

describe("Superfluid > --from is a protocol argument", () => {
  for (const line of [
    `superfluid:stream 500e18/mo ${XDAIX} to ${RECEIVER} --from ${WHO}`,
    `superfluid:stop-stream ${XDAIX} to ${RECEIVER} --from ${WHO}`,
  ]) {
    it(`is not deprecated: ${line.split(" ")[0]}`, async () => {
      const { diagnostics } = await evml
        .script(`load superfluid\n${line}`)
        .validate();
      expect(diagnostics.map((d) => d.code)).not.toContain("deprecated-option");
    });
  }
});
