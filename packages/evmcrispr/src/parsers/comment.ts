// Re-exported from utils.ts to avoid circular dependency.
// comment.ts previously imported optionalWhitespace/endLine from utils.ts,
// while utils.ts imported commentParser from comment.ts.
export { commentParser } from "./utils";
