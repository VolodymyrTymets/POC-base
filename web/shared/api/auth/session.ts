import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { RefreshTokenMutation, SignOutMutation } from './mutations';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
  type AuthTokens,
} from './token-storage';

export type SessionOptions = {
  uri: string;
  // Runs after the tokens are cleared, however the sign-out started. The app
  // registers the redirect to Sign in here, so this package does not depend on
  // the router.
  onSignedOut: () => void;
};

export type Session = {
  refresh: () => Promise<AuthTokens>;
  signOut: () => Promise<void>;
};

export const createSession = ({ uri, onSignedOut }: SessionOptions): Session => {
  // WHY a separate client: refresh and sign-out must not pass through the main
  // client's error link, or a failing refresh would try to refresh itself.
  const bareClient = new ApolloClient({
    link: new HttpLink({ uri }),
    cache: new InMemoryCache(),
  });

  const signOut = async (): Promise<void> => {
    const accessToken = getAccessToken();
    try {
      if (accessToken) {
        await bareClient.mutate({
          mutation: SignOutMutation,
          context: { headers: { authorization: `Bearer ${accessToken}` } },
          fetchPolicy: 'no-cache',
        });
      }
    } catch (error) {
      // Expected after a failed refresh: the access token is already dead, so
      // the server cannot invalidate anything. The session is still cleared.
      console.error('signOut mutation failed, clearing the session anyway', error);
    } finally {
      clearTokens();
      onSignedOut();
    }
  };

  const requestNewTokens = async (): Promise<AuthTokens> => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      await signOut();
      throw new Error('No refresh token stored');
    }
    try {
      // The API reads the refresh token from this header, not from Authorization.
      const { data } = await bareClient.mutate({
        mutation: RefreshTokenMutation,
        context: { headers: { 'x-refresh-token': refreshToken } },
        fetchPolicy: 'no-cache',
      });
      if (!data) {
        throw new Error('refreshToken returned no data');
      }
      const tokens: AuthTokens = {
        accessToken: data.refreshToken.accessToken,
        refreshToken: data.refreshToken.refreshToken,
      };
      if (!setTokens(tokens)) {
        throw new Error('Could not store the refreshed tokens');
      }
      return tokens;
    } catch (error) {
      await signOut();
      throw error;
    }
  };

  // One refresh at a time: several calls failing together share the same
  // request, so the API sees a single rotation of the refresh token.
  let inflightRefresh: Promise<AuthTokens> | null = null;
  const refresh = (): Promise<AuthTokens> => {
    inflightRefresh ??= requestNewTokens().finally(() => {
      inflightRefresh = null;
    });
    return inflightRefresh;
  };

  return { refresh, signOut };
};
