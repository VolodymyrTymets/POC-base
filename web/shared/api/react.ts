// The apps do not depend on @apollo/client themselves (it is a dependency of
// this package), so the React bindings they need are re-exported from here.
export { ApolloProvider, useMutation, useQuery } from '@apollo/client/react';
