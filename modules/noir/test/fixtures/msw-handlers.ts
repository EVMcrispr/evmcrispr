import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import { ASSERT_SOURCE } from "../fixtures";
import { ASSERT_ARTIFACT_JSON } from "./assert-circuit";

export const noirArtifactHandlers = [
  http.get("https://noir.test/assert/artifact.json", () =>
    HttpResponse.text(ASSERT_ARTIFACT_JSON, {
      headers: { "Content-Type": "application/json" },
    }),
  ),
  http.get("https://noir.test/assert/main.nr", () =>
    HttpResponse.text(ASSERT_SOURCE),
  ),
  http.get("https://noir.test/missing/:file", () =>
    HttpResponse.text("not found", { status: 404 }),
  ),
];
