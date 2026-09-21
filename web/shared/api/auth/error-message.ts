import { CombinedGraphQLErrors } from '@apollo/client';

// Error strings the API throws on purpose (api/src/common/errors.ts).
const KNOWN_MESSAGES: Readonly<Record<string, string>> = {
  INVALID_CREDENTIALS: 'Wrong email or password.',
  EMAIL_ALREADY_REGISTERED: 'This email is already registered.',
  INVALID_RESET_TOKEN: 'This reset link is invalid or has expired.',
};

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

// class-validator failures reach the client as "Bad Request Exception" with the
// real reasons in `extensions.originalError.message` (an array of strings).
const validationReasons = (
  extensions: Record<string, unknown> | undefined,
): string | null => {
  const original = extensions?.originalError;
  if (typeof original !== 'object' || original === null) {
    return null;
  }
  const message: unknown = Reflect.get(original, 'message');
  if (Array.isArray(message) && message.every((m) => typeof m === 'string')) {
    return message.join(' ');
  }
  return null;
};

// `overrides` lets a page reword a known code for its own context, e.g. the
// change-password form says "current password", not "email or password".
export const getAuthErrorMessage = (
  error: unknown,
  overrides: Readonly<Record<string, string>> = {},
): string => {
  if (CombinedGraphQLErrors.is(error)) {
    const [first] = error.errors;
    if (first) {
      return (
        overrides[first.message] ??
        KNOWN_MESSAGES[first.message] ??
        validationReasons(first.extensions) ??
        GENERIC_MESSAGE
      );
    }
  }
  return GENERIC_MESSAGE;
};
