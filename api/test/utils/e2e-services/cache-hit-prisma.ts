import { PrismaService } from '../../../src/prisma/prisma.service';
import { cacheTransformer } from '../../../src/prisma/prisma.cache-transformer';
import { PrismaAdapterMockFactory } from '../mock-services/prisma.adapter.factory';

// Test env has no Redis (`prisma.module.ts` hands out a plain client), so no spec ever reads a cached result. This
// factory answers every read the way the Redis query cache returns it on a hit: through the cache's own transformer
// (`prisma.caching.ts`). Plain JSON there would return a Date as a string and a Buffer as `{ type, data }`.
export const cacheHitPrismaFactory = (
  adapterFactory: PrismaAdapterMockFactory,
) => ({
  create: () =>
    new PrismaService(adapterFactory).$extends({
      query: {
        $allModels: {
          $allOperations: async ({ args, query }) =>
            cacheTransformer.deserialize(
              cacheTransformer.serialize(await query(args)),
            ),
        },
      },
    }),
});
