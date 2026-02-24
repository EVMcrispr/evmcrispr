import "../../setup";
import { server } from "../../setup";
import { describeHelper, expect } from "@evmcrispr/test-utils";
import {
  HttpResponse,
  http,
} from "@evmcrispr/test-utils/msw/server";
import { helpers } from "../../../src/_generated";

server.use(
  http.get("https://test.evmcrispr.local/hello", () =>
    HttpResponse.json({ greeting: "world" }),
  ),
  http.post("https://test.evmcrispr.local/echo", async ({ request }) => {
    const body = await request.text();
    return HttpResponse.json({ received: body });
  }),
  http.get("https://test.evmcrispr.local/text", () =>
    HttpResponse.text("plain text response"),
  ),
  http.get("https://test.evmcrispr.local/404", () =>
    new HttpResponse(null, { status: 404, statusText: "Not Found" }),
  ),
  http.get("https://test.evmcrispr.local/auth", ({ request }) => {
    const auth = request.headers.get("Authorization");
    return HttpResponse.json({ auth: auth ?? "none" });
  }),
);

describeHelper(
  "@fetch",
  {
    describeName: "Http > helpers > @fetch(url, method?, body?)",
    module: "http",
    cases: [
      {
        name: "should GET and return body as string",
        input: `@fetch("https://test.evmcrispr.local/hello")`,
        expected: '{"greeting":"world"}',
      },
      {
        name: "should return plain text",
        input: `@fetch("https://test.evmcrispr.local/text")`,
        expected: "plain text response",
      },
      {
        name: "should POST with a body",
        input: `@fetch("https://test.evmcrispr.local/echo", POST, "payload")`,
        expected: '{"received":"payload"}',
      },
    ],
    errorCases: [
      {
        name: "should throw on non-2xx status",
        input: `@fetch("https://test.evmcrispr.local/404")`,
        error: "404",
      },
    ],
    sampleArgs: [`"https://test.evmcrispr.local/hello"`, `GET`, `""`, `"Bearer x"`],
  },
  helpers.fetch.argDefs,
);

describeHelper(
  "@fetch",
  {
    describeName: "Http > helpers > @fetch with auth argument",
    module: "http",
    skipArgLengthCheck: true,
    cases: [
      {
        name: "should send Authorization header from auth arg",
        input: `@fetch("https://test.evmcrispr.local/auth", GET, "", "Bearer test-token")`,
        validate: (result) => {
          const parsed = JSON.parse(result);
          expect(parsed.auth).to.equal("Bearer test-token");
        },
      },
    ],
  },
);

describeHelper(
  "@fetch + @json",
  {
    describeName: "Http > helpers > @fetch + @json composability",
    module: "http",
    skipArgLengthCheck: true,
    cases: [
      {
        name: "should compose @json(@fetch(url), path)",
        input: `@json(@fetch("https://test.evmcrispr.local/hello"), "greeting")`,
        expected: "world",
      },
    ],
  },
);
