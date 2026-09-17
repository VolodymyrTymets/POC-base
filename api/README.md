## Trukkit API

## Description

Api based on [Nest](https://github.com/nestjs/nest) framework.

## Project setup

```bash
$ yarn install
```

## Compile and run the project
Add ``.env`` file to the root of the project and add the following variables:
see `.env.example` file for more information
After that,
```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev
$ yarn run worker:start:dev

# production mode
$ yarn run start:prod
```
Or run via docker
```bash
$ docker-compose up -d --build
```
> Note: For docker `.env.development` file should be placed in the root of the project and should look like this:
see `.env.development.example` file for more information
> the rest of the variables should be the same as in the `.env` file

## Run tests
The main principle of all tests is to run it with a real data. So, before running tests, we init the database, and clean it after. We use PgLite for keep the database in memory for faster tests runnings. The main utils for preperation and cleaning the database are in the `test/utils/DataCookere.ts` file.
For more information about testing, check out the ``.claude/skills/test-skill.md`` file.
```
To run the tests,
```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

