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
    const result = roundTrip({ fee: new Prisma.Decimal('1234.56') }) as Record<
      string,
      unknown
    >;

    expect(Prisma.Decimal.isDecimal(result.fee)).toBe(true);
    expect(result.fee).toEqual(new Prisma.Decimal('1234.56'));
  });

  it('returns bytes and a bigint as themselves, and leaves plain values alone', () => {
    const value = {
      content: new Uint8Array([1, 2, 3]),
      count: 9007199254740993n,
      name: 'Kestrel',
      nested: [{ n: null, ok: true }],
    };

    expect(roundTrip(value)).toEqual(value);
  });

  it('returns bytes as a Uint8Array, as Prisma does on a miss', () => {
    const result = roundTrip({ content: new Uint8Array([1, 2, 3]) }) as {
      content: unknown;
    };

    expect(result.content).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.content as Uint8Array)).toEqual([1, 2, 3]);
  });

  it('throws on a tag this version did not write', () => {
    expect(() =>
      cacheTransformer.deserialize('{"$cacheType":"Unknown","value":"x"}'),
    ).toThrow('Unknown cache type tag');
  });
});
