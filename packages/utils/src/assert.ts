export class AssertionError extends Error {
  override readonly name = 'AssertionError';

  constructor(message: string) {
    super(message);
  }
}

export function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) {
    throw new AssertionError(message);
  }
}

export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Expected value to be defined',
): asserts value is T {
  if (value === null || value === undefined) {
    throw new AssertionError(message);
  }
}

export function assertNever(value: never, message = 'Unexpected value'): never {
  throw new AssertionError(`${message}: ${String(value)}`);
}

export function unreachable(message = 'Unreachable code'): never {
  throw new AssertionError(message);
}
