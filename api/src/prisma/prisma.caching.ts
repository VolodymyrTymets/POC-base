// import { SuperJSON } from 'superjson';
import { type AutoCacheConfig, type CacheConfig } from 'prisma-extension-redis';

export const auto: AutoCacheConfig = {
  excludedModels: ['Migration'],
  ttl: 30, // Default TTL for cache in seconds
  models: [
    // add each model you want to cache here
    // {
    //   model: 'NAME',
    //   ttl: 60,
    // },
  ],
};

export const config: CacheConfig = {
  ttl: 60, // Default Time-to-live for caching in seconds
  stale: 30, // Default Stale time after ttl in seconds
  auto, // Auto-caching options (configured above)
  // transformer: {
  //   // Custom serialize and deserialize function for additional functionality if required
  //   deserialize: (data) => SuperJSON.parse(data as string),
  //   serialize: (data) => SuperJSON.stringify(data),
  // },
  type: 'JSON', // Redis cache type, whether you prefer the data to be stored as JSON or STRING in Redis
  cacheKey: {
    delimiter: '*', // Delimiter for keys (default value: ':')
    prefix: 'prisma', // Cache key prefix (default value: 'prisma')
  },
  onHit: (key: string) => {
    if (process.env.NODE_ENV === 'local') {
      console.log(`[SQL Caching] for: ${key}`);
    }
  },
};
