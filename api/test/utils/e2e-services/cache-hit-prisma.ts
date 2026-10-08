import { PrismaService } from '../../../src/prisma/prisma.service';
import { config } from '../../../src/prisma/prisma.caching';
import { PrismaAdapterMockFactory } from '../mock-services/prisma.adapter.factory';

// Test env has no Redis (`prisma.module.ts` hands out a plain client), so no spec ever reads a cached result. This
// factory answers every read the way the Redis query cache returns it on a hit: through the cache's own transformer
// (`prisma.caching.ts`). Plain JSON there would return a Date as a string and bytes as `{ "0": 1, ... }`.
export const cacheHitPrismaFactory = (
  adapterFactory: PrismaAdapterMockFactory,
) => {
  // The transformer the real config hands to the extension, so removing it there fails the specs that use this.
  const { transformer } = config;
  if (!transformer) {
    throw new Error('prisma.caching.ts config has no cache transformer');
  }
  return {
    create: () =>
      new PrismaService(adapterFactory).$extends({
        query: {
          $allModels: {
            $allOperations: async ({ args, query }) =>
              transformer.deserialize(transformer.serialize(await query(args))),
          },
        },
      }),
  };
};
