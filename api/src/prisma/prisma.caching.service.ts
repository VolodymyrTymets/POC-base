import { Injectable, OnModuleInit } from '@nestjs/common';
import KeyvRedis from 'ioredis';
import { PrismaClient } from 'generated/prisma/client';
import { PrismaExtensionRedis } from 'prisma-extension-redis';
import { config as cachingConfig } from './prisma.caching';
import { PrismaAdapterFactory } from './prisma.adapter.factory';

export type PrismaCashingConfig = { withRedis: boolean };
export interface IPrismaFactory {
  create: (config: PrismaCashingConfig) => PrismaClient;
}

@Injectable()
export class PrismaCashingService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({
      adapter: new PrismaAdapterFactory().create(),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  create(): PrismaClient {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    return this.$extends(
      PrismaExtensionRedis({
        config: cachingConfig,
        client: new KeyvRedis(
          `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
        ),
      }),
    );
  }
}
