import { graphql } from '../generated/gql';

export const AccountQuery = graphql(`
  query Account {
    account {
      id
      AccountProfile {
        id
        email
      }
    }
  }
`);
