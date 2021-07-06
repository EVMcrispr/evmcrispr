function defineNonEnumerable(instance: object, name: string, value: any) {
  Object.defineProperty(instance, name, { value, enumerable: false });
}

type ErrorOptions = {
  name?: string;
  code?: string;
};

export class ErrorException extends Error {
  constructor(message = "An unexpected error happened.", options: ErrorOptions = {}) {
    super(message);
    // We define these as non-enumarable to prevent them
    // from appearing with the error in the console.
    defineNonEnumerable(this, "name", options.code || this.constructor.name);
    defineNonEnumerable(this, "code", options.name || this.constructor.name);
  }
}

export class ErrorInvalidIdentifier extends ErrorException {
  constructor(identifier = "", options: ErrorOptions = {}) {
    super(`Invalid identifier ${identifier}`, options);
  }
}
export class ErrorAppNotFound extends ErrorException {
  constructor(app = "", options: ErrorOptions = {}) {
    super(`App ${app} not found`, options);
  }
}

export class ErrorMethodNotFound extends ErrorException {
  constructor(method = "", app = "", options: ErrorOptions = {}) {
    super(`Method ${method} not found in app ${app}`, options);
  }
}
