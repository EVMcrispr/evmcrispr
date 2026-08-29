import type { LanguageRegistration } from "shiki";
import solidity from "shiki/langs/solidity.mjs";

// Shiki's bundled Solidity grammar, re-exported so hosts that highlight
// EVML with Shiki (the website's expressive-code) can register
// `source.solidity` for `<<<SOL` heredocs. A bundled language is only
// loaded when a code fence names it, and an embedded scope reference does
// not count — so the grammar is registered under its own name, which makes
// the host load it eagerly alongside the EVML grammar.
const embedded: LanguageRegistration[] = solidity.map((lang) => ({
  ...lang,
  name: "solidity-embedded",
  aliases: [],
}));

export default embedded;
