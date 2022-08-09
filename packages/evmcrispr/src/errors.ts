function defineNonEnumerable(
  instance: Record<string, any>,
  name: string,
  value: any,
) {
  Object.defineProperty(instance, name, { value, enumerable: false });
}

/**
 * An options object
 * @category Error
 */
export type ErrorOptions = {
  /**
   * The error's name.
   */
  name?: string;
  /**
   * The error's code.
   */
  code?: string;
};

/**
 * A general error that denotes something unexpected happened.
 * @category Error
 */
export class ErrorException extends Error {
  constructor(
    message = 'An unexpected error happened.',
    options: ErrorOptions = {},
  ) {
    super(message);
    // We define these as non-enumarable to prevent them
    // from appearing with the error in the console.
    defineNonEnumerable(this, 'name', options.name || this.constructor.name);
    defineNonEnumerable(this, 'code', options.code || this.constructor.name);
  }
}

/**
 * The resource doesn’t seem to be valid.
 * @category Error
 */
export class ErrorInvalid extends ErrorException {
  constructor(
    message = "The resource doesn't seem to be valid.",
    { code = 'ErrorInvalid', name = 'ErrorInvalid' }: ErrorOptions = {},
  ) {
    super(message, { code, name });
  }
}

/**
 * The resource couldn’t be found.
 * @category Error
 */
export class ErrorNotFound extends ErrorException {
  constructor(
    message = "The resource couldn't be found.",
    { code = 'ErrorNotFound', name = 'ErrorNotFound' }: ErrorOptions = {},
  ) {
    super(message, { code, name });
  }
}

export class ErrorConnection extends ErrorException {
  constructor(
    message = 'An error happened while communicating with a remote server.',
    { code = 'ErrorConnection', name = 'ErrorConnection' }: ErrorOptions = {},
  ) {
    super(message, { code, name });
  }
}

export class ErrorUnexpectedResult extends ErrorException {
  constructor(
    message = 'The resource doesn’t correspond to the expected result.',
    {
      code = 'ErrorUnexpectedResult',
      name = 'ErrorUnexpectedResult',
    }: ErrorOptions = {},
  ) {
    super(message, { code, name });
  }
}

export class CommandError extends ErrorException {
  constructor(
    commandName: string,
    message = 'an error happened while executing the command',
    { code = 'CommandError', name = 'CommandError' }: ErrorOptions = {},
  ) {
    super(`${commandName}: ${message}`, { code, name });
  }
}

export class HelperFunctionError extends ErrorException {
  constructor(
    helperName: string,
    message = 'an error happened while executing the helper',
    {
      code = 'HelperFunctionError',
      name = 'HelperFunctionError',
    }: ErrorOptions = {},
  ) {
    super(`@${helperName}: ${message}`, { code, name });
  }
}

export class ExpressionError extends ErrorException {
  constructor(
    message = 'an error happened with an expression',
    { code = 'ExpressionError', name = 'ExpressionError' }: ErrorOptions = {},
  ) {
    super(message, { code, name });
  }
}
