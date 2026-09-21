// Emails are the login identifier for password accounts, so the same address
// must always map to the same stored value (AccountProfile.email is @unique).
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
