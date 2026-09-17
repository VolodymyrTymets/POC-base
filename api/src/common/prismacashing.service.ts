import {
  IPrismaFactory,
  PrismaCashingConfig,
} from '../prisma/prisma.caching.service';
import { PrismaClient } from 'generated/prisma/client';
import { GraphQLResolveInfo } from 'graphql/type';

export class PrismaCashingService {
  protected prismaWithRedisService: PrismaClient;
  protected prismaWithoutRedisService: PrismaClient;
  constructor(protected prismaFactory: IPrismaFactory) {
    this.prismaWithoutRedisService = this.prismaFactory.create({
      withRedis: false,
    });
    this.prismaWithRedisService = this.prismaFactory.create({
      withRedis: true,
    });
  }

  getPrismaService(cashingConfig?: PrismaCashingConfig) {
    const { withRedis = false } = cashingConfig || {};
    return withRedis
      ? this.prismaWithRedisService
      : this.prismaWithoutRedisService;
  }

  infoToPrismaCashingConfig(info?: GraphQLResolveInfo) {
    return {
      withRedis: info ? info.operation.operation === 'query' : false,
    };
  }

  createEntityAndClearCache<T, Entity>(
    collection: string,
    createArgs: T,
    clearCashingConfig?: {
      patterns?: Array<any>;
      collection?: string[];
    },
  ): Promise<Entity> {
    const prismaService = this.prismaWithRedisService;
    if (process.env.NODE_ENV === 'test') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      return prismaService[collection].create<Entity>({
        ...createArgs,
      });
    }
    const { patterns, collection: clearCollection } = clearCashingConfig || {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    return prismaService[collection].create<Entity>({
      ...createArgs,
      /***
       ts does not work properly because of this issue
       - https://github.com/yxx4c/prisma-extension-redis/issues/58
       **/
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      uncache: {
        uncacheKeys: [
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          prismaService.getKeyPattern({
            params: [
              {
                prisma:
                  collection.charAt(0).toUpperCase() + collection.slice(1),
              },
              { glob: '*' },
            ],
          }),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          ...(clearCollection || []).map((name) =>
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-return
            prismaService.getKeyPattern({
              params: [
                {
                  prisma: name,
                },
                { glob: '*' },
              ],
            }),
          ),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          ...(patterns || []).map((pattern) =>
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-return
            prismaService.getKeyPattern(pattern),
          ),
        ],
        hasPattern: true,
      },
    });
  }

  updateEntityAndClearCache<T, Entity>(
    collection: string,
    updateArgs: T,
    clearCashingConfig?: {
      patterns?: Array<any>;
      collection?: string[];
    },
  ): Promise<Entity> {
    const prismaService = this.prismaWithRedisService;
    if (process.env.NODE_ENV === 'test') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      return prismaService[collection].update<Entity>(updateArgs);
    }
    const { patterns, collection: clearCollection } = clearCashingConfig || {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    return prismaService[collection].update<Entity>({
      ...updateArgs,
      /***
       ts does not work properly because of this issue
       - https://github.com/yxx4c/prisma-extension-redis/issues/58
       **/
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      uncache: {
        uncacheKeys: [
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          prismaService.getKeyPattern({
            params: [
              {
                prisma:
                  collection.charAt(0).toUpperCase() + collection.slice(1),
              },
              { glob: '*' },
            ],
          }),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          ...(clearCollection || []).map((name) =>
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-return
            prismaService.getKeyPattern({
              params: [
                {
                  prisma: name,
                },
                { glob: '*' },
              ],
            }),
          ),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          ...(patterns || []).map((pattern) =>
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-return
            prismaService.getKeyPattern(pattern),
          ),
        ],
        hasPattern: true,
      },
    });
  }
}
