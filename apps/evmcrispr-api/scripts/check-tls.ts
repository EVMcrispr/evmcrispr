import { createContext, upstream } from "../src/api/common.js";

// The incident checker's fixed public targets, also used by the Rust diagnostic.
const CONTROL = "https://probe-emudhra.we-have-a-problem.com/";
const PROBES = [
  "dv-g3b",
  "dv-g3c",
  "ov-g3b",
  "ov-g3c",
  "ev-g3b",
  "ev-g3c",
  "dv-g3b-aaa",
  "dv-g3c-aaa",
  "ov-g3b-aaa",
  "ov-g3c-aaa",
  "ev-g3b-aaa",
  "ev-g3c-aaa",
  "dv-g3b-noct",
  "dv-g3b-aaa-noct",
];
const ctx = createContext();
type Observation = {
  outcome: "accepted" | "certificate_rejected" | "inconclusive";
  details?: string;
};

async function observe(url: string): Promise<Observation> {
  try {
    // Use the API's own outbound client, with certificate validation enabled.
    const response = await upstream(ctx, url);
    if (response.status !== 200)
      return { outcome: "inconclusive", details: `HTTP ${response.status}` };
    const reader = response.body?.getReader();
    if (!reader) return { outcome: "inconclusive", details: "empty response" };
    let text = "";
    let size = 0;
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192)
          return { outcome: "inconclusive", details: "oversized response" };
        text += decoder.decode(value, { stream: true });
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    return text.includes("Your client successfully connected to the site.")
      ? { outcome: "accepted" }
      : { outcome: "inconclusive", details: "unexpected response" };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "unknown";
    // Timeouts, generic TLS errors and unavailable sites prove nothing.
    return {
      outcome: ["CERT_REVOKED", "CERT_REJECTED", "CERT_UNTRUSTED"].includes(
        code,
      )
        ? "certificate_rejected"
        : "inconclusive",
      details: code,
    };
  }
}

const control = await observe(CONTROL);
const probes = [];
for (let at = 0; at < PROBES.length; at += 4) {
  probes.push(
    ...(await Promise.all(
      PROBES.slice(at, at + 4).map(async (id) => ({
        id,
        ...(await observe(`https://${id}-emudhra.we-have-a-problem.com/`)),
      })),
    )),
  );
}
const verdict = probes.some((probe) => probe.outcome === "accepted")
  ? "vulnerable"
  : control.outcome === "accepted" &&
      probes.every((probe) => probe.outcome === "certificate_rejected")
    ? "rejected"
    : "inconclusive";
console.log(
  JSON.stringify(
    {
      runtime: `Bun ${Bun.version}`,
      source: "https://emudhra.we-have-a-problem.com/",
      control,
      probes,
      verdict,
    },
    null,
    2,
  ),
);
ctx.store.close();
process.exitCode =
  verdict === "rejected" ? 0 : verdict === "vulnerable" ? 1 : 2;
