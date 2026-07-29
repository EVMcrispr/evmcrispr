import type {
  Action,
  CommandExpressionNode,
  HelperFunctionNode,
  Node,
} from "./types";

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
    message = "An unexpected error happened.",
    options: ErrorOptions = {},
  ) {
    super(message);
    // We define these as non-enumarable to prevent them
    // from appearing with the error in the console.
    defineNonEnumerable(this, "name", options.name || this.constructor.name);
    defineNonEnumerable(this, "code", options.code || this.constructor.name);
  }
}

/**
 * The resource doesn’t seem to be valid.
 * @category Error
 */
export class ErrorInvalid extends ErrorException {
  constructor(
    message = "The resource doesn't seem to be valid.",
    { code = "ErrorInvalid", name = "ErrorInvalid" }: ErrorOptions = {},
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
    { code = "ErrorNotFound", name = "ErrorNotFound" }: ErrorOptions = {},
  ) {
    super(message, { code, name });
  }
}

/**
 * The requested module/command/helper/option is experimental and
 * `VITE_PUBLIC_EXPERIMENTAL` is not enabled.
 * @category Error
 */
export class ExperimentalDisabledError extends ErrorException {
  constructor(
    message = "This feature is experimental and not enabled.",
    {
      code = "ExperimentalDisabledError",
      name = "ExperimentalDisabledError",
    }: ErrorOptions = {},
  ) {
    super(message, { code, name });
  }
}

export class ErrorConnection extends ErrorException {
  constructor(
    message = "An error happened while communicating with a remote server.",
    { code = "ErrorConnection", name = "ErrorConnection" }: ErrorOptions = {},
  ) {
    super(message, { code, name });
  }
}

export class ErrorUnexpectedResult extends ErrorException {
  constructor(
    message = "The resource doesn’t correspond to the expected result.",
    {
      code = "ErrorUnexpectedResult",
      name = "ErrorUnexpectedResult",
    }: ErrorOptions = {},
  ) {
    super(message, { code, name });
  }
}

export class NodeError extends ErrorException {
  constructor(
    nodeName: string,
    { loc }: Node,
    msg: string,
    { code = "NodeError", name = "NodeError" }: ErrorOptions = {},
  ) {
    let location = "";
    if (loc) {
      const { start, end } = loc;
      location = `${start.line}:${start.col},${end.line}:${end.col}`;
    }
    super(`${nodeName}(${location}): ${msg}`, { code, name });
  }
}
export class CommandError extends NodeError {
  constructor(
    c: CommandExpressionNode,
    msg = "an error happened while executing the command",
    { code = "CommandError", name = "CommandError" }: ErrorOptions = {},
  ) {
    const commandName = `${c.module ? `${c.module}:` : ""}${c.name}`;
    super(commandName, c, msg, { code, name });
  }
}

export class HelperFunctionError extends NodeError {
  constructor(
    h: HelperFunctionNode,
    msg = "an error happened while executing the helper",
    {
      code = "HelperFunctionError",
      name = "HelperFunctionError",
    }: ErrorOptions = {},
  ) {
    super(`@${h.name}`, h, msg, { code, name });
  }
}

export class ExpressionError extends NodeError {
  constructor(
    n: Node,
    message = "an error happened with an expression",
    { code = "ExpressionError", name = "ExpressionError" }: ErrorOptions = {},
  ) {
    super(name, n, message, { code, name });
  }
}

/**
 * A blockchain transaction revert carrying the raw ABI-encoded revert data.
 * Used by error capture (`-!>` / `-?!>`) to decode revert reasons and custom errors.
 * @category Error
 */
export class RevertError extends ErrorException {
  revertData: `0x${string}` | undefined;
  constructor(message: string, revertData?: `0x${string}`) {
    super(message, { name: "RevertError", code: "RevertError" });
    this.revertData = revertData;
  }
}

/**
 * Base class for interpreter control-flow signals (`exit`, `loop break`,
 * `loop continue`, `def return`). Not errors — they unwind interpretation
 * to the construct that handles them. The interpreter re-throws them
 * untouched instead of wrapping them in a `CommandError`.
 * @category Error
 */
export class ControlFlowSignal extends ErrorException {
  /** Actions the interrupted block(s) produced before the signal, collected
   *  while unwinding so the construct that catches the signal can still
   *  return them (execution mode has already streamed them through the
   *  action callback; collection mode would otherwise lose them). */
  actions: Action[] = [];
}

/**
 * Thrown by the `exit` command to cleanly stop script execution.
 * Signals an intentional early stop, never caught by loops or defs.
 * @category Error
 */
export class ExitSignal extends ControlFlowSignal {
  constructor(
    message?: string,
    { code = "ExitSignal", name = "ExitSignal" }: ErrorOptions = {},
  ) {
    super(message ?? "Script execution stopped by exit.", { code, name });
  }
}

/**
 * Thrown by `loop break`; caught by the nearest enclosing `loop`.
 * @category Error
 */
export class BreakSignal extends ControlFlowSignal {
  constructor(
    message?: string,
    { code = "BreakSignal", name = "BreakSignal" }: ErrorOptions = {},
  ) {
    super(message ?? '"loop break" can only be used inside a loop block', {
      code,
      name,
    });
  }
}

/**
 * Thrown by `loop continue`; caught by the nearest enclosing `loop`.
 * @category Error
 */
export class ContinueSignal extends ControlFlowSignal {
  constructor(
    message?: string,
    { code = "ContinueSignal", name = "ContinueSignal" }: ErrorOptions = {},
  ) {
    super(message ?? '"loop continue" can only be used inside a loop block', {
      code,
      name,
    });
  }
}

/**
 * Thrown by `def return`; caught by the enclosing def command body.
 * @category Error
 */
export class ReturnSignal extends ControlFlowSignal {
  constructor(
    message?: string,
    { code = "ReturnSignal", name = "ReturnSignal" }: ErrorOptions = {},
  ) {
    super(
      message ?? '"def return" can only be used inside a def command body',
      { code, name },
    );
  }
}
