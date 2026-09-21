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
import { getAccessToken, subscribeToTokens } from './auth/token-storage';

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

type GraphQLErrors = ReadonlyArray<{
  message: string;
  extensions?: Record<string, unknown>;
}>;

const hasRejectedToken = (errors: GraphQLErrors | undefined): boolean =>
  errors?.some(
    (graphQLError) =>
      graphQLError.extensions?.code === 'UNAUTHENTICATED' &&
      graphQLError.message === UNAUTHORIZED_MESSAGE,
  ) ?? false;

const isRefreshable = (operationName: string | undefined): boolean =>
  !(operationName && AUTH_OPERATION_NAMES.has(operationName));

const isRejectedAccessToken = (
  error: unknown,
  operationName: string | undefined,
): boolean =>
  isRefreshable(operationName) &&
  CombinedGraphQLErrors.is(error) &&
  hasRejectedToken(error.errors);

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

  const session = createSession({ uri, onSignedOut });

  // A cached `account` result must not outlive the session it belongs to, in
  // this tab or (through the storage event) any other: clear the cache when a
  // session starts or ends. A token *rotation* keeps a session, so it keeps the
  // cache too.
  let hadSession = getAccessToken() !== null;
  subscribeToTokens(() => {
    const hasSession = getAccessToken() !== null;
    if (hasSession !== hadSession) {
      hadSession = hasSession;
      client.clearStore().catch((error: unknown) => {
        console.error('Could not clear the Apollo cache', error);
      });
    }
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
      let cancelled = false;
      let retry: { unsubscribe: () => void } | undefined;
      session.refresh().then(
        () => {
          if (cancelled) {
            return;
          }
          retry = forward(operation).subscribe({
            next: (result) => {
              // A fresh token that is rejected too (account removed, ...) means
              // the session is unusable: end it instead of leaving the user in
              // a signed-in-looking page that errors on every call.
              if (hasRejectedToken(result.errors)) {
                void session.signOut();
              }
              subscriber.next(result);
            },
            error: (retryError: unknown) => subscriber.error(retryError),
            complete: () => subscriber.complete(),
          });
        },
        // The session already signed the user out; surface the original error.
        () => subscriber.error(error),
      );
      return () => {
        cancelled = true;
        retry?.unsubscribe();
      };
    });
  });

  const client = new ApolloClient({
    cache,
    link: ApolloLink.from([refreshLink, authLink, new HttpLink({ uri })]),
  });

  return { client, session };
};
