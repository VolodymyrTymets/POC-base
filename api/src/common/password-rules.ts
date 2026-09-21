// bcrypt hashes a password of only NUL bytes exactly like the empty string, so
// control characters are rejected outright instead of relying on bcrypt's handling.
export const NO_CONTROL_CHARACTERS = /^\P{Cc}*$/u;
