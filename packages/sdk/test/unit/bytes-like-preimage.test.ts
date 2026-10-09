import { describe, expect, it } from "bun:test";
import { requireBytesLike, wordPreimageHint } from "../../src/onchain/compile";

/**
 * A bytes consumer never takes a word.
 *
 * An address is 32 bytes under `abi.encode` and 20 under `abi.encodePacked`,
 * so a face that accepted one would have to pick, and its digest or length
 * would be wrong for whoever meant the other. The refusal names both spellings
 * instead, which is what these cases pin.
 */

const refusal = (fn: () => void): string => {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected a refusal, but the operand was accepted");
};

describe("requireBytesLike", () => {
  it("accepts a string and a bytes return", () => {
    requireBytesLike({ outputs: [{ type: "string" }] }, "hash!");
    requireBytesLike({ outputs: [{ type: "bytes" }] }, "hash!");
  });

  it("accepts a lens that selects a bytes value out of several returns", () => {
    requireBytesLike(
      {
        outputs: [{ type: "uint256" }, { type: "bytes" }],
        path: [1],
        terminal: { type: "bytes" },
      },
      "hash!",
    );
  });

  for (const type of ["address", "uint256", "bytes32", "bool", "int24"]) {
    it(`refuses a ${type} return and offers both of its byte forms`, () => {
      const message = refusal(() =>
        requireBytesLike({ outputs: [{ type }] }, "bytes.len!"),
      );
      expect(message).toBe(
        `@bytes.len! needs a string or bytes value, got ${type}. ` +
          `It has two byte forms, so name one: @abi.encode!("${type}" …) for the 32-byte ABI word, ` +
          `or @abi.encodePacked!("${type}" …) for the packed bytes.`,
      );
    });
  }

  it("judges the lens terminal, not the first return", () => {
    const message = refusal(() =>
      requireBytesLike(
        {
          outputs: [{ type: "bytes" }, { type: "address" }],
          path: [1],
          terminal: { type: "address" },
        },
        "hash!",
      ),
    );
    expect(message).toContain("got address.");
  });

  it("asks for a lens before judging the type of several returns", () => {
    const message = refusal(() =>
      requireBytesLike(
        { outputs: [{ type: "bytes" }, { type: "bytes" }] },
        "hash!",
      ),
    );
    expect(message).toBe(
      "@hash! needs a single string or bytes return value; select one with a lens",
    );
  });
});

describe("wordPreimageHint", () => {
  it("offers only the ABI encoding for arrays and tuples, which have no packed face", () => {
    for (const type of ["uint256[]", "address[3]", "(uint256,address)"]) {
      const hint = wordPreimageHint(type);
      expect(hint).toBe(
        `Its bytes are its ABI encoding: write @abi.encode!("${type}" …).`,
      );
      expect(hint).not.toContain("encodePacked");
    }
  });

  it("spells both examples inside the face that consumes the bytes", () => {
    const inHash = (call: string) => `@hash!(${call} bytes)`;
    expect(wordPreimageHint("address", inHash)).toBe(
      'It has two byte forms, so name one: @hash!(@abi.encode!("address" …) bytes) for the 32-byte ABI word, ' +
        'or @hash!(@abi.encodePacked!("address" …) bytes) for the packed bytes.',
    );
    expect(wordPreimageHint("uint256[]", inHash)).toBe(
      'Its bytes are its ABI encoding: write @hash!(@abi.encode!("uint256[]" …) bytes).',
    );
  });

  it("leaves the type open when the operand does not carry one", () => {
    expect(wordPreimageHint()).toContain('@abi.encode!("<type>" …)');
  });
});
