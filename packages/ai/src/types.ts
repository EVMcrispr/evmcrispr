/** What a tool call left to show in the chat. Display only: it is what the
 *  tool reported, kept with the chat, and nothing is decided from it. */
export type ChatToolArtifact =
  | {
      kind: "script-change";
      ok: boolean;
      valid?: boolean;
      diagnosticsCount?: number;
      /** What the change does and why, as the model put it. */
      explanation?: string;
      /** The script it landed in, for a host with several. */
      space?: string;
      error?: string;
    }
  | {
      kind: "validation";
      valid: boolean;
      diagnosticsCount: number;
    }
  | {
      /** The host did not run the call: it needs the user's word first
       *  (to use the web, or to edit the script `space`). The host shows
       *  the question; the answer is the user's, never the model's. */
      kind: "permission";
      what: "web" | "edit";
      space?: string;
    }
  | {
      kind: "simulation";
      success: boolean;
      actionCount: number;
      error?: string;
      /** The script itself, or a snippet the model wrote. Absent on
       *  simulations saved before cards showed what ran. */
      target?: "script" | "snippet";
      /** The code that ran. */
      code?: string;
      /** Its output, the last lines of it. */
      logs?: string[];
      /** For `script`: the recorded revision it ran against, if it was one. */
      revisionId?: string;
    };

export type ChatItem =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | {
      role: "tool";
      text: string;
      toolCallId?: string;
      phase?: "call" | "result" | "error";
      artifact?: ChatToolArtifact;
      error?: string;
    };
