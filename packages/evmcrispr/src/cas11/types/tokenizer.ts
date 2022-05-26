export enum TokenType {
  KEYWORD = 'KEYWORD',

  // Literal tokens
  IDENTIFIER = 'IDENTIFIER',
  BOOLEAN = 'BOOLEAN',
  NUMBER = 'NUMBER',
  HEXADECIMAL = 'HEXADECIMAL',
  ADDRESS = 'ADDRESS',
  STRING = 'STRING',
  PUNTUATION = 'PUNTUATION',

  // Keyword tokens
  AS = 'AS',
  LOAD = 'LOAD',
  SWITCH = 'SWITCH',
  SET = 'SET',

  // Punctuation tokens

  // Single-chraracter tokens
  LEFT_PAREN = 'LEFT_PAREN',
  RIGHT_PAREN = 'RIGHT_PAREN',
  COMMA = 'COMMA',
  DOT = 'DOT',
  COLON = 'COLON',
  AT = 'AT',
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  SLASH = 'SLASH',
  STAR = 'STAR',
  POWER = 'POWER',
  PERCENTAGE = 'PERCENTAGE',
  NEW_LINE = 'NEW_LINE',
  EOF = 'EOF',
}

export const KEYWORDS: Record<string, TokenType> = {
  as: TokenType.AS,
  load: TokenType.LOAD,
  switch: TokenType.SWITCH,
  set: TokenType.SET,
};

export enum KeywordValue {
  AS = 'as',
  LOAD = 'load',
  SWITCH = 'switch',
  SET = 'set',
}

export enum PunctuationValue {
  LEFT_PAREN = '(',
  RIGHT_PAREN = ')',
  COMMA = ',',
  DOT = '.',
  COLON = ':',
  AT = '@',
  PLUS = '+',
  MINUS = '-',
  SLASH = '/',
  STAR = '*',
  POWER = '^',
  PERCENTAGE = '%',
  NEW_LINE = '\n',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  literal?: string;
  position?: {
    line: number;
    column: number;
  };
}
