export type ChatToolArtifact =
  | {
      kind: "script-change";
      ok: boolean;
      valid?: boolean;
      diagnosticsCount?: number;
      revisionId?: string;
      error?: string;
      undone?: boolean;
    }
  | {
      kind: "validation";
      valid: boolean;
      diagnosticsCount: number;
    }
  | {
      kind: "simulation";
      success: boolean;
      actionCount: number;
      error?: string;
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
