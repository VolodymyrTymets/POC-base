// Tokens live in localStorage because the ticket asks for it (KAN-13). Any script
// on the page can read them, so this base is only as safe as its XSS posture -
// see ADR-0012. Storage can throw or be empty (private windows, blocked site
// data), so every access is guarded and a failure is logged, not swallowed.
const ACCESS_TOKEN_KEY = 'poc.accessToken';
const REFRESH_TOKEN_KEY = 'poc.refreshToken';

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type Listener = () => void;

const listeners = new Set<Listener>();

const notify = (): void => {
  listeners.forEach((listener) => listener());
};

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error(`Could not read ${key} from localStorage`, error);
    return null;
  }
};

export const getAccessToken = (): string | null => read(ACCESS_TOKEN_KEY);

export const getRefreshToken = (): string | null => read(REFRESH_TOKEN_KEY);

export const setTokens = (tokens: AuthTokens): void => {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  } catch (error) {
    console.error('Could not write the auth tokens to localStorage', error);
  }
  notify();
};

export const clearTokens = (): void => {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Could not clear the auth tokens from localStorage', error);
  }
  notify();
};

// Fires for changes made by this tab and, through the `storage` event, by
// other tabs (a sign-out in one tab signs the others out too).
export const subscribeToTokens = (listener: Listener): (() => void) => {
  listeners.add(listener);
  const onStorage = (event: StorageEvent): void => {
    if (
      event.key === null ||
      event.key === ACCESS_TOKEN_KEY ||
      event.key === REFRESH_TOKEN_KEY
    ) {
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
};
