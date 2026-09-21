// UX-only checks that mirror the API's input rules (api/src/auth/dto/*.ts and
// api/src/common/password-rules.ts). The API stays the authority; these only
// save a round trip.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_BYTES = 8;
const MAX_PASSWORD_BYTES = 72;

// bcrypt reads at most 72 bytes, so the limit is in bytes, not characters.
const byteLength = (value: string): number =>
  new TextEncoder().encode(value).length;

export const validateEmail = (email: string): string | null => {
  const trimmed = email.trim();
  if (trimmed.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(trimmed)) {
    return 'Enter a valid email address.';
  }
  return null;
};

export const validateNewPassword = (password: string): string | null => {
  const bytes = byteLength(password);
  if (bytes < MIN_PASSWORD_BYTES || bytes > MAX_PASSWORD_BYTES) {
    return `Password must be ${MIN_PASSWORD_BYTES} to ${MAX_PASSWORD_BYTES} bytes long.`;
  }
  return null;
};
