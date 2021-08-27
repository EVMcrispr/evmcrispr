function defineNonEnumerable(instance: object, name: string, value: any) {
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
  constructor(message = "An unexpected error happened.", options: ErrorOptions = {}) {
    super(message);
    // We define these as non-enumarable to prevent them
    // from appearing with the error in the console.
    defineNonEnumerable(this, "name", options.code || this.constructor.name);
    defineNonEnumerable(this, "code", options.name || this.constructor.name);
  }
}

/**
 * The resource doesn’t seem to be valid.
 * @category Error
 */
export class ErrorInvalid extends ErrorException {
  constructor(
    message = "The resource doesn’t seem to be valid.",
    { code = "ErrorInvalid", name = "ErrorInvalid" }: ErrorOptions = {}
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
    message = "The resource couldn’t be found.",
    { code = "ErrorNotFound", name = "ErrorNotFound" }: ErrorOptions = {}
  ) {
    super(message, { code, name });
  }
}
