import { Prisma } from '../../generated/prisma/client';
import { cacheTransformer } from './prisma.cache-transformer';

const roundTrip = (value: unknown) =>
  cacheTransformer.deserialize(cacheTransformer.serialize(value));

describe('cacheTransformer', () => {
  it('returns a Date as a Date, not an ISO string', () => {
    const at = new Date('2026-10-08T10:00:00.000Z');

    expect(roundTrip({ at })).toEqual({ at });
  });

  it('returns a Decimal as a Decimal, with its exact value', () => {
    const result = roundTrip({ fee: new Prisma.Decimal('1234.56') }) as {
      fee: Prisma.Decimal;
    };

    expect(Prisma.Decimal.isDecimal(result.fee)).toBe(true);
    expect(result.fee.toNumber()).toBe(1234.56);
  });

  it('returns bytes and a bigint as themselves, and leaves plain values alone', () => {
    const value = {
      content: Buffer.from([1, 2, 3]),
      count: 9007199254740993n,
      name: 'Kestrel',
      nested: [{ n: null, ok: true }],
    };

    expect(roundTrip(value)).toEqual(value);
  });
});
