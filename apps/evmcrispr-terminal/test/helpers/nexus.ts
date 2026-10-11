/** A stand-in for the Nexus chat-completions endpoint: each request takes
 *  the next scripted answer, streamed as the OpenAI-compatible API does. */
export type Answer =
  | { text: string }
  | { tool: string; input: Record<string, unknown> };

const chunk = (delta: unknown, finish: string | null = null) =>
  `data: ${JSON.stringify({
    id: "cmpl-1",
    object: "chat.completion.chunk",
    created: 1,
    model: "test",
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;

export function sse(answer: Answer, n = 0): string {
  const body =
    "text" in answer
      ? chunk({ role: "assistant", content: answer.text }) + chunk({}, "stop")
      : chunk({
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: `call_${n}`,
              type: "function",
              function: {
                name: answer.tool,
                arguments: JSON.stringify(answer.input),
              },
            },
          ],
        }) + chunk({}, "tool_calls");
  return `${body}data: [DONE]\n\n`;
}

/** Replaces `fetch`: completions are answered from `answers`, in order;
 *  everything else gets an empty 404. `requests` keeps what was sent. */
export function fakeNexus() {
  const real = globalThis.fetch;
  const nexus = {
    answers: [] as Answer[],
    requests: [] as { messages: { role: string; content: unknown }[] }[],
    /** Holds every answer back until called (a turn in flight). */
    gate: null as Promise<void> | null,
    restore: () => {
      globalThis.fetch = real;
    },
  };
  let n = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.endsWith("/chat/completions"))
      return new Response("{}", { status: 404 });
    nexus.requests.push(JSON.parse(String(init?.body)));
    await nexus.gate;
    const answer = nexus.answers.shift() ?? { text: "Done." };
    return new Response(sse(answer, n++), {
      headers: { "Content-Type": "text/event-stream" },
    });
  }) as typeof fetch;
  return nexus;
}
