import {
  ApolloClient,
  ApolloLink,
  CombinedGraphQLErrors,
  HttpLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';
import { ErrorLink } from '@apollo/client/link/error';
import { createSession, type Session } from './auth/session';
import { getAccessToken } from './auth/token-storage';

// The API answers a wrong password (INVALID_CREDENTIALS), a bad reset token
// (INVALID_RESET_TOKEN) and an expired access token with the same
// `extensions.code: UNAUTHENTICATED` (measured in KAN-13, R0). These operations
// never carry an access token that could be refreshed, so they are never retried.
const AUTH_OPERATION_NAMES: ReadonlySet<string> = new Set([
  'SignIn',
  'SignUp',
  'RestorePassword',
  'ResetPassword',
  'RefreshToken',
  'SignOut',
]);

// A guard rejecting the token throws a bare UnauthorizedException, message
// "Unauthorized". Anything else (INVALID_CREDENTIALS on changePassword, say)
// is an ordinary error the page must show, not a reason to sign out.
const UNAUTHORIZED_MESSAGE = 'Unauthorized';

const isRejectedAccessToken = (
  error: unknown,
  operationName: string | undefined,
): boolean =>
  !(operationName && AUTH_OPERATION_NAMES.has(operationName)) &&
  CombinedGraphQLErrors.is(error) &&
  error.errors.some(
    (graphQLError) =>
      graphQLError.extensions?.code === 'UNAUTHENTICATED' &&
      graphQLError.message === UNAUTHORIZED_MESSAGE,
  );

export type ApolloClientOptions = {
  uri: string;
  onSignedOut: () => void;
};

export type AuthenticatedApollo = {
  client: ApolloClient;
  session: Session;
};

export const createApolloClient = ({
  uri,
  onSignedOut,
}: ApolloClientOptions): AuthenticatedApollo => {
  const cache = new InMemoryCache();

  const session = createSession({
    uri,
    onSignedOut: () => {
      // A cached `account` result must not outlive the session it belongs to.
      client.clearStore().catch((error: unknown) => {
        console.error('Could not clear the Apollo cache on sign-out', error);
      });
      onSignedOut();
    },
  });

  const authLink = new SetContextLink(({ headers }) => {
    const accessToken = getAccessToken();
    return {
      headers: {
        ...headers,
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
    };
  });

  // Sits before authLink so the retried operation passes through it again and
  // picks the refreshed token up from storage. Apollo retries an operation once
  // per error link, so a second rejection is emitted, not looped.
  const refreshLink = new ErrorLink(({ error, operation, forward }) => {
    if (!isRejectedAccessToken(error, operation.operationName)) {
      return undefined;
    }
    return new Observable<ApolloLink.Result>((subscriber) => {
      let retry: { unsubscribe: () => void } | undefined;
      session.refresh().then(
        () => {
          retry = forward(operation).subscribe(subscriber);
        },
        // The session already signed the user out; surface the original error.
        () => subscriber.error(error),
      );
      return () => retry?.unsubscribe();
    });
  });

  const client = new ApolloClient({
    cache,
    link: ApolloLink.from([refreshLink, authLink, new HttpLink({ uri })]),
  });

  return { client, session };
};
