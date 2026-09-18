import { graphql } from '../generated/gql';

// Structural scaffold only — proves the codegen pipeline generates real,
// typed output end to end. Not imported by any component yet (see
// docs/features/KAN-5/spec.md, Open Questions #1).
export const PingQuery = graphql(`
  query Ping {
    __typename
  }
`);
