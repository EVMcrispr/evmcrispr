import type { Token } from './types';
import { KEYWORDS, TokenType } from './types';

const {
  ADDRESS,
  BOOLEAN,
  HEXADECIMAL,
  IDENTIFIER,
  NUMBER,
  STRING,

  NEW_LINE,
  EOF,

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
  #script: string;
  cursor: number;
  start: number;
  column: number;
  #line: number;
  #tokens: Token[];

  constructor(script: string) {
    this.#state = OK;
    this.cursor = this.start = this.column = this.#line = 0;
    this.#tokens = [];
    // Remove anything before/after the scrippt.
    this.#script = script.trim();
  }

  tokenize(): Token[] {
    while (!this.eof()) {
      this.scanToken();
    }

    if (this.#state === ERROR) {
      throw new TokenizerError();
    }

    this.#tokens.push({ type: EOF });
    return this.#tokens;
  }

  scanToken(): void {
    this.column = this.cursor;
    const value = this.#consume();

    switch (value) {
      case '(':
        this.#emitToken(LEFT_PAREN);
        break;
      case ')':
        this.#emitToken(RIGHT_PAREN);
        break;
      case ',':
        this.#emitToken(COMMA);
        break;
      case '.':
        this.#emitToken(DOT);
        break;
      case ':':
        this.#emitToken(COLON);
        break;
      case '@':
        this.#emitToken(AT);
        break;
      case '+':
        this.#emitToken(PLUS);
        break;
      case '-':
        this.#emitToken(MINUS);
        break;
      case '/':
        this.#emitToken(SLASH);
        break;
      case '*':
        this.#emitToken(STAR);
        break;
      case '^':
        this.#emitToken(POWER);
        break;
      case '%':
        this.#emitToken(PERCENTAGE);
        break;
      case '\n':
        this.#emitToken(NEW_LINE);
        this.start = this.cursor;
        this.#line++;

        break;
      case ' ':
      case '\r':
      case '\t':
        break;
      default: {
        this.cursor--;
        // Check for multi-character tokens
        const prevValue = this.#script[Math.max(0, this.cursor - 1)];
        // Check for keyword tokens when not part of a function call
        if (prevValue !== COLON) {
          for (const keywordKey of Object.keys(KEYWORDS)) {
            const tokenValue = this.#match(new RegExp(`^${keywordKey}`));
            if (tokenValue) {
              this.#emitToken(KEYWORDS[keywordKey]);
              return;
            }
          }
        }

        for (const [regexp, tokenType] of TokenizerSpec) {
          const tokenValue = this.#match(regexp);

          if (tokenValue) {
            this.#emitToken(tokenType, tokenValue);
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
    return this.cursor >= this.#script.length;
  }

  /**
   * Get the current character and increase the cursor by 1.
   *
   * @return The current character.
   */
  #consume(): string {
    this.cursor++;

    return this.#script[this.cursor - 1];
  }

  #emitToken(type: TokenType, literal?: string): void {
    this.#tokens.push({ type, literal, position: this.calculatePosition() });
  }

  #match(regexp: RegExp): string {
    const slicedText = this.#script.slice(this.cursor);
    const match = regexp.exec(slicedText);

    if (!match || match.index !== 0) {
      return '';
    }

    this.cursor += match[0].length;

    return match[0];
  }

  calculatePosition(): Required<Token>['position'] {
    return {
      line: this.#line,
      column: Math.max(0, this.column - this.start),
    };
  }

  #report(error: string): void {
    this.#state = TokenizerState.ERROR;
    const { line, column } = this.calculatePosition();
    console.error(`Error (${line + 1}, ${column + 1}): ${error}`);
  }
}

export const tokenize = (script: string): ReturnType<Tokenizer['tokenize']> => {
  const tokenizer = new Tokenizer(script);

  return tokenizer.tokenize();
};
