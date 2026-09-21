import { createApolloClient } from '@web/shared/api/apollo-client';

const uri: unknown = import.meta.env.VITE_GRAPHQL_URL;
if (typeof uri !== 'string' || uri === '') {
  // Fail loudly at start-up: every call would otherwise go to the wrong place.
  throw new Error('VITE_GRAPHQL_URL is not set (see .env.development.example)');
}

// The router does not exist yet when the client is built, so SessionProvider
// registers the redirect to Sign in here once it has `navigate`.
export const signedOutRedirect: { current: (() => void) | null } = {
  current: null,
};

export const { client, session } = createApolloClient({
  uri,
  onSignedOut: () => signedOutRedirect.current?.(),
});
