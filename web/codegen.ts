import 'dotenv/config';
import type { CodegenConfig } from '@graphql-codegen/cli';

// WHY client-preset instead of the ticket's typescript-react-apollo: that
// plugin's generated hooks are not compatible with Apollo Client 4.x, which
// is what installs today (verified via Context7 + npm during planning —
// see docs/decisions/ADR-0008-web-app-scaffold.md).
//
// WHY a local schema file instead of live introspection: decouples web/
// verification from api/'s docker/DB stack, which docs/RUNBOOK.md documents
// as having several pre-existing, unrelated setup issues.
const schemaPath = process.env.GRAPHQL_SCHEMA_PATH ?? '../api/schema.gql';

const config: CodegenConfig = {
  schema: schemaPath,
  documents: ['shared/api/**/*.ts', '!shared/api/generated/**'],
  ignoreNoDocuments: false,
  generates: {
    'shared/api/generated/': {
      preset: 'client',
    },
  },
};

export default config;
