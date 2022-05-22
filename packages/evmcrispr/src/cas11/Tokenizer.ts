import type { KeywordToken, PunctuationToken, Token } from './types';
import { KeywordValue, PunctuationValue, TokenType } from './types';

const {
  LEFT_PAREN,
  RIGHT_PAREN,
  COMMA,
  DOT,
  COLON,
  AT,
  PLUS,
  MINUS,
  SLASH,
  STAR,
  POWER,
  PERCENTAGE,
} = PunctuationValue;
const {
  ADDRESS,
  BOOLEAN,
  HEXADECIMAL,
  IDENTIFIER,
  KEYWORD,
  NUMBER,
  PUNTUATION,
  STRING,
} = TokenType;

export enum TokenizerState {
  OK = 'OK',
  ERROR = 'ERROR',
}

export class TokenizerError extends Error {
  constructor(message = 'Errors encountered while tokenizing source') {
    super(message);
  }
}

const { OK, ERROR } = TokenizerState;

const TokenizerSpec: [RegExp, TokenType][] = [
  [/^0x[a-fA-F0-9]{40}(?=\s|:|,|$)/, ADDRESS],
  [/^0x[0-9a-f]+/, HEXADECIMAL],
  [/^(?:tru|fals)e/, BOOLEAN],
  [/^(\d+(?:\.\d*)?)(?:e(\d+))?(mo|s|m|h|d|w|y)?/, NUMBER],
  [/^"[^"]*"/, STRING],
  [/^'[^']*'/, STRING],
  [/^(\$?(?!-)[a-zA-Z-]{1,63}(?<!-))/, IDENTIFIER],
];

export class Tokenizer {
  #state: TokenizerState;
  #cursor: number;
  #tokens: Token[];
  #script: string;

  constructor(script: string) {
    this.#state = OK;
    this.#cursor = 0;
    this.#tokens = [];
    this.#script = script;
  }

  scan(): Token[] {
    while (!this.eof()) {
      this.scanToken();
    }

    if (this.#state === ERROR) {
      throw new TokenizerError();
    }

    return this.#tokens;
  }

  scanToken(): void {
    const value = this.#peek();

    switch (value) {
      case LEFT_PAREN:
      case RIGHT_PAREN:
      case COMMA:
      case DOT:
      case COLON:
      case AT:
      case PLUS:
      case MINUS:
      case SLASH:
      case STAR:
      case POWER:
      case PERCENTAGE:
        // case HYPHEN:
        this.#consume();
        this.#emitToken({
          type: PUNTUATION,
          value,
        } as PunctuationToken);
        break;
      case ' ':
      case '\r':
      case '\n':
      case '\t':
        this.#consume();
        break;
      default: {
        // Check for multi-character tokens

        const prevValue = this.#script[Math.max(0, this.#cursor - 1)];
        // Check for keyword tokens when not part of a function call
        if (prevValue !== COLON) {
          for (const keyword of Object.values(KeywordValue)) {
            const tokenValue = this.#match(
              new RegExp(`^${keyword}`),
            ) as KeywordValue;
            if (tokenValue) {
              this.#emitToken<KeywordToken>({
                type: KEYWORD,
                value: tokenValue,
              });
              return;
            }
          }
        }

        for (const [regexp, tokenType] of TokenizerSpec) {
          const tokenValue = this.#match(regexp);

          if (tokenValue) {
            this.#emitToken({ type: tokenType, value: tokenValue });
            return;
          }
        }

        // No matches for specific character so consume it and report error
        this.#consume();
        this.#report(`Unexpected character "${value}"`);
      }
    }
  }

  /**
   * Returns true if we've reached the end of source, otherwise false.
   *
   * @return A boolean indicating the end of source.
   */
  eof(): boolean {
    return this.#cursor >= this.#script.length;
  }

  /**
   * Get the current character and increase the cursor by 1.
   *
   * @return The current character.
   */
  #consume(): string {
    this.#cursor++;

    return this.#script[this.#cursor - 1];
  }

  #peek(): string {
    return this.#script[this.#cursor];
  }

  #emitToken<T extends Token>(token: T): void {
    this.#tokens.push(token);
  }

  #match(regexp: RegExp): string {
    const slicedText = this.#script.slice(this.#cursor);
    const match = regexp.exec(slicedText);

    if (!match || match.index !== 0) {
      return '';
    }

    this.#cursor += match[0].length;

    return match[0];
  }

  #report(error: string): void {
    this.#state = TokenizerState.ERROR;
    console.error(`Error (${this.#cursor}): ${error}`);
  }
}

export const tokenize = (script: string): ReturnType<Tokenizer['scan']> => {
  const tokenizer = new Tokenizer(script);

  return tokenizer.scan();
};
