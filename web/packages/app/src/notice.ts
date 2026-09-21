// A one-shot message for the Sign in page. Password changes and resets end the
// session (the API clears the refresh token, ADR-0011), and the redirect to
// Sign in happens inside the sign-out process, which cannot carry router state.
let pendingNotice: string | null = null;

export const setSignInNotice = (message: string): void => {
  pendingNotice = message;
};

export const takeSignInNotice = (): string | null => {
  const message = pendingNotice;
  pendingNotice = null;
  return message;
};
