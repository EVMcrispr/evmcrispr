import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { permissionId } from "../../../src/utils/permissions";
import { DAO_ADDRESS, PREAMBLE } from "../../fixtures";

describeHelper("@aragonosx:permission", {
  module: "aragonosx",
  cases: [
    {
      name: "hashes a short permission name",
      input: '@aragonosx:permission("EXECUTE")',
      expected: permissionId("EXECUTE"),
    },
    {
      name: "hashes a full permission name",
      input: '@aragonosx:permission("EXECUTE_PERMISSION")',
      expected: permissionId("EXECUTE"),
    },
  ],
  errorCases: [
    {
      name: "rejects malformed bytes32 values",
      input: '@aragonosx:permission("0x1234")',
      error: "bytes32",
    },
  ],
  docCases: [
    {
      description: "Compute a permission id for use in a raw exec call",
      preamble: PREAMBLE,
      code: `aragonosx:connect 0x2222222222222222222222222222222222222222 (
  set $id @aragonosx:permission("EXECUTE")
  print $id
)`,
    },
  ],
});
