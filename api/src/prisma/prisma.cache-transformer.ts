import { Prisma } from '../../generated/prisma/client';

// The Redis query cache stores a result as JSON, which on its own turns a Date into an ISO string, a Decimal into a
// string and a Buffer into `{ type, data }`. A cache hit would then hand services different types than a miss does
// (`from.getTime is not a function`, `offerAmount.toNumber is not a function`). Each such value is tagged on the way
// in and rebuilt on the way out, so a hit and a miss are the same shape.
const TAG = '$cacheType';
type Tagged = { [TAG]: 'Date' | 'Decimal' | 'Bytes' | 'BigInt'; value: string };

const isTagged = (value: unknown): value is Tagged =>
  typeof value === 'object' &&
  value !== null &&
  TAG in value &&
  'value' in value;

export const cacheTransformer = {
  serialize: (data: unknown): string =>
    JSON.stringify(data, function (this: Record<string, unknown>, key, json) {
      // `this[key]` is the original: JSON.stringify calls toJSON before the replacer sees the value
      const raw = this[key];
      if (raw instanceof Date) {
        return { [TAG]: 'Date', value: raw.toISOString() } satisfies Tagged;
      }
      if (Prisma.Decimal.isDecimal(raw)) {
        return { [TAG]: 'Decimal', value: raw.toString() } satisfies Tagged;
      }
      if (raw instanceof Uint8Array) {
        return {
          [TAG]: 'Bytes',
          value: Buffer.from(raw).toString('base64'),
        } satisfies Tagged;
      }
      if (typeof raw === 'bigint') {
        return { [TAG]: 'BigInt', value: raw.toString() } satisfies Tagged;
      }
      return json as unknown;
    }),
  deserialize: (data: unknown): unknown =>
    JSON.parse(String(data), (_key, json: unknown) => {
      if (!isTagged(json)) {
        return json;
      }
      switch (json[TAG]) {
        case 'Date':
          return new Date(json.value);
        case 'Decimal':
          return new Prisma.Decimal(json.value);
        case 'Bytes':
          return Buffer.from(json.value, 'base64');
        case 'BigInt':
          return BigInt(json.value);
      }
    }),
};
