import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';

import { BullModule } from '@nestjs/bullmq';
import { SentryModule } from '@sentry/nestjs/setup';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { MigrationsModule } from './migrations/migrations.module';

import { NotifierModule } from './notifier/notifier.module';
import { AuthModule } from './auth/auth.module';
import { AccountProfileModule } from './account-profile/account-profile.module';
import { AccountModule } from './account/account.module';
import { AccountRoleModule } from './account-role/account-role.module';
import { FilesModule } from './files/files.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SentryModule.forRoot(),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), './schema.gql'),
      context: (context) =>
        context?.extra?.request
          ? {
              req: {
                ...context?.extra?.request,
                headers: {
                  ...context?.extra?.request?.headers,
                  ...context?.connectionParams,
                },
              },
            }
          : { req: context?.req },
    }),
    BullModule.forRoot({
      connection: {
        port: parseInt(process.env.REDIS_PORT as string, 10),
        host: process.env.REDIS_HOST,
      },
      defaultJobOptions: {
        attempts: 3,
        removeOnComplete: true,
      },
    }),
    PrismaModule,
    MigrationsModule,
    AuthModule,
    NotifierModule,
    AccountProfileModule,
    AccountModule,
    AccountRoleModule,
    FilesModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    AppService,
  ],
})
export class AppModule {}
