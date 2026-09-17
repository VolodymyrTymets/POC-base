---
description: NestJS-specific mechanics on top of backend-nestjs - modules, DI, ValidationPipe, exception filters, guards, interceptors, Swagger, testing module.
paths:
  - "nest-cli.json"
  - "**/*.module.ts"
  - "**/*.controller.ts"
  - "**/*.service.ts"
  - "**/*.resolvers.ts"
  - "**/*.guard.ts"
  - "**/*.interceptor.ts"
  - "**/*.filter.ts"
  - "**/*.pipe.ts"
  - "**/*.decorator.ts"
  - "**/main.ts"
---

# NestJS mechanics

Read `backend-nestjs.md` first — this file only adds what is specific to Nest.
- resolvers: responsible for mapping GraphQL queries to service methods
- controllers: responsible for mapping HTTP requests to service methods
- services: business logic
- guards: authorization
- interceptors: logging,