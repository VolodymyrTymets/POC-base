---
description: NestJS Graph QL resolvers name convention.
paths:
  - "**/*.resolvers.ts"
---

# NestJS mechanics

Read `api-graphql.md` first — this file only adds what is specific to Resolvers.
- each Query name fallows the patterns:
  - `<EntityName>` - for a single entity
    - parameters:
      - id: required – entity id  
  - `<EntityName>s` - for a list of entities
    - parameters:
      - pagination: required - PaginationInput
      - filter: optional - FilterInput
      - search: optional - SearchInput
      - sort: optional - SortingInput[]
  - `<EntityName>sById` - for a list of entities by id
    - parameters:
        - ids: required - [id]! - array of ids
        - rest of the parameters for a list of entities
  - `<EntityName><edgecases>` - for rest of the cases
- each Mutation name follows the pattern
  - `create<EntityName>` - for creating a new entity
    - parameters:
      - input: required - Create<EntityName>Input
  - `update<EntityName>` - for updating an existing entity
    - parameters:
      - id: required – entity id
      - input: required - Update<EntityName>Input
  - `delete<EntityName>` - for deleting an existing entity
    - parameters:
      - id: required – entity id 
- each Mutation returns the updated entity
