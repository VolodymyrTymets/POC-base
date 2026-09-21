import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { AccountQuery } from '@web/shared/api/auth/queries';
import {
  getAccessToken,
  setTokens,
  subscribeToTokens,
  type AuthTokens,
} from '@web/shared/api/auth/token-storage';
import { useQuery } from '@web/shared/api/react';
import { session, signedOutRedirect } from '../apollo';

type SessionValue = {
  isSignedIn: boolean;
  email: string | null;
  // false when the browser refused to store the tokens
  completeSignIn: (tokens: AuthTokens) => boolean;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  // The token in storage is the source of truth, so a sign-out anywhere (the
  // header, a failed refresh, another tab) flips this without extra plumbing.
  const accessToken = useSyncExternalStore(subscribeToTokens, getAccessToken);
  const isSignedIn = accessToken !== null;

  useEffect(() => {
    signedOutRedirect.current = () => navigate('/sign-in', { replace: true });
    return () => {
      signedOutRedirect.current = null;
    };
  }, [navigate]);

  const { data } = useQuery(AccountQuery, { skip: !isSignedIn });

  const completeSignIn = useCallback(
    (tokens: AuthTokens): boolean => setTokens(tokens),
    [],
  );

  const value = useMemo<SessionValue>(
    () => ({
      isSignedIn,
      email: isSignedIn ? (data?.account.AccountProfile?.email ?? null) : null,
      completeSignIn,
      signOut: session.signOut,
    }),
    [isSignedIn, data, completeSignIn],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside <SessionProvider>');
  }
  return value;
}
